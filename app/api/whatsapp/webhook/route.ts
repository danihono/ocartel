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
import { assinaturaConfere, idDoc, lerWebhook, resumoWebhook } from "@/lib/whatsapp/cloud";
import { baixarMidias } from "@/lib/whatsapp/midia";
import { contactIdDoTelefone } from "@/lib/telefone";
import { adminDb } from "@/lib/firebase/admin";
import {
  aplicarContatos,
  gravarHistorico,
  gravarMensagem,
  gravarStatus,
  tenantDoNumero,
} from "@/lib/whatsapp/cloud-espelho";

export const dynamic = "force-dynamic";
/** Um pedaço do histórico da Coexistência pode trazer milhares de mensagens. */
export const maxDuration = 300;

/**
 * Quanto tempo de cada entrega pode ir para baixar fotos e áudios. Mensagem ao vivo traz uma
 * ou duas mídias e cabe folgado; o que um pedaço grande do histórico não couber fica para
 * quando a conversa for aberta (ver lib/whatsapp/midia.ts).
 */
const TEMPO_MIDIAS_MS = 20_000;

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

  // Só o formato (ver resumoWebhook): é o que permite saber, olhando o log, por que uma
  // entrega aceita não virou conversa.
  console.info("[whatsapp/webhook] recebido", JSON.stringify(resumoWebhook(corpo)));

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
      for (const m of lote.mensagens) if (!m.importada && (await gravarMensagem(tenantId, m))) gravadas++;
      const doHistorico = lote.mensagens.filter((m) => m.importada);
      if (doHistorico.length) gravadas += await gravarHistorico(tenantId, doHistorico);
      if (lote.contatos.length) await aplicarContatos(tenantId, lote.contatos);
      for (const s of lote.status) await gravarStatus(tenantId, s);

      // Depois de gravar: a mensagem já aparece na tela ("📷 Foto", pendente) e o arquivo
      // chega em seguida. Falhar aqui não derruba a entrega — fica para a abertura da conversa.
      const comMidia = lote.mensagens
        .filter((m) => m.waMediaId)
        .map((m) => ({ contactId: contactIdDoTelefone(m.numero), messageId: idDoc(m.wamid) }));
      if (comMidia.length) await baixarMidias(tenantId, comMidia, TEMPO_MIDIAS_MS);

      // O andamento da importação do histórico, para a tela de Configurações dizer em que pé
      // está — ou que a barbearia não autorizou compartilhar.
      if (lote.historicoRecusado || lote.historicoProgresso !== undefined) {
        await adminDb.doc(`tenants/${tenantId}/private/whatsapp`).set(
          {
            sincronizacao: {
              ...(lote.historicoRecusado ? { historicoRecusado: true } : {}),
              ...(lote.historicoProgresso !== undefined ? { historicoProgresso: lote.historicoProgresso } : {}),
              historicoEm: new Date().toISOString(),
            },
          },
          { merge: true },
        );
      }
    }
  } catch (err) {
    // Falha de banco: 500 faz a Meta reentregar, e a gravação é idempotente pelo wamid.
    console.error("[whatsapp/webhook] falha ao gravar", err);
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gravadas });
}
