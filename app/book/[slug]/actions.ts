"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.
//
// A validação/gravação autoritativa mora em lib/booking-core.ts.

import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { criarAgendamentoValidado, intervalosOcupados, ISO_DATE } from "@/lib/booking-core";
import {
  chaveIp,
  chaveTelefone,
  consumirLimite,
  ipDeHeaders,
  LIMITE_IP,
  LIMITE_TELEFONE,
  pareceRobo,
} from "@/lib/rate-limit";
import type { IntervaloOcupado } from "@/lib/agenda";

export interface BookingPayload {
  barbeiroId: string;
  servicoId: string;
  date: string; // YYYY-MM-DD
  inicio: string; // HH:MM
  clienteNome: string;
  clienteTelefone?: string;
  /** Campo oculto do formulário — se vier preenchido, não foi gente. */
  honeypot?: string;
  /** Tempo que o formulário ficou aberto, em ms. */
  duracaoPreenchimentoMs?: number;
}

export interface BookingResult {
  ok: boolean;
  error?: string;
}

export async function criarAgendamentoPublico(slug: string, payload: BookingPayload): Promise<BookingResult> {
  if (!slug) return { ok: false, error: "Barbearia não encontrada." };

  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return { ok: false, error: "Barbearia não encontrada." };
    const tenantId = slugSnap.data()!.tenantId as string;

    // O Admin SDK ignora as regras do Firestore, então a suspensão precisa ser
    // checada explicitamente aqui — senão o booking público continuaria
    // entrando numa barbearia que está fora do ar.
    const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
    if (tenantSnap.data()?.status === "suspenso") {
      return { ok: false, error: "Esta barbearia está temporariamente indisponível para agendamentos." };
    }

    const tenantRef = adminDb.collection("tenants").doc(tenantId);

    // Recusa genérica de propósito, aqui e nos limites abaixo: uma mensagem
    // específica ("esse telefone já agendou 3 vezes hoje") transformaria o
    // formulário num oráculo sobre a clientela da barbearia.
    const RECUSA = "Não foi possível concluir o agendamento. Tente novamente mais tarde.";

    if (pareceRobo({ honeypot: payload.honeypot, duracaoPreenchimentoMs: payload.duracaoPreenchimentoMs })) {
      return { ok: false, error: RECUSA };
    }

    const ip = ipDeHeaders(await headers());
    if (ip && !(await consumirLimite(tenantRef, chaveIp(ip), LIMITE_IP))) {
      return { ok: false, error: RECUSA };
    }

    const telDigits = (payload.clienteTelefone ?? "").replace(/\D/g, "");
    if (telDigits.length >= 10 && !(await consumirLimite(tenantRef, chaveTelefone(telDigits), LIMITE_TELEFONE))) {
      return { ok: false, error: RECUSA };
    }

    const { ok, error } = await criarAgendamentoValidado(tenantRef, {
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
  try {
    const slugSnap = await adminDb.collection("slugs").doc(slug).get();
    if (!slugSnap.exists) return [];
    const tenantId = slugSnap.data()!.tenantId as string;
    return await intervalosOcupados(adminDb.collection("tenants").doc(tenantId), barbeiroId, date);
  } catch {
    return [];
  }
}
