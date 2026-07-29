"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.
//
// A validação/gravação autoritativa mora em lib/booking-core.ts.

import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { criarAgendamentoValidado, intervalosOcupados, ISO_DATE } from "@/lib/booking-core";
import { GESTAO_TOKEN_RE, MENSAGEM_BLOQUEIO, podeGerenciar } from "@/lib/gestao-agendamento";
import { hojeISONoFuso } from "@/lib/date";
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
  /** Segredo do link de gestão, devolvido só na criação (ver /agendamento/[token]). */
  gestaoToken?: string;
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

    const { ok, error, gestaoToken } = await criarAgendamentoValidado(tenantRef, {
      barbeiroId: payload.barbeiroId,
      servicoId: payload.servicoId,
      date: payload.date,
      inicio: payload.inicio,
      clienteNome: payload.clienteNome,
      clienteTelefone: payload.clienteTelefone,
      origem: "booking",
    });
    return { ok, error, gestaoToken };
  } catch {
    return { ok: false, error: "Não foi possível concluir o agendamento." };
  }
}

// ---- Gestão pelo cliente (cancelar / remarcar via link com token) ----

/** O que a tela de gestão mostra. Sem dados de outros clientes. */
export interface AgendamentoPublico {
  id: string;
  date: string;
  inicio: string;
  duracaoMin: number;
  status: string;
  servico: string;
  servicoId: string;
  barbeiroId: string;
  barbeiroNome: string;
  clienteNome: string;
}

async function tenantDoSlug(slug: string) {
  const slugSnap = await adminDb.collection("slugs").doc(slug).get();
  if (!slugSnap.exists) return null;
  return adminDb.collection("tenants").doc(slugSnap.data()!.tenantId as string);
}

/**
 * Localiza o agendamento pelo token do link. A busca é por igualdade exata num
 * segredo de 16 bytes — quem não tem o link não chega no doc.
 */
async function acharPorToken(slug: string, token: string) {
  if (!GESTAO_TOKEN_RE.test(token)) return null;
  const tenantRef = await tenantDoSlug(slug);
  if (!tenantRef) return null;

  const snap = await tenantRef.collection("agendamentos").where("gestaoToken", "==", token).limit(1).get();
  if (snap.empty) return null;
  return { tenantRef, doc: snap.docs[0] };
}

export async function carregarAgendamentoPorToken(slug: string, token: string): Promise<AgendamentoPublico | null> {
  const achado = await acharPorToken(slug, token);
  if (!achado) return null;

  const d = achado.doc.data();
  const barbeiro = await achado.tenantRef.collection("barbeiros").doc(String(d.barbeiroId ?? "")).get();

  return {
    id: achado.doc.id,
    date: String(d.date ?? ""),
    inicio: String(d.inicio ?? ""),
    duracaoMin: typeof d.duracaoMin === "number" ? d.duracaoMin : 30,
    status: String(d.status ?? ""),
    servico: String(d.servico ?? ""),
    servicoId: String(d.servicoId ?? ""),
    barbeiroId: String(d.barbeiroId ?? ""),
    barbeiroNome: String(barbeiro.data()?.nome ?? ""),
    clienteNome: String(d.clienteNome ?? ""),
  };
}

/** Agora, no fuso da barbearia — a decisão de "já passou" não pode usar UTC. */
function agoraLocal() {
  const iso = hojeISONoFuso();
  const hhmm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return { iso, hhmm };
}

export async function cancelarAgendamentoPorToken(slug: string, token: string): Promise<BookingResult> {
  const achado = await acharPorToken(slug, token);
  if (!achado) return { ok: false, error: "Agendamento não encontrado." };

  const d = achado.doc.data();
  const { iso, hhmm } = agoraLocal();
  // A checagem da tela é conveniência; esta é a que vale.
  const permitido = podeGerenciar({ date: String(d.date), inicio: String(d.inicio), status: String(d.status) }, iso, hhmm);
  if (!permitido.ok) return { ok: false, error: MENSAGEM_BLOQUEIO[permitido.motivo!] };

  // Status "cancelado" já existe e `ocupaHorario` o ignora, então a vaga volta
  // sozinha para a agenda — não é preciso apagar o doc (o histórico se perde).
  await achado.doc.ref.update({ status: "cancelado", canceladoEm: new Date(), canceladoPor: "cliente" });
  return { ok: true };
}

export async function remarcarAgendamentoPorToken(
  slug: string,
  token: string,
  novo: { date: string; inicio: string },
): Promise<BookingResult> {
  const achado = await acharPorToken(slug, token);
  if (!achado) return { ok: false, error: "Agendamento não encontrado." };

  const d = achado.doc.data();
  const { iso, hhmm } = agoraLocal();
  const permitido = podeGerenciar({ date: String(d.date), inicio: String(d.inicio), status: String(d.status) }, iso, hhmm);
  if (!permitido.ok) return { ok: false, error: MENSAGEM_BLOQUEIO[permitido.motivo!] };

  const tenantSnap = await achado.tenantRef.get();
  if (tenantSnap.data()?.status === "suspenso") {
    return { ok: false, error: "Esta barbearia está temporariamente indisponível." };
  }

  // Cria o novo pelo MESMO caminho do booking — mesma transação anti-sobreposição
  // e mesmas guardas de expediente. Repetir essas regras aqui seria pedir para
  // elas divergirem.
  const criado = await criarAgendamentoValidado(achado.tenantRef, {
    barbeiroId: String(d.barbeiroId ?? ""),
    servicoId: String(d.servicoId ?? ""),
    date: novo.date,
    inicio: novo.inicio,
    clienteNome: String(d.clienteNome ?? ""),
    clienteTelefone: String(d.clienteTelefone ?? ""),
    origem: "booking",
    gestaoToken: token, // o link que o cliente já tem continua valendo
  });
  if (!criado.ok) return { ok: false, error: criado.error };

  // Só libera o horário antigo DEPOIS de garantir o novo: na ordem inversa, uma
  // falha deixaria o cliente sem horário nenhum.
  await achado.doc.ref.update({ status: "cancelado", canceladoEm: new Date(), canceladoPor: "remarcacao" });
  return { ok: true };
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
