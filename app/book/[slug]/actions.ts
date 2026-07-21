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

    // Guarda autoritativa ATÔMICA: lê os ocupados e cria o agendamento na mesma
    // transação. Sem isto, dois bookings simultâneos no mesmo horário passariam
    // os dois na checagem (TOCTOU) e gerariam agendamento duplo. A transação
    // serializa: se outra escrita entrar no intervalo lido, o Firestore
    // reexecuta o callback — que então vê o slot ocupado e recusa. É isto que
    // faz o bloqueio do barbeiro "valer" (a tela do cliente é só conveniência).
    const agendamentosCol = tenantRef.collection("agendamentos");
    const conflito = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(queryDoDia(tenantRef, payload.barbeiroId, payload.date));
      if (!horarioLivre(intervalosDeDocs(snap.docs), payload.inicio, duracaoMin)) return true;
      tx.set(agendamentosCol.doc(), {
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
      return false;
    });
    if (conflito) return { ok: false, error: "Esse horário não está mais disponível." };

    return { ok: true };
  } catch {
    return { ok: false, error: "Não foi possível concluir o agendamento." };
  }
}

/** Mapeia docs de agendamento em intervalos ativos (ocupados/bloqueados). */
function intervalosDeDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): IntervaloOcupado[] {
  return docs
    .map((d) => d.data())
    .filter((a) => ocupaHorario(a.status))
    .map((a) => ({ inicio: String(a.inicio), duracaoMin: typeof a.duracaoMin === "number" ? a.duracaoMin : 30 }));
}

/** Query dos agendamentos de um barbeiro num dia (equality-only: sem índice composto). */
function queryDoDia(tenantRef: FirebaseFirestore.DocumentReference, barbeiroId: string, date: string) {
  return tenantRef.collection("agendamentos").where("barbeiroId", "==", barbeiroId).where("date", "==", date);
}

/** Intervalos ativos (ocupados/bloqueados) de um barbeiro num dia. */
async function intervalosOcupados(
  tenantRef: FirebaseFirestore.DocumentReference,
  barbeiroId: string,
  date: string,
): Promise<IntervaloOcupado[]> {
  const snap = await queryDoDia(tenantRef, barbeiroId, date).get();
  return intervalosDeDocs(snap.docs);
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
