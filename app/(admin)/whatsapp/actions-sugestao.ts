"use server";

// Confirmar ou descartar o que o atendente automático sugeriu.
//
// A IA não marca nada. Ela grava uma sugestão, e é AQUI — depois de alguém clicar — que o
// agendamento nasce, pela mesma `criarAgendamentoValidado` do agendamento público. Isso
// não é só simetria: é a transação que recusa o horário se alguém o tiver tomado entre a
// sugestão e o clique.
//
// As duas telas (WhatsApp e Agenda) chamam estas mesmas actions.

import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/canal/autorizacao";
import { criarAgendamentoValidado } from "@/lib/booking-core";
import { canalDoTenant } from "@/lib/canal";
import { definirPausa } from "@/lib/ia/atender";
import { isoParaLabelLongo } from "@/lib/date";

export async function acaoConfirmarSugestao(
  idToken: string,
  tenantId: string,
  sugestaoId: string,
): Promise<Resultado & { agendamentoId?: string }> {
  try {
    await exigirQuemGerencia(idToken, tenantId);

    const ref = adminDb.doc(`tenants/${tenantId}/sugestoes/${sugestaoId}`);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, erro: "Sugestão não encontrada." };
    if (snap.get("status") !== "pendente") return { ok: false, erro: "Esta sugestão já foi resolvida." };

    const s = snap.data()!;
    const r = await criarAgendamentoValidado(adminDb.doc(`tenants/${tenantId}`), {
      barbeiroId: String(s.barbeiroId),
      servicoId: String(s.servicoId),
      date: String(s.date),
      inicio: String(s.inicio),
      clienteNome: String(s.clienteNome ?? ""),
      clienteTelefone: String(s.clienteTelefone ?? ""),
      // Cliente já conhecido entra por id: sem isso, quem foi importado de planilha
      // ganharia um segundo cadastro criado pelo telefone.
      ...(s.clienteId ? { clienteId: String(s.clienteId) } : {}),
      origem: "whatsapp",
    });

    // A sugestão continua pendente quando o horário foi tomado no meio do caminho — é
    // informação para a barbearia decidir, não motivo para jogar a intenção fora.
    if (!r.ok) return { ok: false, erro: r.error ?? "Não foi possível criar o agendamento." };

    await ref.set(
      { status: "confirmada", agendamentoId: r.agendamentoId, confirmadaEm: new Date().toISOString() },
      { merge: true },
    );

    // Avisa o cliente: quem pediu ficou com um "vou confirmar e te falo" em aberto.
    await avisarCliente(tenantId, s).catch(() => {});

    return { ok: true, agendamentoId: r.agendamentoId };
  } catch (err) {
    return comoResultado(err);
  }
}

export async function acaoDescartarSugestao(
  idToken: string,
  tenantId: string,
  sugestaoId: string,
): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    await adminDb
      .doc(`tenants/${tenantId}/sugestoes/${sugestaoId}`)
      .set({ status: "descartada", descartadaEm: new Date().toISOString() }, { merge: true });
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}

/** Pausa (ou retoma) o atendente automático numa conversa específica. */
export async function acaoPausarIa(
  idToken: string,
  tenantId: string,
  contactId: string,
  pausada: boolean,
): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    await definirPausa(tenantId, contactId, pausada);
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}

async function avisarCliente(tenantId: string, s: FirebaseFirestore.DocumentData): Promise<void> {
  const telefone = String(s.clienteTelefone ?? "");
  if (!telefone) return;

  const primeiroNome = String(s.clienteNome ?? "").trim().split(/\s+/)[0];
  const texto = `${primeiroNome ? `${primeiroNome}, ` : ""}confirmado! ${s.servico} com ${s.barbeiro}, ${isoParaLabelLongo(String(s.date))} às ${s.inicio}. Até lá!`;

  const canal = await canalDoTenant(tenantId);
  await canal.enviarMensagem(telefone, texto, {
    nome: String(s.clienteNome ?? "") || undefined,
    clienteId: s.clienteId ? String(s.clienteId) : undefined,
  });
}
