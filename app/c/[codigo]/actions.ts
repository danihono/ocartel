"use server";

// Server actions da confirmação de presença. Mesmo padrão do booking público
// (app/book/[slug]/actions.ts): rodam no servidor com o Admin SDK, que valida
// tudo aqui e ignora as regras de segurança — assim a coleção `agendamentos`
// continua privada, sem nenhuma leitura ou escrita pública no Firestore.
//
// O que autoriza a ação é o token do link, comparado contra o gravado no doc.

import { adminDb } from "@/lib/firebase/admin";
import { lerCodigo, tokenConfere } from "@/lib/confirmacao";
import type { AgendamentoStatus } from "@/lib/types";

export interface Confirmacao {
  barbearia: string;
  cliente: string;
  servico: string;
  profissional: string;
  dateISO: string;
  inicio: string;
  duracaoMin: number;
  status: AgendamentoStatus;
  /** O cliente já respondeu por este link alguma vez. */
  jaRespondeu: boolean;
}

export interface ConfirmacaoResult {
  ok: boolean;
  error?: string;
  dados?: Confirmacao;
}

const LINK_INVALIDO = "Este link não é válido. Confira a mensagem que a barbearia enviou.";
const GENERICO = "Não foi possível carregar seu agendamento. Tente de novo em instantes.";

/** "YYYY-MM-DD" de hoje no fuso do servidor (mesma abordagem do booking-core). */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Resolve o código do link até o doc do agendamento, já com o token conferido. */
async function resolver(codigo: string) {
  const partes = lerCodigo(codigo);
  if (!partes) return null;
  const ref = adminDb
    .collection("tenants")
    .doc(partes.tenantId)
    .collection("agendamentos")
    .doc(partes.agendamentoId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const ag = snap.data()!;
  if (typeof ag.confirmToken !== "string" || !tokenConfere(ag.confirmToken, partes.token)) return null;
  // Bloqueio não é agendamento de cliente — não deve ter página nenhuma.
  if (ag.status === "bloqueio") return null;
  return { ref, ag, tenantId: partes.tenantId };
}

/** Monta o resumo mostrado ao cliente (nome da barbearia, serviço, profissional). */
async function montarDados(tenantId: string, ag: FirebaseFirestore.DocumentData): Promise<Confirmacao> {
  const tenantRef = adminDb.collection("tenants").doc(tenantId);
  const [tenantSnap, barbeiroSnap] = await Promise.all([
    tenantRef.get(),
    ag.barbeiroId ? tenantRef.collection("barbeiros").doc(String(ag.barbeiroId)).get() : Promise.resolve(null),
  ]);
  return {
    barbearia: String(tenantSnap.data()?.nome ?? "a barbearia"),
    cliente: String(ag.clienteNome ?? ""),
    servico: String(ag.servico ?? ""),
    profissional: String(barbeiroSnap?.data()?.nome ?? ""),
    dateISO: String(ag.date ?? ""),
    inicio: String(ag.inicio ?? ""),
    duracaoMin: typeof ag.duracaoMin === "number" ? ag.duracaoMin : 30,
    status: (ag.status ?? "agendado") as AgendamentoStatus,
    jaRespondeu: ag.confirmadoPeloCliente === true,
  };
}

export async function carregarConfirmacao(codigo: string): Promise<ConfirmacaoResult> {
  try {
    const alvo = await resolver(codigo);
    if (!alvo) return { ok: false, error: LINK_INVALIDO };
    return { ok: true, dados: await montarDados(alvo.tenantId, alvo.ag) };
  } catch {
    return { ok: false, error: GENERICO };
  }
}

export type Resposta = "confirmar" | "recusar";

/**
 * Aplica a resposta do cliente. O cliente NÃO é fonte de verdade: o status
 * atual e a data mandam mais que o que veio da tela.
 */
export async function responderConfirmacao(codigo: string, resposta: Resposta): Promise<ConfirmacaoResult> {
  if (resposta !== "confirmar" && resposta !== "recusar") return { ok: false, error: LINK_INVALIDO };

  try {
    const alvo = await resolver(codigo);
    if (!alvo) return { ok: false, error: LINK_INVALIDO };
    const { ref, ag, tenantId } = alvo;
    const status = (ag.status ?? "agendado") as AgendamentoStatus;

    if (String(ag.date ?? "") < hojeISO()) {
      return { ok: false, error: "Esse horário já passou. Fale com a barbearia para remarcar." };
    }
    if (status === "concluido" || status === "atendimento") {
      return { ok: false, error: "Esse atendimento já começou. Fale com a barbearia." };
    }
    if (status === "cancelado" || status === "noshow") {
      return { ok: false, error: "Esse horário não está mais ativo. Fale com a barbearia para remarcar." };
    }

    const novoStatus: AgendamentoStatus = resposta === "confirmar" ? "confirmado" : "cancelado";
    // Confirmar de novo é idempotente — não reescreve o horário da 1ª resposta.
    if (!(status === novoStatus && ag.confirmadoPeloCliente === true)) {
      await ref.update({
        status: novoStatus,
        confirmadoPeloCliente: true,
        respondidoEm: new Date().toISOString(),
      });
    }

    const atualizado = { ...ag, status: novoStatus, confirmadoPeloCliente: true };
    return { ok: true, dados: await montarDados(tenantId, atualizado) };
  } catch {
    return { ok: false, error: "Não foi possível registrar sua resposta. Tente de novo." };
  }
}
