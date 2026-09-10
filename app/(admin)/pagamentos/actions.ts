"use server";

// Server actions da tela de Pagamentos.
//
// Uma só, e ela existe por causa de uma decisão de produto: quem tem cartão salvo NÃO
// recebe boleto automático quando o cartão recusa. A cobrança fica pendente e destacada
// no painel, e é a dona que decide caso a caso — pode ser que o cliente vá pagar por Pix,
// pode ser que ela prefira cobrar na próxima visita. Este é o botão que fecha esse
// caminho: emitir o boleto na hora, quando ela quiser.
//
// Roda no servidor porque emitir boleto exige a chave do gateway (que vive em
// `private/asaas`, longe do navegador) e escrever a trava `boleto` na transação, que as
// regras do Firestore proíbem o navegador de tocar.

import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { canalDoTenant, WhatsAppNaoConfigurado } from "@/lib/canal";
import { cobradorDoTenant, CobradorNaoConfigurado } from "@/lib/cobrador";
import { montarReferencia, vencimentoBoleto, PADRAO_DIAS_VENCIMENTO_BOLETO } from "@/lib/cobranca-ciclo";
import { mensagemBoleto } from "@/lib/cobranca-mensagem";
import { normalizarCpf, telefoneWhatsApp, validarCpf } from "@/lib/clientes-import";
import type { Cliente, Transacao } from "@/lib/types";

/** "YYYY-MM-DD" de hoje — mesma abordagem do booking-core. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Emite o boleto desta cobrança agora, a pedido da dona.
 *
 * As travas são as MESMAS do ciclo automático — `boleto` já presente barra a segunda
 * emissão, cobrança paga não gera boleto. Um botão que ignorasse as travas do ciclo seria
 * o caminho mais curto para dois boletos no CPF da mesma pessoa.
 */
export async function acaoEmitirBoleto(
  idToken: string,
  tenantId: string,
  transacaoId: string,
): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);

    const ref = adminDb.doc(`tenants/${tenantId}/transacoes/${transacaoId}`);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, erro: "Cobrança não encontrada." };

    const t = { ...(snap.data() as object), id: transacaoId } as Transacao;
    if (t.status === "pago" || t.paidAt) return { ok: false, erro: "Esta cobrança já está paga." };
    if (t.boleto) return { ok: false, erro: "Já existe um boleto emitido para esta cobrança." };

    const clienteId = t.clienteId;
    if (!clienteId) return { ok: false, erro: "Esta cobrança não está vinculada a um cliente." };

    const [clienteSnap, configSnap] = await Promise.all([
      adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).get(),
      adminDb.doc(`tenants/${tenantId}/config/main`).get(),
    ]);
    if (!clienteSnap.exists) return { ok: false, erro: "Cliente não encontrado." };

    const cliente = { ...(clienteSnap.data() as object), id: clienteId } as Cliente;
    const cpf = normalizarCpf(cliente.cpf ?? "");
    if (!validarCpf(cpf)) {
      return { ok: false, erro: "O cadastro deste cliente não tem CPF válido — sem CPF não existe boleto." };
    }

    let gateway;
    try {
      gateway = await cobradorDoTenant(tenantId);
    } catch (err) {
      if (err instanceof CobradorNaoConfigurado) {
        return { ok: false, erro: "Cadastre a chave do Asaas em Configurações antes de emitir boleto." };
      }
      throw err;
    }

    const nomeBarbearia = String(configSnap.data()?.nome ?? "");
    const dias = Number(configSnap.data()?.cobranca?.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO);

    const asaasId =
      cliente.asaasId ||
      (await gateway.garantirCliente({
        nome: cliente.nome,
        cpf,
        email: cliente.email || undefined,
        telefone: telefoneWhatsApp(cliente.telefone ?? "") ?? undefined,
      }));
    if (!cliente.asaasId) {
      await adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).set({ asaasId }, { merge: true });
    }

    const emitido = await gateway.emitirBoleto({
      clienteExterno: asaasId,
      valor: t.amount ?? t.valor,
      vencimentoISO: vencimentoBoleto(hojeISO(), dias),
      descricao: `${t.servico} · ${nomeBarbearia}`,
      referencia: montarReferencia(tenantId, transacaoId),
    });

    // Gravar ANTES de mandar a mensagem: o boleto já existe no gateway, e perder o vínculo
    // aqui significaria um segundo boleto na próxima tentativa. Mesma ordem do ciclo.
    await ref.set(
      {
        boleto: {
          provedor: "asaas",
          cobrancaId: emitido.cobrancaId,
          url: emitido.url,
          linhaDigitavel: emitido.linhaDigitavel,
          vencimentoISO: emitido.vencimentoISO,
          emitidoEm: new Date().toISOString(),
        },
      },
      { merge: true },
    );

    // O WhatsApp é o melhor esforço: o boleto já existe e aparece na tela de qualquer
    // forma. Sem vínculo, a dona manda o link na mão.
    const telefone = telefoneWhatsApp(cliente.telefone ?? "");
    if (telefone && t.dueDate) {
      try {
        const canal = await canalDoTenant(tenantId);
        await canal.enviarMensagem(
          telefone,
          mensagemBoleto({
            cliente: cliente.nome,
            barbearia: nomeBarbearia,
            plano: t.servico,
            valor: t.amount ?? t.valor,
            vencimentoISO: t.dueDate,
            linkBoleto: emitido.url,
            linhaDigitavel: emitido.linhaDigitavel,
            vencimentoBoletoISO: emitido.vencimentoISO,
          }),
        );
      } catch (err) {
        if (!(err instanceof WhatsAppNaoConfigurado)) throw err;
      }
    }

    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}
