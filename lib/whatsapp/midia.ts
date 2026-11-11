// Fotos, áudios, vídeos e documentos que chegam pela API oficial.
//
// O webhook da Meta traz só o id da mídia; o arquivo fica com ela por 30 dias. Aqui ele é
// baixado, guardado no Storage do Firebase e a mensagem ganha um `mediaUrl` — o mesmo
// campo que o daemon preenchia, então a tela de WhatsApp mostra sem saber de onde veio.
//
// O link é de token (firebaseStorageDownloadTokens), como o do daemon: abre no navegador
// sem login, e por isso as regras do Storage podem continuar negando tudo.
//
// Quem chama: o webhook, logo depois de gravar a mensagem; e a tela, quando abre uma
// conversa com mídia ainda pendente (o webhook tem tempo curto, e o histórico pode trazer
// muitas de uma vez).
//
// Só servidor (Admin SDK).

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { adminDb } from "@/lib/firebase/admin";
import { tokenCloud } from "@/lib/canal";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { baixarArquivoMeta, extensaoDoMime } from "./cloud";

function bucket() {
  const nome =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ocartel-497f8"}.firebasestorage.app`;
  // O app padrão já foi iniciado por @/lib/firebase/admin (importado acima).
  return getStorage().bucket(nome);
}

export type ResultadoMidia = "baixada" | "ja-tinha" | "sem-midia" | "falhou";

/**
 * Baixa a mídia de UMA mensagem do espelho. Idempotente: mensagem que já tem `mediaUrl`, ou
 * que não tem mídia da Meta, volta sem fazer nada.
 *
 * Falha que não adianta repetir (vencida, grande demais) vira `mediaError` e a mensagem sai
 * de `pending` — a tela mostra "mídia não carregada". Falha passageira deixa como está,
 * para a próxima abertura da conversa tentar de novo.
 */
export async function baixarMidiaDaMensagem(
  tenantId: string,
  contactId: string,
  messageId: string,
): Promise<ResultadoMidia> {
  const uid = uidDaBarbearia(tenantId);
  const ref = adminDb.doc(`users/${uid}/contacts/${contactId}/messages/${messageId}`);
  const snap = await ref.get();
  if (!snap.exists) return "sem-midia";
  if (snap.get("mediaUrl")) return "ja-tinha";
  const mediaId = String(snap.get("waMediaId") ?? "");
  if (!mediaId) return "sem-midia";

  const token = await tokenCloud(tenantId);
  if (!token) return "falhou";

  const arquivo = await baixarArquivoMeta(token, mediaId);
  if (!arquivo.ok) {
    console.warn("[whatsapp/midia] não baixou", tenantId, messageId, arquivo.erro);
    if (arquivo.definitivo) await ref.update({ pending: false, mediaError: arquivo.erro });
    return "falhou";
  }

  // Mesmo prefixo que o daemon usava, para o expurgo por contato apagar tudo de uma vez.
  const caminho = `users/${uid}/contacts/${contactId}/wa/${messageId}.${extensaoDoMime(arquivo.mime)}`;
  const tokenDownload = randomUUID();
  const b = bucket();
  await b.file(caminho).save(arquivo.bytes, {
    resumable: false,
    contentType: arquivo.mime,
    metadata: { metadata: { firebaseStorageDownloadTokens: tokenDownload } },
  });
  const mediaUrl =
    `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(caminho)}` +
    `?alt=media&token=${tokenDownload}`;

  await ref.update({
    mediaUrl,
    mediaPath: caminho,
    mimeType: arquivo.mime,
    sizeBytes: arquivo.bytes.length,
    pending: false,
    mediaError: FieldValue.delete(),
  });
  return "baixada";
}

/**
 * Baixa várias, poucas por vez, até o tempo acabar. O que sobrar fica pendente e é baixado
 * quando alguém abrir a conversa — a Meta reentrega o webhook se a rota demorar demais, e
 * reentregar não pode virar regra.
 */
export async function baixarMidias(
  tenantId: string,
  alvos: { contactId: string; messageId: string }[],
  limiteMs: number,
): Promise<number> {
  const fim = Date.now() + limiteMs;
  const fila = [...alvos];
  let baixadas = 0;
  const trabalhador = async () => {
    for (let a = fila.shift(); a && Date.now() < fim; a = fila.shift()) {
      try {
        if ((await baixarMidiaDaMensagem(tenantId, a.contactId, a.messageId)) === "baixada") baixadas++;
      } catch (err) {
        console.warn("[whatsapp/midia] erro", tenantId, a.messageId, err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, fila.length) }, trabalhador));
  return baixadas;
}
