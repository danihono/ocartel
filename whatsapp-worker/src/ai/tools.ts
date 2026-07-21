// Ferramentas (function calling) que a IA pode chamar. A IA NUNCA vê a agenda
// inteira — ela pede disponibilidade e o worker calcula os slots livres a partir
// da fonte da verdade (Firestore), reusando a lógica de conflito (agenda.ts).

import type { OpenAI } from "openai";
import { db } from "../firebase.js";
import {
  horaParaMin,
  horarioLivre,
  indiceSegDom,
  ocupaHorario,
  slotsLivres,
  type IntervaloOcupado,
} from "../agenda.js";
import type { BarbeiroDoc, ConfigHorario, ServicoDoc } from "../types.js";

export interface ToolContext {
  tenantId: string;
  jid: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function tenantRef(tenantId: string) {
  return db.collection("tenants").doc(tenantId);
}

async function lerServicos(tenantId: string): Promise<ServicoDoc[]> {
  const snap = await tenantRef(tenantId).collection("servicos").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServicoDoc, "id">) }));
}

async function lerBarbeiros(tenantId: string): Promise<BarbeiroDoc[]> {
  const snap = await tenantRef(tenantId).collection("barbeiros").get();
  return snap.docs.map((d) => ({ id: d.id, nome: String(d.data().nome ?? "") }));
}

async function lerHorario(tenantId: string): Promise<ConfigHorario | null> {
  const snap = await tenantRef(tenantId).collection("config").doc("main").get();
  return snap.exists ? ((snap.data()?.horario as ConfigHorario) ?? null) : null;
}

async function ocupadosDoDia(tenantId: string, barbeiroId: string, date: string): Promise<IntervaloOcupado[]> {
  const snap = await tenantRef(tenantId)
    .collection("agendamentos")
    .where("barbeiroId", "==", barbeiroId)
    .where("date", "==", date)
    .get();
  return snap.docs
    .map((d) => d.data())
    .filter((a) => ocupaHorario(String(a.status)))
    .map((a) => ({ inicio: String(a.inicio), duracaoMin: typeof a.duracaoMin === "number" ? a.duracaoMin : 30 }));
}

/** Definições expostas à OpenAI (function calling). */
export const toolDefs: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "listarServicos",
      description: "Lista os serviços da barbearia com duração e preço.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "listarBarbeiros",
      description: "Lista os profissionais (barbeiros) da barbearia.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "consultarDisponibilidade",
      description:
        "Retorna horários livres reais para um serviço num dia. Use SEMPRE antes de sugerir ou confirmar qualquer horário. Se barbeiroId for omitido, considera todos os profissionais.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data no formato YYYY-MM-DD." },
          servicoId: { type: "string", description: "Id do serviço (de listarServicos)." },
          barbeiroId: { type: "string", description: "Id do barbeiro (opcional)." },
        },
        required: ["date", "servicoId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criarProposta",
      description:
        "Registra uma PROPOSTA de agendamento para a dona aprovar. NÃO agenda de fato — só entra na agenda após aprovação humana. Chame apenas quando o cliente já escolheu serviço, profissional, dia e horário confirmados por consultarDisponibilidade.",
      parameters: {
        type: "object",
        properties: {
          clienteNome: { type: "string" },
          barbeiroId: { type: "string" },
          servicoId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          inicio: { type: "string", description: "HH:MM" },
          observacoes: { type: "string" },
        },
        required: ["clienteNome", "barbeiroId", "servicoId", "date", "inicio"],
        additionalProperties: false,
      },
    },
  },
];

/** Executa uma ferramenta e devolve um objeto serializável (vira JSON pro modelo). */
export async function executeTool(name: string, args: any, ctx: ToolContext): Promise<unknown> {
  const { tenantId } = ctx;

  if (name === "listarServicos") {
    const servicos = await lerServicos(tenantId);
    return servicos.map((s) => ({ id: s.id, nome: s.nome, duracaoMin: s.duracaoMin, preco: s.preco }));
  }

  if (name === "listarBarbeiros") {
    return await lerBarbeiros(tenantId);
  }

  if (name === "consultarDisponibilidade") {
    const date = String(args.date ?? "");
    if (!ISO_DATE.test(date)) return { erro: "Data inválida (use YYYY-MM-DD)." };

    const servicos = await lerServicos(tenantId);
    const servico = servicos.find((s) => s.id === args.servicoId);
    if (!servico) return { erro: "Serviço não encontrado." };
    const duracaoMin = servico.duracaoMin || 30;

    const horario = await lerHorario(tenantId);
    // Dia fechado?
    if (Array.isArray(horario?.diasAtivos) && horario!.diasAtivos.length === 7 && horario!.diasAtivos[indiceSegDom(date)] === false) {
      return { fechado: true, motivo: "A barbearia não atende nesse dia." };
    }
    const abre = horario?.abre ?? "09:00";
    const fecha = horario?.fecha ?? "19:00";

    let barbeiros = await lerBarbeiros(tenantId);
    if (args.barbeiroId) barbeiros = barbeiros.filter((b) => b.id === args.barbeiroId);

    const porBarbeiro = [];
    for (const b of barbeiros) {
      const ocupados = await ocupadosDoDia(tenantId, b.id, date);
      const livres = slotsLivres({ abre, fecha, duracaoMin, ocupados, passoMin: 15 });
      porBarbeiro.push({ barbeiroId: b.id, barbeiro: b.nome, horariosLivres: livres.slice(0, 12) });
    }
    return { date, servico: servico.nome, duracaoMin, expediente: { abre, fecha }, porBarbeiro };
  }

  if (name === "criarProposta") {
    const date = String(args.date ?? "");
    const inicio = String(args.inicio ?? "");
    const clienteNome = String(args.clienteNome ?? "").trim();
    if (!ISO_DATE.test(date) || !/^\d{2}:\d{2}$/.test(inicio)) return { erro: "Data ou horário inválidos." };
    if (!clienteNome) return { erro: "Falta o nome do cliente." };

    const servicos = await lerServicos(tenantId);
    const servico = servicos.find((s) => s.id === args.servicoId);
    if (!servico) return { erro: "Serviço não encontrado." };
    const barbeiros = await lerBarbeiros(tenantId);
    const barbeiro = barbeiros.find((b) => b.id === args.barbeiroId);
    if (!barbeiro) return { erro: "Profissional não encontrado." };
    const duracaoMin = servico.duracaoMin || 30;

    // Revalida disponibilidade no momento da criação (expediente + conflito).
    const horario = await lerHorario(tenantId);
    if (Array.isArray(horario?.diasAtivos) && horario!.diasAtivos.length === 7 && horario!.diasAtivos[indiceSegDom(date)] === false) {
      return { erro: "A barbearia não atende nesse dia." };
    }
    if (horario?.abre || horario?.fecha) {
      const abreMin = horario.abre ? horaParaMin(horario.abre) : 0;
      const fechaMin = horario.fecha ? horaParaMin(horario.fecha) : 24 * 60;
      const iniMin = horaParaMin(inicio);
      if (iniMin < abreMin || iniMin + duracaoMin > fechaMin) return { erro: "Horário fora do expediente." };
    }
    const ocupados = await ocupadosDoDia(tenantId, barbeiro.id, date);
    if (!horarioLivre(ocupados, inicio, duracaoMin)) return { erro: "Esse horário acabou de ficar indisponível. Ofereça outro." };

    // Telefone do cliente = número do WhatsApp (só dígitos).
    const telefone = ctx.jid.split("@")[0].replace(/\D/g, "");

    await tenantRef(tenantId).collection("waPropostas").add({
      status: "pendente",
      jid: ctx.jid,
      clienteNome,
      clienteTelefone: telefone,
      barbeiroId: barbeiro.id,
      barbeiroNome: barbeiro.nome,
      servicoId: servico.id,
      servicoNome: servico.nome,
      date,
      inicio,
      duracaoMin,
      ...(args.observacoes ? { observacoes: String(args.observacoes) } : {}),
      criadoEm: new Date().toISOString(),
    });

    return {
      ok: true,
      mensagem:
        "Proposta registrada. Diga ao cliente que o horário foi ANOTADO e será CONFIRMADO pela barbearia em breve (não afirme que já está agendado).",
    };
  }

  return { erro: `Ferramenta desconhecida: ${name}` };
}
