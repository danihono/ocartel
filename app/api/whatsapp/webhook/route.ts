// Webhook da API oficial do WhatsApp — a porta por onde a Meta entrega as mensagens.
//
// Substitui o daemon no sentido de CHEGADA: o que antes o Baileys via no socket, agora a
// Meta manda para cá. O que entra é gravado no mesmo espelho de sempre
// (`users/barbearia-{t}/contacts/**`), e dali o resto segue igual — a tela mostra, e a
// Cloud Function do atendente acorda e chama a IA.
//
// Dois métodos, como a Meta exige:
//   GET  — a verificação, uma vez, quando a URL é cadastrada no painel do app;
//   POST — cada evento, assinado com o App Secret.
//
// A rota é PÚBLICA. O GET é protegido pelo token de verificação, e o POST pela
// assinatura: sem conferir, quem descobrisse a URL faria a IA responder a quem quisesse.

import { NextResponse } from "next/server";
import { assinaturaConfere, lerWebhook } from "@/lib/whatsapp/cloud";
import { gravarMensagem, gravarStatus, tenantDoNumero } from "@/lib/whatsapp/cloud-espelho";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  // `trim` dos dois lados: segredo colado no terminal ou no Secret Manager costuma levar
  // uma quebra de linha junto, invisível — e a verificação falhava sem explicação.
  const esperado = (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
  if (!esperado) {
    // Distinto do 403 de propósito: "o segredo não chegou ao servidor" e "a senha não
    // bate" se resolvem de jeitos diferentes, e sem isto os dois pareciam o mesmo erro.
    console.error("[whatsapp/webhook] WHATSAPP_VERIFY_TOKEN não configurado.");
    return NextResponse.json({ error: "token de verificação não configurado no servidor" }, { status: 500 });
  }
  if (p.get("hub.mode") === "subscribe" && (p.get("hub.verify_token") ?? "").trim() === esperado) {
    // A Meta espera o `challenge` de volta, cru, como texto.
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return NextResponse.json({ error: "não autorizado" }, { status: 403 });
}

export async function POST(req: Request) {
  const segredo = (process.env.WHATSAPP_APP_SECRET ?? "").trim();
  if (!segredo) {
    console.error("[whatsapp/webhook] WHATSAPP_APP_SECRET não configurado — recusando tudo.");
    return NextResponse.json({ error: "não configurado" }, { status: 500 });
  }

  // O corpo CRU: a assinatura é sobre os bytes exatos que a Meta mandou.
  const cru = await req.text();
  if (!assinaturaConfere(cru, req.headers.get("x-hub-signature-256"), segredo)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  let gravadas = 0;
  try {
    for (const lote of lerWebhook(corpo)) {
      const tenantId = await tenantDoNumero(lote.phoneNumberId);
      if (!tenantId) {
        // Número que não é de nenhuma barbearia (ex.: o de teste antes de ser vinculado).
        // 200 mesmo assim: devolver erro faria a Meta reentregar por dias.
        console.warn("[whatsapp/webhook] número sem barbearia", lote.phoneNumberId);
        continue;
      }
      // Em ordem: numa rajada, a ordem de chegada é a ordem da conversa.
      for (const m of lote.mensagens) if (await gravarMensagem(tenantId, m)) gravadas++;
      for (const s of lote.status) await gravarStatus(tenantId, s);
    }
  } catch (err) {
    // Falha de banco: 500 faz a Meta reentregar, e a gravação é idempotente pelo wamid.
    console.error("[whatsapp/webhook] falha ao gravar", err);
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gravadas });
}
