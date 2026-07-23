// Ciclo de vida de UMA sessão do WhatsApp (por tenant). Segue as seções 3, 4, 6 e
// 7 do guia: abre o socket, trata connection.update (QR / open / close), distingue
// loggedOut de queda recuperável (backoff), e persiste status em
// tenants/{t}/integrations/whatsapp para a UI ler.

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { db } from "./firebase.js";
import { useFirestoreAuthState } from "./firestoreAuthState.js";
import { handleIncoming } from "./ai/handleMessage.js";
import type { WhatsAppStatus } from "./types.js";

// Logger em 'warn'+ de propósito: em debug/trace o Baileys imprime corpo de
// mensagem e chaves. Nunca logar isso.
const waLogger = pino({ level: "warn" });
export const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

interface Session {
  sock: WASocket;
  stopping: boolean;
}

const sessions = new Map<string, Session>();
const backoffByTenant = new Map<string, number>(); // persiste entre reconexões
const dedupe = new Map<string, Set<string>>(); // tenantId -> msg ids vistos (dedupe)

function statusRef(tenantId: string) {
  return db.collection("tenants").doc(tenantId).collection("integrations").doc("whatsapp");
}

async function saveStatus(tenantId: string, patch: Record<string, unknown>) {
  await statusRef(tenantId).set(patch, { merge: true });
}

export function isLive(tenantId: string): boolean {
  return sessions.has(tenantId);
}

export function getSock(tenantId: string): WASocket | undefined {
  return sessions.get(tenantId)?.sock;
}

/** Corre `p` com um teto de tempo; se estourar, resolve `fallback` (não trava). */
function comTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

export async function startSession(tenantId: string): Promise<void> {
  // Um holder por sessão: se já existe, não abre outra (evita duplo-logout).
  if (sessions.has(tenantId)) return;

  log.info({ tenantId }, "startSession: carregando auth do Firestore");
  const { state, saveCreds, clearAuth } = await useFirestoreAuthState(db, tenantId);

  // fetchLatestBaileysVersion é OPCIONAL e pode PENDURAR (rede) — com teto de 5s
  // caímos na versão embutida do Baileys em vez de travar o startSession.
  let version: [number, number, number] | undefined;
  const v = await comTimeout(fetchLatestBaileysVersion().catch(() => null), 5000, null);
  if (v?.version) version = v.version;

  log.info({ tenantId, version }, "startSession: abrindo socket Baileys");

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, waLogger),
    },
    logger: waLogger,
    browser: ["O Cartel", "Chrome", "1.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  });

  const session: Session = { sock, stopping: false };
  sessions.set(tenantId, session);
  if (!dedupe.has(tenantId)) dedupe.set(tenantId, new Set());

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    log.info({ tenantId, connection, temQr: !!qr }, "connection.update");

    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr);
        await saveStatus(tenantId, { status: "qr" satisfies WhatsAppStatus, qr: dataUrl });
        log.info({ tenantId }, "QR gerado e salvo no Firestore");
      } catch (err) {
        log.error({ err, tenantId }, "falha ao gerar/salvar o QR");
      }
      return;
    }

    if (connection === "connecting") {
      await saveStatus(tenantId, { status: "connecting" satisfies WhatsAppStatus }).catch((err) =>
        log.error({ err, tenantId }, "falha ao salvar status connecting"),
      );
      return;
    }

    if (connection === "open") {
      backoffByTenant.set(tenantId, 0);
      const phone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      await saveStatus(tenantId, {
        status: "connected" satisfies WhatsAppStatus,
        qr: null,
        phone,
        desiredState: "connected",
        connectedAt: new Date().toISOString(),
      });
      log.info({ tenantId, phone }, "WhatsApp conectado");
      return;
    }

    if (connection === "close") {
      sessions.delete(tenantId);
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (session.stopping) return; // fechamento intencional (disconnect/shutdown)

      if (code === DisconnectReason.loggedOut) {
        // 401: desvinculado no celular. Sessão morta — limpa e EXIGE QR novo.
        await clearAuth();
        await saveStatus(tenantId, {
          status: "loggedOut" satisfies WhatsAppStatus,
          qr: null,
          phone: null,
          desiredState: "disconnected",
        });
        log.warn({ tenantId }, "WhatsApp deslogado (401) — não reconecta");
        return;
      }

      // Recuperável (queda de rede, 515 restart-required, conflito) → backoff.
      const attempt = (backoffByTenant.get(tenantId) ?? 0) + 1;
      backoffByTenant.set(tenantId, attempt);
      const delay = Math.min(1000 * 2 ** attempt, 60_000) + Math.random() * 1000;
      log.info({ tenantId, code, attempt, delay }, "reconectando…");
      setTimeout(() => {
        startSession(tenantId).catch((err) => log.error({ err, tenantId }, "falha ao reconectar"));
      }, delay);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return; // só mensagens novas ao vivo
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") continue; // ignora grupos/status
      const id = msg.key.id ?? "";
      const seen = dedupe.get(tenantId)!;
      if (id && seen.has(id)) continue;
      if (id) {
        seen.add(id);
        if (seen.size > 500) seen.delete(seen.values().next().value as string);
      }
      const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? "";
      if (!text.trim()) continue;
      handleIncoming({ tenantId, jid, text, sock }).catch((err) =>
        log.error({ err, tenantId, jid }, "falha ao processar mensagem"),
      );
    }
  });
}

/** Desliga o socket MAS mantém o device vinculado (SIGTERM/deploy). */
export function endSession(tenantId: string): void {
  const s = sessions.get(tenantId);
  if (!s) return;
  s.stopping = true;
  s.sock.end(undefined);
  sessions.delete(tenantId);
}

/** Desvincula o aparelho (botão "Desconectar" do usuário) e limpa o auth salvo. */
export async function logoutSession(tenantId: string): Promise<void> {
  const s = sessions.get(tenantId);
  if (s) {
    s.stopping = true;
    try {
      await s.sock.logout();
    } catch {
      /* pode já estar caído */
    }
    sessions.delete(tenantId);
  }
  const { clearAuth } = await useFirestoreAuthState(db, tenantId);
  await clearAuth();
  await saveStatus(tenantId, {
    status: "loggedOut" satisfies WhatsAppStatus,
    qr: null,
    phone: null,
    desiredState: "disconnected",
  });
}

export function endAllSessions(): void {
  for (const tenantId of [...sessions.keys()]) endSession(tenantId);
}
