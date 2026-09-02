// O que o atendente automático sabe antes de escrever uma palavra.
//
// A promessa da IA aqui não é escrever bonito — é saber COM QUEM está falando e o que a
// barbearia realmente tem. Por isso o contexto junta quatro coisas: a barbearia (serviços,
// preços, expediente), o cliente identificado pelo vínculo (plano, último atendimento,
// horários já marcados), o histórico recente da conversa e a data de hoje.
//
// A montagem do texto (`resumoParaModelo`) é pura e testável; só `carregarContexto` toca o
// Firestore. Isso não é purismo: é o que permite conferir o que o modelo vê sem precisar
// de um projeto do Firebase.

import { adminDb } from "@/lib/firebase/admin";
import { clienteDoTelefone } from "@/lib/canal/vinculo";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { chaveTelefone } from "@/lib/telefone";
import { agoraEmBrasilia } from "@/lib/confirmacao-disparo";
import { isoParaLabelLongo } from "@/lib/date";
import type { Expediente } from "@/lib/disponibilidade";

export interface ServicoCtx {
  id: string;
  nome: string;
  duracaoMin: number;
  preco: number;
}

export interface BarbeiroCtx {
  id: string;
  nome: string;
}

export interface ClienteCtx {
  id?: string;
  nome?: string;
  /** Telefone com DDI, só dígitos. */
  telefone: string;
  plano?: string;
  ultimoAtendimento?: string;
  /** Agendamentos futuros dele, para a IA não remarcar o que já existe. */
  proximos: { date: string; inicio: string; servico: string; barbeiro: string }[];
}

export interface TurnoConversa {
  /** "cliente" = quem escreveu de fora; "barbearia" = nós (pessoa ou IA). */
  de: "cliente" | "barbearia";
  texto: string;
}

export interface Contexto {
  tenantId: string;
  contactId: string;
  hojeISO: string;
  agoraMin: number;
  barbearia: {
    nome: string;
    expediente: Expediente;
    assinatura?: string;
  };
  servicos: ServicoCtx[];
  barbeiros: BarbeiroCtx[];
  cliente: ClienteCtx;
  historico: TurnoConversa[];
}

/** Quantas mensagens de trás para frente o modelo enxerga. */
const JANELA_HISTORICO = 20;

/** Só quem ocupa horário conta como "já marcado" para o cliente. */
const STATUS_ATIVO = ["agendado", "confirmado", "atendimento"];

/**
 * Lê tudo que o atendente precisa saber. Devolve `null` quando a barbearia não tem
 * configuração — sem expediente não há o que oferecer.
 */
export async function carregarContexto(
  tenantId: string,
  contactId: string,
  telefone: string,
): Promise<Contexto | null> {
  const chave = chaveTelefone(telefone);
  if (!chave) return null;

  const uid = uidDaBarbearia(tenantId);
  const tenantRef = adminDb.doc(`tenants/${tenantId}`);

  const [configSnap, servicosSnap, barbeirosSnap, mensagensSnap, cliente] = await Promise.all([
    tenantRef.collection("config").doc("main").get(),
    tenantRef.collection("servicos").get(),
    tenantRef.collection("barbeiros").get(),
    adminDb
      .collection(`users/${uid}/contacts/${contactId}/messages`)
      .orderBy("sentAt", "desc")
      .limit(JANELA_HISTORICO)
      .get(),
    clienteDoTelefone(tenantId, telefone),
  ]);

  const config = configSnap.data() ?? {};
  const horario = (config.horario ?? {}) as Partial<Expediente>;
  if (!horario.abre || !horario.fecha) return null;

  const { dataISO: hojeISO } = agoraEmBrasilia();
  const agoraMin = minutosEmBrasilia();

  let clienteCtx: ClienteCtx = { telefone: chave.wa, proximos: [] };
  if (cliente) {
    const cliSnap = await tenantRef.collection("clientes").doc(cliente.id).get();
    // Só igualdade na query: cruzar `clienteId` com um `date >=` exigiria índice composto,
    // e o filtro de data sai de graça em memória (é a agenda de uma pessoa só).
    const futuros = await tenantRef.collection("agendamentos").where("clienteId", "==", cliente.id).get();

    clienteCtx = {
      id: cliente.id,
      nome: cliente.nome,
      telefone: chave.wa,
      plano: cliSnap.get("plano") ? String(cliSnap.get("plano")) : undefined,
      ultimoAtendimento: cliSnap.get("ultimoAtendimentoISO")
        ? String(cliSnap.get("ultimoAtendimentoISO"))
        : undefined,
      proximos: futuros.docs
        .filter((d) => String(d.get("date")) >= hojeISO && STATUS_ATIVO.includes(String(d.get("status"))))
        .map((d) => ({
          date: String(d.get("date")),
          inicio: String(d.get("inicio")),
          servico: String(d.get("servico") ?? ""),
          barbeiro: String(d.get("barbeiroId") ?? ""),
        }))
        .sort((a, b) => (a.date + a.inicio < b.date + b.inicio ? -1 : 1)),
    };
  }

  const historico: TurnoConversa[] = mensagensSnap.docs
    .map((d) => ({
      de: (d.get("fromMe") === true ? "barbearia" : "cliente") as TurnoConversa["de"],
      texto: String(d.get("text") ?? d.get("caption") ?? "").trim(),
    }))
    .filter((t) => t.texto)
    .reverse();

  const barbeiros: BarbeiroCtx[] = barbeirosSnap.docs.map((d) => ({ id: d.id, nome: String(d.get("nome") ?? "") }));
  const nomeDeBarbeiro = new Map(barbeiros.map((b) => [b.id, b.nome]));
  clienteCtx.proximos = clienteCtx.proximos.map((a) => ({ ...a, barbeiro: nomeDeBarbeiro.get(a.barbeiro) ?? a.barbeiro }));

  return {
    tenantId,
    contactId,
    hojeISO,
    agoraMin,
    barbearia: {
      nome: String(config.nome ?? "a barbearia"),
      expediente: {
        abre: String(horario.abre),
        fecha: String(horario.fecha),
        diasAtivos: Array.isArray(horario.diasAtivos) ? horario.diasAtivos : undefined,
      },
      assinatura: config.ia?.assinatura ? String(config.ia.assinatura) : undefined,
    },
    servicos: servicosSnap.docs.map((d) => ({
      id: d.id,
      nome: String(d.get("nome") ?? ""),
      duracaoMin: typeof d.get("duracaoMin") === "number" ? d.get("duracaoMin") : 30,
      preco: typeof d.get("preco") === "number" ? d.get("preco") : 0,
    })),
    barbeiros,
    cliente: clienteCtx,
    historico,
  };
}

/** Minutos desde a meia-noite, no fuso de Brasília. */
export function minutosEmBrasilia(base: Date = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(base)
    .split(":")
    .map(Number);
  return h * 60 + m;
}

const DIAS_ATIVOS_LABEL = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/**
 * O contexto virado texto, do jeito que vai para o modelo.
 *
 * Deliberadamente enxuto: o que não estiver aqui, o modelo não sabe — e é melhor ele não
 * saber do que inventar. Preço e duração vêm do cadastro, nunca de memória.
 */
export function resumoParaModelo(ctx: Contexto): string {
  const linhas: string[] = [];

  linhas.push(`Barbearia: ${ctx.barbearia.nome}`);
  linhas.push(`Hoje é ${isoParaLabelLongo(ctx.hojeISO)} (${ctx.hojeISO}).`);
  linhas.push(`Expediente: das ${ctx.barbearia.expediente.abre} às ${ctx.barbearia.expediente.fecha}.`);

  const dias = ctx.barbearia.expediente.diasAtivos;
  if (Array.isArray(dias) && dias.length === 7) {
    const abertos = DIAS_ATIVOS_LABEL.filter((_, i) => dias[i] !== false);
    linhas.push(`Dias de atendimento: ${abertos.join(", ") || "nenhum"}.`);
  }

  linhas.push("");
  linhas.push("Serviços (id · nome · duração · preço):");
  for (const s of ctx.servicos) {
    linhas.push(`- ${s.id} · ${s.nome} · ${s.duracaoMin} min · R$ ${s.preco.toFixed(2).replace(".", ",")}`);
  }

  linhas.push("");
  linhas.push("Profissionais (id · nome):");
  for (const b of ctx.barbeiros) linhas.push(`- ${b.id} · ${b.nome}`);

  linhas.push("");
  if (ctx.cliente.id) {
    linhas.push(`Cliente: ${ctx.cliente.nome} (já cadastrado).`);
    if (ctx.cliente.plano) linhas.push(`Plano: ${ctx.cliente.plano}.`);
    if (ctx.cliente.ultimoAtendimento) linhas.push(`Último atendimento: ${ctx.cliente.ultimoAtendimento}.`);
    if (ctx.cliente.proximos.length) {
      linhas.push("Já tem marcado:");
      for (const a of ctx.cliente.proximos) {
        linhas.push(`- ${a.date} às ${a.inicio} · ${a.servico} · ${a.barbeiro}`);
      }
    } else {
      linhas.push("Não tem nenhum horário marcado.");
    }
  } else {
    linhas.push("Cliente: não está cadastrado (é a primeira vez que fala com a barbearia).");
  }

  return linhas.join("\n");
}
