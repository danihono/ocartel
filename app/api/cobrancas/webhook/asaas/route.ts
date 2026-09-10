// Baixa automática — o Asaas avisa aqui quando uma cobrança é paga, e a cobrança fica
// "Pago" sozinha. É a ponta que fecha o ciclo: ninguém precisa clicar em "Registrar
// pagamento" para o dinheiro que entra pelo gateway.
//
// A rota é PÚBLICA (o Asaas precisa alcançá-la), então a autenticação é o token que ele
// devolve no header `asaas-access-token`, comparado com o que a barbearia guardou em
// `tenants/{id}/private/asaas`. Sem isso, quem descobrisse a URL marcaria qualquer
// cobrança como paga.
//
// Além da baixa, esta rota faz três coisas que só existem por causa do cartão:
//
//   1. CAPTURA o token do cartão depois que o cliente pagou na página do Asaas — é o
//      único momento em que ele aparece, e sem ele a recorrência nunca começa;
//   2. registra a recusa ASSÍNCRONA (a que o `POST` não pega, porque a análise de risco
//      ou a captura falham depois);
//   3. REVERTE a baixa em estorno e chargeback — dinheiro que voltou não pode continuar
//      contando como mensalidade paga.

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { canalDoTenant, WhatsAppNaoConfigurado } from "@/lib/canal";
import { cobradorDoTenant, credenciaisDoTenant, CobradorNaoConfigurado } from "@/lib/cobrador";
import {
  garantirLinkToken,
  lerCartao,
  registrarFalhaCartao,
  removerCartao,
  salvarCartao,
} from "@/lib/cobrador/cartoes";
import { lerReferencia } from "@/lib/cobranca-ciclo";
import { linkCartao, montarCodigoCartao } from "@/lib/cartao-link";
import { mensagemCartaoCadastrado } from "@/lib/cobranca-mensagem";
import { tokenConfere } from "@/lib/confirmacao";
import { telefoneWhatsApp } from "@/lib/clientes-import";
import { diaVencimentoCliente } from "@/lib/selectors";
import type { Cliente, FormaPagamento, Plano } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Eventos em que o dinheiro já é da barbearia. `PENDING`/`CREATED` não dão baixa. */
const EVENTOS_DE_BAIXA = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

/**
 * Recusa que chega DEPOIS da resposta do `POST`: a captura no emissor falhou, ou a
 * análise de risco reprovou. Não mexe no status da cobrança — ela continua em aberto —,
 * só marca a tentativa como recusada e conta a falha do cartão.
 */
const EVENTOS_DE_RECUSA = new Set(["PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS"]);

/** O dinheiro voltou. A baixa tem que ser desfeita. */
const EVENTOS_DE_ESTORNO = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

/** Contestação aberta e ainda em análise: registra, mas não mexe no dinheiro. */
const EVENTOS_DE_DISPUTA = new Set(["PAYMENT_CHARGEBACK_DISPUTE"]);

/** Chargeback: o cartão foi contestado e não pode ser cobrado outra vez. */
const EVENTOS_DE_CHARGEBACK = new Set(["PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"]);

/**
 * A `forma` sai do meio de pagamento que o gateway informa, e não fixa em "boleto".
 * Antes era fixa, e isso já mentia hoje: quem pagasse o boleto via Pix na página do
 * Asaas aparecia como boleto na tela de Pagamentos.
 */
const FORMA_POR_BILLING: Record<string, FormaPagamento> = {
  BOLETO: "boleto",
  CREDIT_CARD: "cartao",
  DEBIT_CARD: "cartao_debito",
  PIX: "pix",
  UNDEFINED: "boleto",
};

interface EventoAsaas {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    billingType?: string;
    externalReference?: string;
    paymentDate?: string;
    clientPaymentDate?: string;
    confirmedDate?: string;
  };
}

export async function POST(req: Request) {
  let corpo: EventoAsaas;
  try {
    corpo = (await req.json()) as EventoAsaas;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const ref = lerReferencia(corpo.payment?.externalReference ?? "");
  if (!ref) {
    // Sem referência não há como saber de quem é o pagamento. 200 de propósito: devolver
    // erro faria o Asaas reenfileirar para sempre um evento que nunca vai ser processável
    // (ex.: cobrança criada à mão no painel dele).
    return NextResponse.json({ ignorado: "sem externalReference reconhecível" });
  }

  let webhookToken: string | undefined;
  try {
    webhookToken = (await credenciaisDoTenant(ref.tenantId)).webhookToken;
  } catch (err) {
    if (err instanceof CobradorNaoConfigurado) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
    throw err;
  }

  // Sem token configurado a rota RECUSA — não é o mesmo que "liberar quando não há senha".
  const enviado = req.headers.get("asaas-access-token") ?? "";
  if (!webhookToken || !tokenConfere(enviado, webhookToken)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const evento = String(corpo.event ?? "");
  const docRef = adminDb.doc(`tenants/${ref.tenantId}/transacoes/${ref.transacaoId}`);
  const snap = await docRef.get();
  if (!snap.exists) return NextResponse.json({ ignorado: "cobrança inexistente" });
  const atual = snap.data() ?? {};

  // O roteamento vem ANTES da guarda de "já estava pago". Na ordem contrária, um estorno
  // sobre cobrança paga — que é o único caso em que estorno existe — seria descartado em
  // silêncio, e a barbearia continuaria vendo mensalidade paga com o dinheiro devolvido.
  if (EVENTOS_DE_ESTORNO.has(evento)) {
    return await reverterBaixa(ref, docRef, atual, evento);
  }
  if (EVENTOS_DE_DISPUTA.has(evento)) {
    await docRef.set({ estornoMotivo: evento }, { merge: true });
    if (EVENTOS_DE_CHARGEBACK.has(evento) && atual.clienteId) {
      await removerCartao(ref.tenantId, String(atual.clienteId), "chargeback");
    }
    return NextResponse.json({ ok: true, disputa: evento });
  }
  if (EVENTOS_DE_RECUSA.has(evento)) {
    return await registrarRecusa(ref, docRef, atual, evento);
  }
  if (!EVENTOS_DE_BAIXA.has(evento)) {
    return NextResponse.json({ ignorado: evento || null });
  }

  // Reprocessar o mesmo evento de baixa é seguro: o Asaas reenvia quando não recebe 200,
  // e uma cobrança já quitada não pode ter a data do pagamento reescrita.
  if (atual.status === "pago") return NextResponse.json({ ok: true, jaEstavaPago: true });

  const pagamento = corpo.payment ?? {};
  const paidAt = pagamento.paymentDate ?? pagamento.clientPaymentDate ?? pagamento.confirmedDate;
  const billing = String(pagamento.billingType ?? "");
  const forma = FORMA_POR_BILLING[billing] ?? "boleto";

  await docRef.set(
    {
      status: "pago",
      // Os três campos que a tela e a auditoria exigem para um "pago" — os mesmos que
      // `transacaoUpdateValida()` cobra nas regras do Firestore.
      paidAt: paidAt ?? new Date().toISOString().slice(0, 10),
      amountReceived: typeof pagamento.value === "number" ? pagamento.value : (atual.amount ?? atual.valor ?? 0),
      forma,
      source: "gateway",
      confirmedBy: "Asaas (automático)",
      ...(atual.cartaoCobranca?.situacao === "enviando"
        ? {
            // Fecha a trava do cartão: se a baixa chegou, a cobrança que estava em voo
            // passou. Sem isto a conciliação a marcaria como recusada mais tarde.
            cartaoCobranca: {
              ...atual.cartaoCobranca,
              situacao: "aprovada",
              cobrancaId: pagamento.id ?? atual.cartaoCobranca.cobrancaId,
              resolvidoEm: new Date().toISOString(),
            },
          }
        : {}),
    },
    { merge: true },
  );

  // NÃO incrementa `totalGasto`/`atendimentos` do cliente: esses contadores são de
  // atendimento concluído e têm um dono único (`repos.agendamentos.concluir`). Mensalidade
  // não passa por lá — e mexer nisso aqui faria a ficha do cliente contar corte que não houve.

  const capturado = await capturarCartao({
    tenantId: ref.tenantId,
    clienteId: atual.clienteId ? String(atual.clienteId) : "",
    cobrancaId: pagamento.id ?? "",
    billing,
    origin: process.env.NEXT_PUBLIC_APP_ORIGIN || new URL(req.url).origin,
  });

  return NextResponse.json({ ok: true, transacaoId: ref.transacaoId, forma, ...capturado });
}

/**
 * Desfaz a baixa de uma cobrança estornada.
 *
 * Volta para "pendente" e apaga `paidAt`/`amountReceived` — deixá-los para trás faria os
 * KPIs de "recebido este mês" contarem dinheiro que não está mais na conta. `estornadoEm`
 * fica gravado porque "voltou a pendente sozinha" sem explicação é o tipo de coisa que
 * ninguém consegue auditar depois.
 */
async function reverterBaixa(
  ref: { tenantId: string; transacaoId: string },
  docRef: FirebaseFirestore.DocumentReference,
  atual: FirebaseFirestore.DocumentData,
  evento: string,
) {
  await docRef.set(
    {
      status: "pendente",
      // APAGA, em vez de gravar null: o tipo diz que `paidAt` é string quando existe, e
      // um null ali viraria "01/01/1970" ou um crash na primeira tela que formatasse a
      // data. Deixar os campos para trás faria o KPI de "recebido este mês" contar
      // dinheiro que já voltou para o cliente.
      paidAt: FieldValue.delete(),
      amountReceived: FieldValue.delete(),
      estornadoEm: new Date().toISOString(),
      estornoMotivo: evento,
    },
    { merge: true },
  );

  // Chargeback é o cliente contestando no banco. Continuar debitando aquele cartão só
  // multiplicaria a contestação — e contestação em volume derruba a conta da barbearia
  // no gateway.
  if (EVENTOS_DE_CHARGEBACK.has(evento) && atual.clienteId) {
    await removerCartao(ref.tenantId, String(atual.clienteId), "chargeback");
  }

  return NextResponse.json({ ok: true, estornado: evento, transacaoId: ref.transacaoId });
}

/** Recusa assíncrona: a cobrança continua em aberto, e o cartão ganha uma falha. */
async function registrarRecusa(
  ref: { tenantId: string; transacaoId: string },
  docRef: FirebaseFirestore.DocumentReference,
  atual: FirebaseFirestore.DocumentData,
  evento: string,
) {
  await docRef.set(
    {
      cartaoCobranca: {
        ...(atual.cartaoCobranca ?? { provedor: "asaas", tentadoEm: new Date().toISOString() }),
        situacao: "recusada",
        motivo: evento,
        resolvidoEm: new Date().toISOString(),
      },
    },
    { merge: true },
  );

  if (atual.clienteId) {
    await registrarFalhaCartao(ref.tenantId, String(atual.clienteId), evento);
  }
  return NextResponse.json({ ok: true, recusado: evento, transacaoId: ref.transacaoId });
}

/**
 * Captura o token do cartão que acabou de pagar — o único momento em que ele existe.
 *
 * Nada aqui pode derrubar o 200: o pagamento JÁ foi baixado, e devolver erro faria o
 * Asaas reenviar um evento cujo efeito principal já aconteceu. Uma falha só significa
 * que a recorrência não começou ainda, e a rodada seguinte do ciclo tem outra chance.
 */
async function capturarCartao(p: {
  tenantId: string;
  clienteId: string;
  cobrancaId: string;
  billing: string;
  origin: string;
}): Promise<{ cartaoSalvo?: boolean; aviso?: string }> {
  if (p.billing !== "CREDIT_CARD" || !p.clienteId || !p.cobrancaId) return {};

  try {
    if (await lerCartao(p.tenantId, p.clienteId)) return {};

    const gateway = await cobradorDoTenant(p.tenantId);
    const cartao = await gateway.lerCartaoDaCobranca(p.cobrancaId);
    if (!cartao) {
      // Sintoma clássico de tokenização não liberada na conta do Asaas. Sem este aviso, o
      // recurso degradaria em silêncio para "cobrou uma vez e nunca mais".
      return { aviso: "gateway não devolveu token do cartão (tokenização liberada na conta?)" };
    }

    await salvarCartao(p.tenantId, p.clienteId, {
      token: cartao.token,
      clienteExterno: cartao.clienteExterno,
      bandeira: cartao.bandeira,
      ultimosDigitos: cartao.ultimosDigitos,
      cobrancaId: p.cobrancaId,
    });

    await avisarCartaoCadastrado(p, cartao.bandeira, cartao.ultimosDigitos);
    return { cartaoSalvo: true };
  } catch (err) {
    return { aviso: String(err) };
  }
}

/** Confirma pelo WhatsApp que o cartão ficou salvo, com o link para tirá-lo. */
async function avisarCartaoCadastrado(
  p: { tenantId: string; clienteId: string; origin: string },
  bandeira: string,
  ultimosDigitos: string,
): Promise<void> {
  const [clienteSnap, configSnap, planosSnap] = await Promise.all([
    adminDb.doc(`tenants/${p.tenantId}/clientes/${p.clienteId}`).get(),
    adminDb.doc(`tenants/${p.tenantId}/config/main`).get(),
    adminDb.collection(`tenants/${p.tenantId}/planos`).get(),
  ]);
  if (!clienteSnap.exists) return;

  const cliente = { ...(clienteSnap.data() as object), id: p.clienteId } as Cliente;
  const telefone = telefoneWhatsApp(cliente.telefone ?? "");
  if (!telefone) return;

  const plano = planosSnap.docs
    .map((d) => ({ ...(d.data() as object), id: d.id }) as Plano)
    .find((pl) => pl.id === cliente.planId);

  const token = await garantirLinkToken(p.tenantId, p.clienteId);
  const texto = mensagemCartaoCadastrado({
    cliente: cliente.nome,
    barbearia: String(configSnap.data()?.nome ?? ""),
    bandeira,
    ultimosDigitos,
    diaVencimento: diaVencimentoCliente(cliente, plano),
    link: linkCartao(p.origin, montarCodigoCartao({ tenantId: p.tenantId, clienteId: p.clienteId, token })),
  });

  try {
    const canal = await canalDoTenant(p.tenantId);
    await canal.enviarMensagem(telefone, texto);
  } catch (err) {
    // Sem WhatsApp vinculado o cartão continua salvo e cobrável. Uma coisa não derruba a
    // outra — mesma disciplina do ciclo.
    if (!(err instanceof WhatsAppNaoConfigurado)) throw err;
  }
}
