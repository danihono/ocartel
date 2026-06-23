"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

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
    await tenantRef.collection("agendamentos").add({
      date: payload.date,
      barbeiroId: payload.barbeiroId,
      clienteNome: nome,
      clienteTelefone: (payload.clienteTelefone ?? "").trim(),
      servico: servico.nome ?? "",
      servicoId: payload.servicoId,
      inicio: payload.inicio,
      duracaoMin: typeof servico.duracaoMin === "number" ? servico.duracaoMin : 30,
      status: "agendado",
      origem: "booking",
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível concluir o agendamento." };
  }
}
