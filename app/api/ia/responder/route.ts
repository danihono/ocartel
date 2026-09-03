// O cérebro do atendente automático.
//
// Quem chama é uma Cloud Function que dispara quando o daemon grava uma mensagem nova no
// espelho (ver functions/src/index.ts). A Function é burra de propósito: toda a lógica
// mora aqui, no site, onde `lib/agenda`, `lib/booking-core` e `lib/canal` já existem e são
// testados. Duplicar a regra de horário livre num pacote separado seria a forma mais
// rápida de a IA oferecer um horário que a barbearia não tem.
//
// Protegida por segredo compartilhado, no mesmo molde de /api/confirmacoes/disparar: é uma
// rota pública, e sem isso qualquer um faria a barbearia falar com quem quisesse.

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { atender } from "@/lib/ia/atender";

export const dynamic = "force-dynamic";
/** A conversa com o modelo pode levar algumas rodadas de ferramenta. */
export const maxDuration = 120;

/**
 * Espera antes de responder. Quem manda "oi", "queria cortar", "pode ser sexta?" em três
 * mensagens seguidas merece UMA resposta ao conjunto, não três respostas atropelando o
 * raciocínio. Ao acordar, só segue quem ainda for a última mensagem da conversa.
 *
 * Este número é um equilíbrio, e vai direto para o tempo que o cliente espera. Quatro
 * segundos cobre a rajada típica de WhatsApp (2 a 4 s entre mensagens emendadas) sem
 * fazer quem mandou uma frase só esperar à toa. Aumentar agrupa melhor e responde pior.
 */
const ESPERA_AGRUPAMENTO_MS = 4000;

/** Mensagem mais velha que isso é passado: não se responde histórico. */
const IDADE_MAXIMA_MS = 5 * 60 * 1000;

export async function POST(req: Request) {
  const segredo = process.env.IA_SECRET;
  if (!segredo || req.headers.get("x-ia-secret") !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const corpo = (await req.json().catch(() => ({}))) as { uid?: string; contactId?: string; messageId?: string };
  const uid = String(corpo.uid ?? "");
  const contactId = String(corpo.contactId ?? "");
  const messageId = String(corpo.messageId ?? "");
  if (!uid.startsWith("barbearia-") || !contactId || !messageId) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const tenantId = uid.slice("barbearia-".length);

  const contatoRef = adminDb.doc(`users/${uid}/contacts/${contactId}`);
  const contato = await contatoRef.get();
  if (!contato.exists) return ignorado("contato não existe");

  // Grupo não é atendimento: responder num grupo é falar com dezenas de pessoas de uma vez.
  const jid = String(contato.get("waJid") ?? "");
  if (jid.endsWith("@g.us")) return ignorado("mensagem de grupo");

  const telefone = String(contato.get("whatsappDigits") ?? contato.get("whatsapp") ?? "");
  if (!telefone) return ignorado("contato sem número");

  await new Promise((r) => setTimeout(r, ESPERA_AGRUPAMENTO_MS));

  // Depois da espera, só segue quem continua sendo a última mensagem — as anteriores da
  // rajada morrem aqui, e uma resposta escrita por uma PESSOA nesse meio-tempo também
  // cancela o atendimento automático.
  const ultima = await contatoRef.collection("messages").orderBy("sentAt", "desc").limit(1).get();
  const topo = ultima.docs[0];
  if (!topo) return ignorado("conversa vazia");
  if (topo.id !== messageId) return ignorado("chegou mensagem mais nova");
  if (topo.get("fromMe") === true) return ignorado("a última mensagem é nossa");
  if (topo.get("importedFromHistory") === true) return ignorado("mensagem de histórico");

  const enviadaEm = topo.get("sentAt")?.toMillis?.() ?? 0;
  if (enviadaEm && Date.now() - enviadaEm > IDADE_MAXIMA_MS) return ignorado("mensagem antiga");

  // Mídia sem legenda não dá para responder por texto: marca para uma pessoa olhar.
  const texto = String(topo.get("text") ?? topo.get("caption") ?? "").trim();
  if (!texto) {
    await adminDb
      .doc(`tenants/${tenantId}/conversas/${contactId}`)
      .set({ precisaDeGente: true, motivo: "mídia sem texto", em: new Date().toISOString() }, { merge: true });
    return ignorado("mídia sem texto");
  }

  const r = await atender({ tenantId, contactId, telefone });
  return NextResponse.json(r);
}

function ignorado(motivo: string) {
  return NextResponse.json({ respondeu: false, motivo });
}
