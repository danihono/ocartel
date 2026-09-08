"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.
//
// A validação/gravação autoritativa mora em lib/booking-core.ts.

import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { criarAgendamentoValidado, intervalosOcupados, ISO_DATE } from "@/lib/booking-core";
import { consumir, origemDaRequisicao } from "@/lib/ratelimit";
import type { IntervaloOcupado } from "@/lib/agenda";

// Porta anônima: sem login, sem App Check, e cada chamada CRIA documento. O teto é
// generoso para uma pessoa (ninguém marca 8 horários em 10 minutos) e apertado para um
// script. Ver lib/ratelimit.ts.
const LIMITE_AGENDAR = { max: 8, janelaSeg: 600 };
/** Leitura, mais barata e mais frequente: a tela consulta a cada troca de dia. */
const LIMITE_CONSULTAR = { max: 120, janelaSeg: 600 };

const MUITAS_TENTATIVAS = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";

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

export async function criarAgendamentoPublico(slug: string, payload: BookingPayload): Promise<BookingResult> {
  if (!slug) return { ok: false, error: "Barbearia não encontrada." };

  const origem = origemDaRequisicao(await headers());
  if (!(await consumir("book", origem, LIMITE_AGENDAR))) {
    return { ok: false, error: MUITAS_TENTATIVAS };
  }

  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return { ok: false, error: "Barbearia não encontrada." };
    const tenantId = slugSnap.data()!.tenantId as string;

    const { ok, error } = await criarAgendamentoValidado(adminDb.collection("tenants").doc(tenantId), {
      barbeiroId: payload.barbeiroId,
      servicoId: payload.servicoId,
      date: payload.date,
      inicio: payload.inicio,
      clienteNome: payload.clienteNome,
      clienteTelefone: payload.clienteTelefone,
      origem: "booking",
    });
    return { ok, error };
  } catch {
    return { ok: false, error: "Não foi possível concluir o agendamento." };
  }
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
  if (!(await consumir("disponibilidade", origemDaRequisicao(await headers()), LIMITE_CONSULTAR))) return [];
  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return [];
    const tenantId = slugSnap.data()!.tenantId as string;
    return await intervalosOcupados(adminDb.collection("tenants").doc(tenantId), barbeiroId, date);
  } catch {
    return [];
  }
}
