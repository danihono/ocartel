// Núcleo de agendamento validado no SERVIDOR (Admin SDK), usado pelo booking
// público (app/book/[slug]/actions.ts). Concentra num só lugar as guardas
// autoritativas: data futura, dia/expediente aberto, sem sobreposição de
// horário e vínculo/criação de cliente por telefone.
//
// Só use isto no servidor — importa firebase-admin. Não importe de componentes
// do cliente.

import { FieldValue } from "firebase-admin/firestore";
import { horaParaMin, horarioLivre, ocupaHorario, type IntervaloOcupado } from "@/lib/agenda";
import { indiceSegDom, mesAnoCurto } from "@/lib/date";
import { novoToken } from "@/lib/confirmacao";
import { chaveTelefone, clienteIdDoTelefone } from "@/lib/telefone";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HORA = /^\d{2}:\d{2}$/;

export function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Query dos agendamentos de um barbeiro num dia (equality-only: sem índice composto). */
export function queryDoDia(tenantRef: FirebaseFirestore.DocumentReference, barbeiroId: string, date: string) {
  return tenantRef.collection("agendamentos").where("barbeiroId", "==", barbeiroId).where("date", "==", date);
}

/** Mapeia docs de agendamento em intervalos ativos (ocupados/bloqueados). */
export function intervalosDeDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): IntervaloOcupado[] {
  return docs
    .map((d) => d.data())
    .filter((a) => ocupaHorario(a.status))
    .map((a) => ({ inicio: String(a.inicio), duracaoMin: typeof a.duracaoMin === "number" ? a.duracaoMin : 30 }));
}

/** Intervalos ativos (ocupados/bloqueados) de um barbeiro num dia. */
export async function intervalosOcupados(
  tenantRef: FirebaseFirestore.DocumentReference,
  barbeiroId: string,
  date: string,
): Promise<IntervaloOcupado[]> {
  const snap = await queryDoDia(tenantRef, barbeiroId, date).get();
  return intervalosDeDocs(snap.docs);
}

export interface CriarAgendamentoInput {
  barbeiroId: string;
  servicoId: string;
  date: string; // YYYY-MM-DD
  inicio: string; // HH:MM
  clienteNome: string;
  clienteTelefone?: string;
  /**
   * Cliente JÁ conhecido. Quando vem preenchido, o vínculo por telefone é pulado — é o que
   * impede um agendamento vindo do WhatsApp de criar um segundo cadastro para quem já
   * existe com outro id (importado de planilha, por exemplo).
   */
  clienteId?: string;
  observacoes?: string;
  origem?: "booking" | "admin" | "whatsapp";
}

export interface CriarAgendamentoResult {
  ok: boolean;
  error?: string;
  agendamentoId?: string;
}

/**
 * Valida e grava um agendamento no tenant informado, de forma autoritativa (lado
 * servidor). Lê barbeiro/serviço/config do próprio Firestore — não confia no
 * payload para preço/duração/expediente. Devolve `{ ok }` ou `{ ok:false, error }`.
 */
export async function criarAgendamentoValidado(
  tenantRef: FirebaseFirestore.DocumentReference,
  input: CriarAgendamentoInput,
): Promise<CriarAgendamentoResult> {
  const nome = (input.clienteNome ?? "").trim();
  if (!nome || nome.length > 80) return { ok: false, error: "Informe um nome válido." };
  if (!ISO_DATE.test(input.date) || !HORA.test(input.inicio)) return { ok: false, error: "Data ou horário inválidos." };

  const [barbeiroSnap, servicoSnap, configSnap] = await Promise.all([
    tenantRef.collection("barbeiros").doc(input.barbeiroId).get(),
    tenantRef.collection("servicos").doc(input.servicoId).get(),
    tenantRef.collection("config").doc("main").get(),
  ]);
  if (!barbeiroSnap.exists) return { ok: false, error: "Profissional indisponível." };
  if (!servicoSnap.exists) return { ok: false, error: "Serviço indisponível." };

  const servico = servicoSnap.data()!;
  const duracaoMin = typeof servico.duracaoMin === "number" ? servico.duracaoMin : 30;

  const horario = (configSnap.exists ? configSnap.data()?.horario : null) as
    | { abre?: string; fecha?: string; diasAtivos?: boolean[] }
    | null;

  // Não permite data passada (nível de dia — evita ambiguidade de fuso).
  const agora = new Date();
  const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  if (input.date < hojeISO) return { ok: false, error: "Escolha uma data futura." };

  // Dia fechado (config.horario.diasAtivos, Seg..Dom).
  if (Array.isArray(horario?.diasAtivos) && horario!.diasAtivos.length === 7 && horario!.diasAtivos[indiceSegDom(input.date)] === false) {
    return { ok: false, error: "A barbearia não atende nesse dia." };
  }

  // Dentro do expediente (cabe entre abertura e fechamento).
  if (horario?.abre || horario?.fecha) {
    const abreMin = horario.abre ? horaParaMin(horario.abre) : 0;
    const fechaMin = horario.fecha ? horaParaMin(horario.fecha) : 24 * 60;
    const iniMin = horaParaMin(input.inicio);
    if (iniMin < abreMin || iniMin + duracaoMin > fechaMin) {
      return { ok: false, error: "Horário fora do expediente." };
    }
  }

  // Vincula/cria o cliente por telefone (id determinístico = evita duplicar).
  // Fica FORA da transação de agenda: não é a parte sensível a corrida.
  //
  // O id sai de `chaveTelefone`, e não dos dígitos crus: assim "(19) 98448-7271" e
  // "5519984487271" — que é a forma que chega pelo WhatsApp — caem no MESMO cliente, em
  // vez de criarem dois cadastros para a mesma pessoa.
  let clienteId: string | undefined = input.clienteId;
  const chaveTel = chaveTelefone(input.clienteTelefone ?? "");
  if (!clienteId && chaveTel) {
    clienteId = clienteIdDoTelefone(chaveTel.curto);
    const cliRef = tenantRef.collection("clientes").doc(clienteId);
    const cliSnap = await cliRef.get();
    if (!cliSnap.exists) {
      await cliRef.set({
        nome,
        telefone: (input.clienteTelefone ?? "").trim(),
        telefoneNorm: chaveTel.curto,
        email: "",
        plano: "Avulso",
        planId: "",
        tag: "",
        ultimoAtendimento: "—",
        totalGasto: 0,
        atendimentos: 0,
        desde: mesAnoCurto(hojeISO),
        iniciais: iniciaisDe(nome),
        origem: input.origem ?? "booking",
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Guarda autoritativa ATÔMICA: lê os ocupados e cria o agendamento na MESMA
  // transação. Sem isto, dois bookings simultâneos no mesmo horário passariam os
  // dois na checagem (TOCTOU) e gerariam agendamento duplo. A transação serializa:
  // se outra escrita entrar no intervalo lido, o Firestore reexecuta o callback —
  // que então vê o slot ocupado e recusa. É o que faz o bloqueio do barbeiro
  // "valer" (a tela do cliente é só conveniência).
  const agendamentosCol = tenantRef.collection("agendamentos");
  const agendamentoId = await tenantRef.firestore.runTransaction(async (tx) => {
    const snap = await tx.get(queryDoDia(tenantRef, input.barbeiroId, input.date));
    if (!horarioLivre(intervalosDeDocs(snap.docs), input.inicio, duracaoMin)) return null;
    const ref = agendamentosCol.doc();
    tx.set(ref, {
      date: input.date,
      barbeiroId: input.barbeiroId,
      clienteNome: nome,
      ...(clienteId ? { clienteId } : {}),
      clienteTelefone: (input.clienteTelefone ?? "").trim(),
      servico: servico.nome ?? "",
      servicoId: input.servicoId,
      inicio: input.inicio,
      duracaoMin,
      status: "agendado",
      origem: input.origem ?? "booking",
      ...(input.observacoes ? { observacoes: input.observacoes } : {}),
      // Segredo do link de confirmação por WhatsApp (ver lib/confirmacao.ts).
      confirmToken: novoToken(),
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  });

  if (!agendamentoId) return { ok: false, error: "Esse horário não está mais disponível." };
  return { ok: true, agendamentoId };
}
