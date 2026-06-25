"use server";

// Server action do booking público. Roda no servidor (App Hosting / Next server)
// com o Admin SDK, que valida tudo do lado do servidor e ignora as regras de
// segurança — assim não precisamos abrir escrita pública e anônima no Firestore.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { horaParaMin, horarioLivre, ocupaHorario, type IntervaloOcupado } from "@/lib/agenda";
import { indiceSegDom, mesAnoCurto } from "@/lib/date";

function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

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
    const [barbeiroSnap, servicoSnap, configSnap] = await Promise.all([
      tenantRef.collection("barbeiros").doc(payload.barbeiroId).get(),
      tenantRef.collection("servicos").doc(payload.servicoId).get(),
      tenantRef.collection("config").doc("main").get(),
    ]);
    if (!barbeiroSnap.exists) return { ok: false, error: "Profissional indisponível." };
    if (!servicoSnap.exists) return { ok: false, error: "Serviço indisponível." };

    const servico = servicoSnap.data()!;
    const duracaoMin = typeof servico.duracaoMin === "number" ? servico.duracaoMin : 30;

    // Guardas de calendário (autoritativas, lado servidor): a tela do cliente já
    // filtra, mas isto vale mesmo contra requisições forjadas.
    const horario = (configSnap.exists ? configSnap.data()?.horario : null) as
      | { abre?: string; fecha?: string; diasAtivos?: boolean[] }
      | null;

    // Não permite data passada (nível de dia — evita ambiguidade de fuso).
    const agora = new Date();
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    if (payload.date < hojeISO) return { ok: false, error: "Escolha uma data futura." };

    // Dia fechado (config.horario.diasAtivos, Seg..Dom).
    if (Array.isArray(horario?.diasAtivos) && horario!.diasAtivos.length === 7 && horario!.diasAtivos[indiceSegDom(payload.date)] === false) {
      return { ok: false, error: "A barbearia não atende nesse dia." };
    }

    // Dentro do expediente (cabe entre abertura e fechamento).
    if (horario?.abre || horario?.fecha) {
      const abreMin = horario.abre ? horaParaMin(horario.abre) : 0;
      const fechaMin = horario.fecha ? horaParaMin(horario.fecha) : 24 * 60;
      const iniMin = horaParaMin(payload.inicio);
      if (iniMin < abreMin || iniMin + duracaoMin > fechaMin) {
        return { ok: false, error: "Horário fora do expediente." };
      }
    }

    // Guarda autoritativa: recusa o agendamento se o intervalo sobrepuser
    // qualquer agendamento/bloqueio ativo do barbeiro naquele dia. É isto que
    // faz o bloqueio do barbeiro "valer" (a tela do cliente é só conveniência).
    const ocupados = await intervalosOcupados(tenantRef, payload.barbeiroId, payload.date);
    if (!horarioLivre(ocupados, payload.inicio, duracaoMin)) {
      return { ok: false, error: "Esse horário não está mais disponível." };
    }

    // Vincula/cria o cliente por telefone (id determinístico = evita duplicar a
    // cada agendamento). Só cria com defaults se ainda não existir.
    let clienteId: string | undefined;
    const telDigits = (payload.clienteTelefone ?? "").replace(/\D/g, "");
    if (telDigits.length >= 10) {
      clienteId = `tel-${telDigits}`;
      const cliRef = tenantRef.collection("clientes").doc(clienteId);
      const cliSnap = await cliRef.get();
      if (!cliSnap.exists) {
        await cliRef.set({
          nome,
          telefone: (payload.clienteTelefone ?? "").trim(),
          telefoneNorm: telDigits,
          email: "",
          plano: "Avulso",
          planId: "",
          tag: "",
          ultimoAtendimento: "—",
          totalGasto: 0,
          atendimentos: 0,
          desde: mesAnoCurto(hojeISO),
          iniciais: iniciaisDe(nome),
          origem: "booking",
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await tenantRef.collection("agendamentos").add({
      date: payload.date,
      barbeiroId: payload.barbeiroId,
      clienteNome: nome,
      ...(clienteId ? { clienteId } : {}),
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
