// O atendente automático: do "chegou mensagem" até o "respondeu".
//
// A ordem das portas importa, e é a mesma sempre: interruptor da barbearia → conversa não
// pausada → tetos de uso → contexto → modelo → envio. Cada porta é uma chance de NÃO
// gastar chamada de modelo, e a primeira delas é a que o dono da barbearia controla.
//
// A IA nunca marca. Quando o papo fecha num horário, ela chama `sugerir_agendamento`, que
// grava uma SUGESTÃO — e o agendamento só nasce quando uma pessoa clicar em confirmar.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { canalDoTenant, caminhoMensagem, WhatsAppNaoConfigurado } from "@/lib/canal";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { intervalosOcupados } from "@/lib/booking-core";
import { slotsLivres } from "@/lib/disponibilidade";
import { carregarContexto, type Contexto } from "./contexto";
import { instrucoes } from "./prompt";
import { conversar, IaIndisponivel, type Ferramenta } from "./gemini";
import { gravarSugestao, sugestaoPendenteIgual, validarProposta, type Proposta } from "./sugestao";

/** Quanto tempo a IA fica calada numa conversa depois que uma pessoa respondeu nela. */
export const PAUSA_APOS_HUMANO_MS = 4 * 60 * 60 * 1000;

/** Teto de respostas automáticas por conversa, por dia. Freio contra laço e contra susto. */
const TETO_DIARIO_POR_CONVERSA = 30;

/** Quantos dias à frente a ferramenta de horários aceita procurar. */
const JANELA_BUSCA_DIAS = 60;

export type ResultadoAtendimento =
  | { respondeu: true; sugestaoId?: string }
  | { respondeu: false; motivo: string };

interface EstadoConversa {
  iaPausadaAte?: number;
  respostasHoje?: number;
  diaContagem?: string;
}

function conversaRef(tenantId: string, contactId: string) {
  return adminDb.doc(`tenants/${tenantId}/conversas/${contactId}`);
}

/** Marca que uma pessoa assumiu a conversa — a IA cala a boca por algumas horas. */
export async function pausarPorHumano(tenantId: string, contactId: string): Promise<void> {
  await conversaRef(tenantId, contactId).set(
    { iaPausadaAte: Date.now() + PAUSA_APOS_HUMANO_MS, pausadaPor: "humano" },
    { merge: true },
  );
}

/** Liga/desliga a pausa manualmente, pelo botão no cabeçalho da conversa. */
export async function definirPausa(tenantId: string, contactId: string, pausada: boolean): Promise<void> {
  await conversaRef(tenantId, contactId).set(
    { iaPausadaAte: pausada ? Date.now() + PAUSA_APOS_HUMANO_MS : 0, pausadaPor: "manual" },
    { merge: true },
  );
}

/** Descreve as ferramentas para o modelo. Os nomes aparecem no prompt — mexeu aqui, mexa lá. */
function ferramentas(ctx: Contexto): Ferramenta[] {
  return [
    {
      name: "horarios_livres",
      description:
        "Horários realmente disponíveis num dia, para um serviço. Use SEMPRE antes de oferecer qualquer horário ao cliente.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Dia no formato AAAA-MM-DD." },
          servicoId: { type: "string", description: "Id do serviço, da lista do contexto." },
          barbeiroId: {
            type: "string",
            description: "Id do profissional. Omita para ver os horários de todos.",
          },
        },
        required: ["date", "servicoId"],
      },
    },
    {
      name: "sugerir_agendamento",
      description:
        "Registra a intenção do cliente para a equipe confirmar. NÃO marca o horário — depois de chamar, avise que vai confirmar com a equipe.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Dia no formato AAAA-MM-DD." },
          inicio: { type: "string", description: "Horário no formato HH:MM." },
          servicoId: { type: "string" },
          barbeiroId: { type: "string" },
          clienteNome: {
            type: "string",
            description: `Nome do cliente. ${ctx.cliente.nome ? "Já conhecido, mas confirme se ele corrigir." : "Pergunte antes se ainda não souber."}`,
          },
        },
        required: ["date", "inicio", "servicoId", "barbeiroId"],
      },
    },
  ];
}

async function executarHorariosLivres(ctx: Contexto, args: Record<string, unknown>) {
  const date = String(args.date ?? "");
  const servico = ctx.servicos.find((s) => s.id === String(args.servicoId ?? ""));
  if (!servico) return { erro: "servicoId não existe. Use um da lista do contexto." };
  if (date < ctx.hojeISO) return { erro: "Essa data já passou." };

  const limite = new Date(`${ctx.hojeISO}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + JANELA_BUSCA_DIAS);
  if (date > limite.toISOString().slice(0, 10)) return { erro: "A agenda não vai tão longe." };

  const alvo = String(args.barbeiroId ?? "");
  const barbeiros = alvo ? ctx.barbeiros.filter((b) => b.id === alvo) : ctx.barbeiros;
  if (barbeiros.length === 0) return { erro: "barbeiroId não existe. Use um da lista do contexto." };

  const tenantRef = adminDb.doc(`tenants/${ctx.tenantId}`);
  const porBarbeiro = await Promise.all(
    barbeiros.map(async (b) => ({
      barbeiroId: b.id,
      barbeiro: b.nome,
      horarios: slotsLivres({
        expediente: ctx.barbearia.expediente,
        ocupados: await intervalosOcupados(tenantRef, b.id, date),
        dateISO: date,
        duracaoMin: servico.duracaoMin,
        hojeISO: ctx.hojeISO,
        agoraMin: ctx.agoraMin,
      }),
    })),
  );

  return { date, servico: servico.nome, disponibilidade: porBarbeiro };
}

async function executarSugestao(ctx: Contexto, args: Record<string, unknown>, guardar: (id: string) => void) {
  const proposta: Proposta = {
    date: String(args.date ?? ""),
    inicio: String(args.inicio ?? ""),
    servicoId: String(args.servicoId ?? ""),
    barbeiroId: String(args.barbeiroId ?? ""),
  };

  const tenantRef = adminDb.doc(`tenants/${ctx.tenantId}`);
  const ocupados = await intervalosOcupados(tenantRef, proposta.barbeiroId, proposta.date).catch(() => []);
  const validacao = validarProposta(ctx, proposta, ocupados);
  if (!validacao.ok) return { aceita: false, motivo: validacao.erro };

  // O nome pode chegar do modelo quando o cliente não é cadastrado; o do cadastro vence.
  const nomeInformado = String(args.clienteNome ?? "").trim();
  if (!ctx.cliente.nome && nomeInformado) ctx.cliente.nome = nomeInformado;
  if (!ctx.cliente.nome) return { aceita: false, motivo: "Pergunte o nome do cliente antes de sugerir." };

  if (await sugestaoPendenteIgual(ctx, proposta)) {
    return { aceita: true, observacao: "Já havia uma sugestão igual esperando confirmação." };
  }

  guardar(await gravarSugestao(ctx, proposta, validacao));
  return {
    aceita: true,
    observacao: "Registrado para a equipe confirmar. Avise o cliente que você vai confirmar e retornar.",
  };
}

/**
 * Responde uma mensagem que acabou de chegar. Devolve `respondeu: false` com o motivo
 * sempre que decide não falar — o motivo vira log, e é o que explica um silêncio.
 */
export async function atender(params: {
  tenantId: string;
  contactId: string;
  telefone: string;
}): Promise<ResultadoAtendimento> {
  const { tenantId, contactId, telefone } = params;

  const config = await adminDb.doc(`tenants/${tenantId}/config/main`).get();
  if (config.get("ia")?.ativa !== true) return { respondeu: false, motivo: "atendente desligado" };

  const estadoSnap = await conversaRef(tenantId, contactId).get();
  const estado = (estadoSnap.data() ?? {}) as EstadoConversa;

  if ((estado.iaPausadaAte ?? 0) > Date.now()) {
    return { respondeu: false, motivo: "conversa assumida por uma pessoa" };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const usadasHoje = estado.diaContagem === hoje ? (estado.respostasHoje ?? 0) : 0;
  if (usadasHoje >= TETO_DIARIO_POR_CONVERSA) {
    return { respondeu: false, motivo: "teto diário desta conversa" };
  }

  const ctx = await carregarContexto(tenantId, contactId, telefone);
  if (!ctx) return { respondeu: false, motivo: "barbearia sem expediente configurado" };
  if (ctx.historico.length === 0) return { respondeu: false, motivo: "nada de texto para responder" };

  let sugestaoId: string | undefined;

  let resposta: { texto: string };
  try {
    resposta = await conversar({
      instrucoes: instrucoes(ctx),
      historico: ctx.historico,
      ferramentas: ferramentas(ctx),
      executar: async (chamada) => {
        if (chamada.name === "horarios_livres") return executarHorariosLivres(ctx, chamada.args);
        if (chamada.name === "sugerir_agendamento") {
          return executarSugestao(ctx, chamada.args, (id) => {
            sugestaoId = id;
          });
        }
        return { erro: "Ferramenta desconhecida." };
      },
    });
  } catch (err) {
    if (err instanceof IaIndisponivel) return { respondeu: false, motivo: err.message };
    throw err;
  }

  const texto = resposta.texto.trim();
  if (!texto) return { respondeu: false, motivo: "o modelo não produziu resposta" };

  let canal;
  try {
    canal = await canalDoTenant(tenantId);
  } catch (err) {
    if (err instanceof WhatsAppNaoConfigurado) return { respondeu: false, motivo: "sem WhatsApp vinculado" };
    throw err;
  }

  const envio = await canal.enviarMensagem(telefone, texto, {
    nome: ctx.cliente.nome,
    clienteId: ctx.cliente.id,
    aguardarMs: 20_000,
  });
  if (!envio.ok) return { respondeu: false, motivo: envio.erro ?? "falha ao enviar" };

  // O selo de "respondido pela IA" na conversa. Cosmético, mas é o que deixa claro para a
  // barbearia qual mensagem saiu sozinha — e sem isso a pessoa não sabe o que revisar.
  if (envio.mensagemId) {
    await adminDb
      .doc(caminhoMensagem(uidDaBarbearia(tenantId), contactId, envio.mensagemId))
      .set({ porIa: true }, { merge: true })
      .catch(() => {});
  }

  await conversaRef(tenantId, contactId).set(
    {
      diaContagem: hoje,
      respostasHoje: estado.diaContagem === hoje ? FieldValue.increment(1) : 1,
      ultimaRespostaIa: new Date().toISOString(),
    },
    { merge: true },
  );

  return { respondeu: true, ...(sugestaoId ? { sugestaoId } : {}) };
}
