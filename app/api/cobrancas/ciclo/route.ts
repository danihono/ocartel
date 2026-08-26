// Ciclo automático de cobrança — chamado por um agendador externo (timer na VPS), de hora
// em hora. A rota é que decide QUAIS barbearias rodam naquela hora, olhando a config de
// cada uma: assim um único agendador atende todas, sem cron por barbearia. Mesmo desenho
// de `/api/confirmacoes/disparar`.
//
// Três etapas, nesta ordem, por barbearia:
//   1. gera as mensalidades que faltam no mês (idempotente);
//   2. avisa por WhatsApp quem vence em N dias;
//   3. emite boleto no CPF de quem venceu e não pagou, e manda o link.
//
// Protegida por segredo compartilhado. Não é rota de usuário.

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { canalDoTenant, WhatsAppNaoConfigurado, type Canal } from "@/lib/canal";
import { cobradorDoTenant, CobradorNaoConfigurado, type Cobrador } from "@/lib/cobrador";
import { telefoneWhatsApp, normalizarCpf, validarCpf } from "@/lib/clientes-import";
import { mensagemBoleto, mensagemRenovacao } from "@/lib/cobranca-mensagem";
import {
  agoraEmBrasilia,
  deveAlertar,
  deveDispararAgora,
  deveEmitirBoleto,
  mensalidadesAGerar,
  montarReferencia,
  vencimentoBoleto,
  PADRAO_DIAS_ANTES_ALERTA,
  PADRAO_DIAS_VENCIMENTO_BOLETO,
} from "@/lib/cobranca-ciclo";
import { ehDoCliente } from "@/lib/selectors";
import type { Cliente, CobrancaAutomatica, Plano, Transacao } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Resultado {
  tenantId: string;
  mensalidadesGeradas: number;
  alertas: number;
  boletos: number;
  falhas: number;
  /** Venceu, não pagou, mas o cadastro não tem CPF válido — boleto impossível. */
  semCpf: number;
  /** Marcado como assinante, mas o plano não existe mais no cadastro. */
  semPlano: number;
  /** O que ficou de fora e por quê (sem WhatsApp vinculado, sem gateway, erro). */
  avisos?: string[];
}

export async function POST(req: Request) {
  const segredo = process.env.COBRANCAS_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "COBRANCAS_SECRET não configurado." }, { status: 500 });
  }
  if (req.headers.get("x-cobrancas-secret") !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const { dataISO, hora } = agoraEmBrasilia();

  const tenants = await adminDb.collection("tenants").get();
  const resultados: Resultado[] = [];

  for (const tenantDoc of tenants.docs) {
    const tenantId = tenantDoc.id;
    const configSnap = await adminDb.doc(`tenants/${tenantId}/config/main`).get();
    const config = configSnap.data() ?? {};
    const cobranca = config.cobranca as CobrancaAutomatica | undefined;

    if (!deveDispararAgora(cobranca, hora)) continue;

    try {
      resultados.push(
        await rodarTenant({ tenantId, nomeBarbearia: String(config.nome ?? ""), dataISO, cobranca: cobranca! }),
      );
    } catch (err) {
      resultados.push({ ...vazio(tenantId), avisos: [String(err)] });
    }
  }

  return NextResponse.json({ dataISO, hora, tenants: resultados });
}

function vazio(tenantId: string): Resultado {
  return { tenantId, mensalidadesGeradas: 0, alertas: 0, boletos: 0, falhas: 0, semCpf: 0, semPlano: 0 };
}

function docs<T>(snap: FirebaseFirestore.QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as T[];
}

/**
 * As cobranças que interessam ao ciclo, sem varrer o histórico inteiro:
 *   - tudo que vence NESTE mês (paga ou não) — é o que impede gerar mensalidade duplicada;
 *   - tudo que continua em aberto de meses anteriores — é o que ainda merece boleto.
 * Um doc que caia nas duas pontas entra uma vez só.
 */
async function cobrancasRelevantes(tenantId: string, cicloMes: string): Promise<Transacao[]> {
  const col = adminDb.collection(`tenants/${tenantId}/transacoes`);
  const [doMes, emAberto] = await Promise.all([
    col.where("dueDate", ">=", `${cicloMes}-01`).get(),
    col.where("status", "in", ["pendente", "atrasado"]).get(),
  ]);

  const porId = new Map<string, Transacao>();
  for (const t of [...docs<Transacao>(doMes), ...docs<Transacao>(emAberto)]) porId.set(t.id, t);
  return [...porId.values()];
}

async function rodarTenant(params: {
  tenantId: string;
  nomeBarbearia: string;
  dataISO: string;
  cobranca: CobrancaAutomatica;
}): Promise<Resultado> {
  const { tenantId, nomeBarbearia, dataISO, cobranca } = params;
  const cicloMes = dataISO.slice(0, 7);
  const r = vazio(tenantId);

  const [clientesSnap, planosSnap, transacoes] = await Promise.all([
    adminDb.collection(`tenants/${tenantId}/clientes`).get(),
    adminDb.collection(`tenants/${tenantId}/planos`).get(),
    cobrancasRelevantes(tenantId, cicloMes),
  ]);
  const clientes = docs<Cliente>(clientesSnap);
  const planos = docs<Plano>(planosSnap);

  // ---- 1. Mensalidades que faltam no ciclo ----
  const { novas, semPlano } = mensalidadesAGerar({ clientes, planos, transacoes }, cicloMes);
  r.semPlano = semPlano;

  const col = adminDb.collection(`tenants/${tenantId}/transacoes`);
  if (novas.length > 0) {
    const batch = adminDb.batch();
    const criadas: Transacao[] = [];
    for (const nova of novas) {
      const ref = col.doc();
      batch.set(ref, { ...nova, createdAt: new Date().toISOString() });
      criadas.push({ ...nova, id: ref.id });
    }
    await batch.commit();
    r.mensalidadesGeradas = criadas.length;
    // Uma mensalidade criada hoje que já vence hoje precisa entrar nas etapas seguintes na
    // MESMA rodada — senão o boleto dela só sairia amanhã.
    transacoes.push(...criadas);
  }

  // Os canais são resolvidos sob demanda: uma barbearia sem WhatsApp ainda emite boleto, e
  // uma sem gateway ainda avisa os clientes. Uma coisa não pode derrubar a outra.
  let canal: Canal | null | undefined;
  const pegarCanal = async (): Promise<Canal | null> => {
    if (canal === undefined) {
      try {
        canal = await canalDoTenant(tenantId);
      } catch (err) {
        canal = null;
        if (!(err instanceof WhatsAppNaoConfigurado)) throw err;
      }
    }
    return canal;
  };

  let cobrador: Cobrador | null | undefined;
  const pegarCobrador = async (): Promise<Cobrador | null> => {
    if (cobrador === undefined) {
      try {
        cobrador = await cobradorDoTenant(tenantId);
      } catch (err) {
        cobrador = null;
        if (!(err instanceof CobradorNaoConfigurado)) throw err;
      }
    }
    return cobrador;
  };

  const avisar = (texto: string) => {
    r.avisos = [...(r.avisos ?? []), texto];
  };

  const clienteDa = (t: Transacao): Cliente | undefined => clientes.find((c) => ehDoCliente(t, c));
  const diasAntes = cobranca.diasAntesAlerta ?? PADRAO_DIAS_ANTES_ALERTA;

  // ---- 2. Aviso de renovação (D-N) ----
  for (const t of transacoes) {
    if (!deveAlertar(t, dataISO, diasAntes)) continue;

    const cliente = clienteDa(t);
    const telefone = telefoneWhatsApp(cliente?.telefone ?? "");
    if (!cliente || !telefone) continue; // sem número utilizável — nada a fazer

    const zap = await pegarCanal();
    if (!zap) {
      // Sem WhatsApp vinculado nenhum alerta sai, e não adianta tentar os próximos. Os
      // BOLETOS seguem normalmente — uma coisa não derruba a outra.
      avisar("sem WhatsApp vinculado: alertas não enviados");
      break;
    }

    try {
      await zap.enviarMensagem(
        telefone,
        mensagemRenovacao({
          cliente: cliente.nome,
          barbearia: nomeBarbearia,
          plano: t.servico,
          valor: t.amount ?? t.valor,
          vencimentoISO: t.dueDate!,
        }),
      );
      // Só marca DEPOIS do envio: marcar antes faria uma falha de rede virar cliente que
      // nunca é avisado, silenciosamente.
      await col.doc(t.id).set({ alertaEnviadoEm: new Date().toISOString() }, { merge: true });
      r.alertas += 1;
    } catch {
      // Uma falha não interrompe a fila. Como `alertaEnviadoEm` continua ausente, a janela
      // de retentativa (horas seguintes) pega este de novo.
      r.falhas += 1;
    }
  }

  // ---- 3. Boleto para quem venceu e não pagou ----
  if (!cobranca.emitirBoleto) return r;

  // Os candidatos são separados ANTES de tocar no gateway, de propósito. Contar `semCpf`
  // só depois de resolver o cobrador esconderia justamente o diagnóstico de quem ainda não
  // configurou o gateway — que é exatamente quem está montando tudo agora e precisa saber
  // que dois cadastros estão sem CPF.
  const candidatos: { t: Transacao; cliente: Cliente; cpf: string }[] = [];
  for (const t of transacoes) {
    if (!deveEmitirBoleto(t, dataISO)) continue;

    const cliente = clienteDa(t);
    const cpf = normalizarCpf(cliente?.cpf ?? "");
    if (!cliente || !validarCpf(cpf)) {
      // Sem CPF válido não existe boleto. Não é falha do sistema: é cadastro incompleto, e
      // a barbearia precisa ver isso no diagnóstico (e no painel) para arrumar.
      r.semCpf += 1;
      continue;
    }
    candidatos.push({ t, cliente, cpf });
  }

  if (candidatos.length === 0) return r;

  const gateway = await pegarCobrador();
  if (!gateway) {
    avisar("sem gateway de cobrança configurado");
    return r;
  }

  for (const { t, cliente, cpf } of candidatos) {
    try {
      const asaasId =
        cliente.asaasId ||
        (await gateway.garantirCliente({
          nome: cliente.nome,
          cpf,
          email: cliente.email || undefined,
          telefone: telefoneWhatsApp(cliente.telefone ?? "") ?? undefined,
        }));

      if (!cliente.asaasId) {
        await adminDb.doc(`tenants/${tenantId}/clientes/${cliente.id}`).set({ asaasId }, { merge: true });
        cliente.asaasId = asaasId;
      }

      const vencISO = vencimentoBoleto(dataISO, cobranca.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO);
      const emitido = await gateway.emitirBoleto({
        clienteExterno: asaasId,
        valor: t.amount ?? t.valor,
        vencimentoISO: vencISO,
        descricao: `${t.servico} · ${nomeBarbearia}`,
        referencia: montarReferencia(tenantId, t.id),
      });

      // Gravar ANTES de mandar a mensagem: o boleto já existe no gateway, e perder o
      // vínculo aqui significaria emitir um segundo na próxima rodada.
      await col.doc(t.id).set(
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
      r.boletos += 1;

      const zap = await pegarCanal();
      const telefone = telefoneWhatsApp(cliente.telefone ?? "");
      if (zap && telefone) {
        await zap.enviarMensagem(
          telefone,
          mensagemBoleto({
            cliente: cliente.nome,
            barbearia: nomeBarbearia,
            plano: t.servico,
            valor: t.amount ?? t.valor,
            vencimentoISO: t.dueDate!,
            linkBoleto: emitido.url,
            linhaDigitavel: emitido.linhaDigitavel,
            vencimentoBoletoISO: emitido.vencimentoISO,
          }),
        );
      }
    } catch {
      r.falhas += 1;
    }
  }

  return r;
}
