"use client";

// Leitura do espelho de WhatsApp, no navegador.
//
// O daemon (Baileys, self-hosted) grava tudo que entra e sai em
// `users/barbearia-{tenantId}/contacts/**`. Isso fica FORA de `tenants/**`, então as
// regras negavam por omissão — foi preciso liberar a leitura em firestore.rules (só
// leitura; escrever continua sendo coisa de server action, com o Admin SDK).
//
// A leitura é direta e ao vivo, e não por polling como o pareamento em Configurações: a
// graça da tela é a resposta do cliente aparecer sozinha, sem ninguém apertar nada.
//
// Os campos abaixo são os que o daemon escreve — o mesmo shape do CRM Titãs, de onde ele
// veio. Não invente campo aqui: se não estiver do lado de lá, chega `undefined`.

import { collection, doc, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

/** Uma conversa (o "contato" do daemon). */
export interface Conversa {
  id: string;
  /** Nome resolvido pelo daemon (pushName) ou gravado por nós, do cadastro. */
  name: string;
  /** Telefone com DDI, só dígitos. É a chave que casa com o cliente. */
  whatsappDigits: string;
  photoUrl?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  /** Recebidas desde a última vez que a conversa foi aberta (quem incrementa é o daemon). */
  unreadCount?: number;
  /** Vínculo com `tenants/{t}/clientes` — ver lib/canal/vinculo.ts. */
  clienteId?: string;
  createdAt?: Date;
}

/** Uma mensagem da conversa. */
export interface MensagemWa {
  id: string;
  fromMe: boolean;
  text: string;
  sentAt: Date;
  mediaType?: "image" | "video" | "audio" | "document" | "sticker";
  /** URL com token, gerada pelo daemon — abre no navegador sem autenticação. */
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  /** true enquanto a mídia ainda não terminou de subir (ou falhou). */
  pending?: boolean;
  mediaError?: string;
  /** Resposta escrita pelo atendente automático, não por uma pessoa. */
  porIa?: boolean;
}

function paraData(v: unknown): Date | undefined {
  return v instanceof Timestamp ? v.toDate() : undefined;
}

/** Quando a conversa "aconteceu" pela última vez — a ordem da lista sai daqui. */
export function quandoConversa(c: Conversa): number {
  return (c.lastMessageAt ?? c.createdAt)?.getTime() ?? 0;
}

/**
 * Assina a lista de conversas.
 *
 * Sem `orderBy` de propósito: o Firestore OMITE do resultado todo documento que não tem o
 * campo ordenado, e `lastMessageAt` só nasce na primeira mensagem. Ordenar no servidor
 * sumiria justamente com a conversa recém-criada — que é a que a pessoa acabou de abrir.
 * A ordenação é aqui embaixo, onde ninguém desaparece.
 */
export function subscribeConversas(uid: string, cb: (rows: Conversa[]) => void): () => void {
  return onSnapshot(collection(db, "users", uid, "contacts"), (snap) => {
    const rows = snap.docs.map((d): Conversa => {
      const v = d.data();
      return {
        id: d.id,
        name: String(v.name ?? ""),
        whatsappDigits: String(v.whatsappDigits ?? v.whatsapp ?? ""),
        photoUrl: typeof v.photoUrl === "string" ? v.photoUrl : undefined,
        lastMessage: typeof v.lastMessage === "string" ? v.lastMessage : undefined,
        lastMessageAt: paraData(v.lastMessageAt),
        unreadCount: typeof v.unreadCount === "number" ? v.unreadCount : 0,
        clienteId: typeof v.clienteId === "string" ? v.clienteId : undefined,
        createdAt: paraData(v.createdAt),
      };
    });
    rows.sort((a, b) => quandoConversa(b) - quandoConversa(a));
    cb(rows);
  });
}

/** Teto de mensagens carregadas por conversa — o histórico inteiro não cabe na tela. */
const JANELA_MENSAGENS = 200;

/**
 * Assina as mensagens de uma conversa, das mais novas para trás.
 *
 * Aqui o `orderBy` é seguro (toda mensagem tem `sentAt`) e necessário: sem ele o `limit`
 * pegaria 200 mensagens quaisquer. Vem em ordem decrescente para o corte pegar as
 * ÚLTIMAS, e é invertido antes de entregar.
 */
export function subscribeMensagens(uid: string, contactId: string, cb: (rows: MensagemWa[]) => void): () => void {
  const q = query(
    collection(doc(db, "users", uid, "contacts", contactId), "messages"),
    orderBy("sentAt", "desc"),
    limit(JANELA_MENSAGENS),
  );
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d): MensagemWa => {
      const v = d.data();
      return {
        id: d.id,
        fromMe: v.fromMe === true,
        text: String(v.text ?? ""),
        sentAt: paraData(v.sentAt) ?? new Date(0),
        mediaType: v.mediaType,
        mediaUrl: typeof v.mediaUrl === "string" ? v.mediaUrl : undefined,
        mimeType: typeof v.mimeType === "string" ? v.mimeType : undefined,
        fileName: typeof v.fileName === "string" ? v.fileName : undefined,
        caption: typeof v.caption === "string" ? v.caption : undefined,
        pending: v.pending === true,
        mediaError: typeof v.mediaError === "string" ? v.mediaError : undefined,
        porIa: v.porIa === true,
      };
    });
    rows.reverse();
    cb(rows);
  });
}
