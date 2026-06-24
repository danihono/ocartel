"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { horarioLivre, ocupaHorario, type IntervaloOcupado } from "@/lib/agenda";

export interface BookingPayload {
  barbeiroId: string;
  servicoId: string;
  date: string; // YYYY-MM-DD
  inicio: string; // HH:MM
  clienteNome: string;
  clienteTelefone?: string;
}

export interface BookingResult {
  ok: boolean;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export async function criarAgendamentoPublico(slug: string, payload: BookingPayload): Promise<BookingResult> {
  const nome = (payload.clienteNome ?? "").trim();
  if (!nome || nome.length > 80) return { ok: false, error: "Informe um nome válido." };
  if (!ISO_DATE.test(payload.date) || !HORA.test(payload.inicio)) return { ok: false, error: "Data ou horário inválidos." };
  if (!slug) return { ok: false, error: "Barbearia não encontrada." };

  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return { ok: false, error: "Barbearia não encontrada." };
    const tenantId = slugSnap.data()!.tenantId as string;

    const tenantRef = adminDb.collection("tenants").doc(tenantId);
    const [barbeiroSnap, servicoSnap] = await Promise.all([
      tenantRef.collection("barbeiros").doc(payload.barbeiroId).get(),
      tenantRef.collection("servicos").doc(payload.servicoId).get(),
    ]);
    if (!barbeiroSnap.exists) return { ok: false, error: "Profissional indisponível." };
    if (!servicoSnap.exists) return { ok: false, error: "Serviço indisponível." };

    const servico = servicoSnap.data()!;
    const duracaoMin = typeof servico.duracaoMin === "number" ? servico.duracaoMin : 30;

    // Guarda autoritativa: recusa o agendamento se o intervalo sobrepuser
    // qualquer agendamento/bloqueio ativo do barbeiro naquele dia. É isto que
    // faz o bloqueio do barbeiro "valer" (a tela do cliente é só conveniência).
    const ocupados = await intervalosOcupados(tenantRef, payload.barbeiroId, payload.date);
    if (!horarioLivre(ocupados, payload.inicio, duracaoMin)) {
      return { ok: false, error: "Esse horário não está mais disponível." };
    }

    await tenantRef.collection("agendamentos").add({
      date: payload.date,
      barbeiroId: payload.barbeiroId,
      clienteNome: nome,
      clienteTelefone: (payload.clienteTelefone ?? "").trim(),
      servico: servico.nome ?? "",
      servicoId: payload.servicoId,
      inicio: payload.inicio,
      duracaoMin,
      status: "agendado",
      origem: "booking",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível concluir o agendamento." };
  }
}

/** Intervalos ativos (ocupados/bloqueados) de um barbeiro num dia. */
async function intervalosOcupados(
  tenantRef: FirebaseFirestore.DocumentReference,
  barbeiroId: string,
  date: string,
): Promise<IntervaloOcupado[]> {
  const snap = await tenantRef
    .collection("agendamentos")
    .where("barbeiroId", "==", barbeiroId)
    .where("date", "==", date)
    .get();
  return snap.docs
    .map((d) => d.data())
    .filter((a) => ocupaHorario(a.status))
    .map((a) => ({ inicio: String(a.inicio), duracaoMin: typeof a.duracaoMin === "number" ? a.duracaoMin : 30 }));
}

/**
 * Disponibilidade pública para a tela de agendamento: devolve os intervalos
 * ocupados/bloqueados do barbeiro no dia, lidos no servidor (Admin SDK) — assim
 * a coleção `agendamentos` continua privada (sem leitura pública nas regras).
 */
export async function disponibilidadePublica(
  slug: string,
  barbeiroId: string,
  date: string,
): Promise<IntervaloOcupado[]> {
  if (!slug || !barbeiroId || !ISO_DATE.test(date)) return [];
  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return [];
    const tenantId = slugSnap.data()!.tenantId as string;
    return await intervalosOcupados(adminDb.collection("tenants").doc(tenantId), barbeiroId, date);
  } catch {
    return [];
  }
}
