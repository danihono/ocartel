// Confirmação de presença pelo WhatsApp — núcleo puro (sem Firebase, sem React).
//
// O fluxo: o painel abre uma conversa no wa.me com o número cadastrado do cliente
// e uma mensagem pronta contendo um link. O cliente toca no link, cai em /c/[codigo]
// e confirma (ou avisa que não vai) — e o agendamento muda de status na hora.
//
// NÃO é integração de WhatsApp: `wa.me` é só um link de clique-para-conversar, que
// abre o app com o texto pronto. Quem envia é a barbearia.

import { isoParaLabelLongo } from "./date";

/** Separador do código do link. Ids do Firestore são alfanuméricos — sem ambiguidade. */
const SEP = ".";
const ALFABETO = "abcdefghijkmnopqrstuvwxyz23456789"; // sem l/1/0/o (confusos ao ler em voz alta)
const TAMANHO_TOKEN = 18;

/**
 * Segredo do link. `globalThis.crypto` existe no navegador e no Node 19+, então
 * serve tanto para a criação pelo painel (SDK web) quanto pelo booking (Admin SDK).
 */
export function novoToken(): string {
  const bytes = new Uint8Array(TAMANHO_TOKEN);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return s;
}

export interface CodigoConfirmacao {
  tenantId: string;
  agendamentoId: string;
  token: string;
}

/**
 * Empacota tenant + agendamento + token num único segmento de URL. Levar o
 * caminho do doc no próprio código deixa o servidor buscar com um `doc()` direto
 * — sem `collectionGroup` e sem índice. O token é o que autoriza.
 */
export function montarCodigo({ tenantId, agendamentoId, token }: CodigoConfirmacao): string {
  return [tenantId, agendamentoId, token].join(SEP);
}

/** Inverso de `montarCodigo`. Devolve null para qualquer coisa fora do formato. */
export function lerCodigo(codigo: string): CodigoConfirmacao | null {
  const partes = (codigo ?? "").split(SEP);
  if (partes.length !== 3) return null;
  const [tenantId, agendamentoId, token] = partes;
  if (!tenantId || !agendamentoId || !token) return null;
  // Ids do Firestore e o token são alfanuméricos — recusa qualquer outra coisa
  // antes mesmo de tocar no banco.
  if (!/^[A-Za-z0-9_-]+$/.test(tenantId) || !/^[A-Za-z0-9_-]+$/.test(agendamentoId)) return null;
  if (!/^[a-z0-9]+$/.test(token)) return null;
  return { tenantId, agendamentoId, token };
}

/**
 * Comparação sem atalho de tempo. O token não vaza por timing e o custo é
 * irrelevante em 18 caracteres.
 */
export function tokenConfere(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function linkConfirmacao(origin: string, codigo: string): string {
  return `${origin.replace(/\/+$/, "")}/c/${codigo}`;
}

export interface DadosMensagem {
  cliente: string;
  barbearia: string;
  servico: string;
  profissional: string;
  /** ISO "YYYY-MM-DD" — vira "Terça, 4 ago". */
  dateISO: string;
  hora: string;
  link: string;
  /** Já confirmado vira lembrete; o resto é pedido de confirmação. */
  jaConfirmado?: boolean;
}

/** Texto pronto que abre no WhatsApp. */
export function mensagemWhatsApp(d: DadosMensagem): string {
  const primeiroNome = d.cliente.trim().split(/\s+/)[0] || "tudo bem";
  const quando = `${isoParaLabelLongo(d.dateISO)} às ${d.hora}`;
  const oQue = d.profissional ? `${d.servico} · com ${d.profissional}` : d.servico;

  if (d.jaConfirmado) {
    return [
      `Oi, ${primeiroNome}! Aqui é da ${d.barbearia}.`,
      "",
      `Passando pra lembrar do seu horário: ${quando}`,
      oQue,
      "",
      `Se precisar remarcar, é só avisar por aqui. Detalhes: ${d.link}`,
    ].join("\n");
  }

  return [
    `Oi, ${primeiroNome}! Aqui é da ${d.barbearia}.`,
    "",
    `Seu horário: ${quando}`,
    oQue,
    "",
    "Confirma pra gente? É só tocar aqui:",
    d.link,
  ].join("\n");
}

/** URL de clique-para-conversar com a mensagem já preenchida. */
export function linkWhatsApp(telefoneE164: string, mensagem: string): string {
  return `https://wa.me/${telefoneE164}?text=${encodeURIComponent(mensagem)}`;
}
