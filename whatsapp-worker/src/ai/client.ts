// Wrapper fino sobre o SDK da OpenAI — troca de provedor isolada aqui. Se um dia
// quiser Claude/outro, basta reimplementar `chat()` mantendo a mesma assinatura.

import OpenAI from "openai";

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

let _client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}
