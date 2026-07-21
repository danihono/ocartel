// Loop de atendimento da IA para uma mensagem recebida. Mantém um contexto curto
// por conversa (tenants/{t}/waConversas/{jid}), roda o function calling da OpenAI
// (modelo pede ferramenta → worker executa → devolve resultado → modelo redige a
// resposta) e responde no WhatsApp.

import type { WASocket } from "@whiskeysockets/baileys";
import type { OpenAI } from "openai";
import { db } from "../firebase.js";
import { openai, MODEL } from "./client.js";
import { executeTool, toolDefs, type ToolContext } from "./tools.js";

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORICO = 12; // pares de mensagens guardados p/ contexto

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function convRef(tenantId: string, jid: string) {
  const id = jid.replace(/[^A-Za-z0-9_.-]/g, "_");
  return db.collection("tenants").doc(tenantId).collection("waConversas").doc(id);
}

function hojeISO(): string {
  // TZ é definido no ambiente (Dockerfile: America/Sao_Paulo).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function nomeBarbearia(tenantId: string): Promise<string> {
  const snap = await db.collection("tenants").doc(tenantId).collection("config").doc("main").get();
  return String(snap.data()?.nome ?? "a barbearia");
}

function systemPrompt(barbearia: string): string {
  return [
    `Você é a atendente virtual da ${barbearia}, respondendo clientes pelo WhatsApp em português do Brasil.`,
    `A data de hoje é ${hojeISO()} (formato YYYY-MM-DD). Use-a para interpretar "amanhã", "quinta", "semana que vem" etc.`,
    "",
    "Seu papel: responder com simpatia e objetividade, tirar dúvidas sobre serviços/preços e ajudar a marcar horário.",
    "",
    "Regras importantes:",
    "- Para saber serviços/profissionais, use as ferramentas listarServicos / listarBarbeiros. Nunca invente preços, durações ou nomes.",
    "- NUNCA afirme um horário sem antes checar com consultarDisponibilidade. Ofereça 2 ou 3 opções de horários realmente livres.",
    "- Você NÃO confirma agendamentos sozinha. Quando o cliente escolher serviço, profissional, dia e horário, chame criarProposta e diga que o horário foi ANOTADO e será CONFIRMADO pela barbearia em breve.",
    "- Se o cliente não tiver preferência de profissional, escolha um com horário livre e ofereça.",
    "- Peça o nome do cliente se ainda não souber, antes de criar a proposta.",
    "- Mensagens curtas, tom cordial, sem emojis em excesso.",
  ].join("\n");
}

export async function handleIncoming(params: {
  tenantId: string;
  jid: string;
  text: string;
  sock: WASocket;
}): Promise<void> {
  const { tenantId, jid, text, sock } = params;
  const ctx: ToolContext = { tenantId, jid };

  // Sem chave da OpenAI: não trava o worker — só não responde com IA.
  if (!process.env.OPENAI_API_KEY) return;

  const ref = convRef(tenantId, jid);
  const snap = await ref.get();
  const historico: ChatMsg[] = (snap.exists ? (snap.data()?.historico as ChatMsg[]) : []) ?? [];

  const barbearia = await nomeBarbearia(tenantId);
  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt(barbearia) },
    ...historico,
    { role: "user", content: text },
  ];

  const client = openai();
  let resposta = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolDefs,
      temperature: 0.4,
    });
    const choice = completion.choices[0]?.message;
    if (!choice) break;
    messages.push(choice as ChatMsg);

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      resposta = choice.content ?? "";
      break;
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: any = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* argumentos malformados → objeto vazio */
      }
      let result: unknown;
      try {
        result = await executeTool(call.function.name, args, ctx);
      } catch (err) {
        result = { erro: "Falha ao executar a ferramenta." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  if (resposta.trim()) {
    await sock.sendMessage(jid, { text: resposta.trim() });
  }

  // Persiste histórico (sem o system), truncado.
  const novoHistorico = messages.filter((m) => m.role !== "system").slice(-MAX_HISTORICO);
  await ref.set({ historico: novoHistorico, atualizadoEm: new Date().toISOString() }, { merge: true });
}
