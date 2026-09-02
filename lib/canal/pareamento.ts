// Pareamento do WhatsApp de uma barbearia com o daemon.
//
// Compartilhado pela tela de Configurações (server actions) e pelo script de
// diagnóstico. Dois caminhos com código próprio divergiriam, e um conserto num não
// valeria no outro — por isso a lógica mora aqui, e não em cada um.
//
// Só servidor (Admin SDK). Nunca importe de um componente do cliente.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { uidDaBarbearia } from "./uid";

/** Validade do doc de comando — casada com o TTL nativo esperado pelo daemon. */
const COMANDO_TTL_MS = 3_600_000;

// Mora em ./uid.ts porque o navegador também precisa dela (ver o comentário de lá);
// reexportado aqui para quem já importava daqui continuar funcionando.
export { uidDaBarbearia } from "./uid";

export type StatusPareamento =
  | "desconectado"
  | "conectando"
  | "qr"
  | "conectado"
  | "desvinculado";

export interface EstadoPareamento {
  status: StatusPareamento;
  /** Data URL do PNG do QR, quando houver um para escanear. */
  qr: string | null;
  /** Número conectado, só dígitos. */
  numero: string | null;
  /** Último erro reportado pelo daemon (código cru). */
  erro: string | null;
  /** false quando o daemon não dá sinal de vida — a tela precisa dizer isso. */
  daemonOnline: boolean;
}

/** Batidas a cada 30 s; 120 s cobre uma perdida mais atraso de rede. */
const HEARTBEAT_LIMITE_MS = 120_000;

async function daemonOnline(): Promise<boolean> {
  const snap = await adminDb.doc("whatsappDaemon/heartbeat").get();
  const ts = snap.get("updatedAt");
  const ms = ts instanceof Timestamp ? ts.toMillis() : 0;
  return Date.now() - ms < HEARTBEAT_LIMITE_MS;
}

async function enfileirar(uid: string, type: string, args: Record<string, unknown> = {}) {
  await adminDb.collection(`users/${uid}/waCommands`).add({
    type,
    args,
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + COMANDO_TTL_MS),
  });
}

/**
 * Começa (ou refaz) o pareamento. Grava o vínculo que `canalDoTenant` lê e enfileira o
 * consentimento e a conexão. Não espera o resultado: o QR aparece ANTES de `session.connect`
 * retornar, e é o estado que a tela acompanha.
 */
export async function iniciarPareamento(tenantId: string): Promise<{ ok: boolean; erro?: string }> {
  if (!(await daemonOnline())) {
    return { ok: false, erro: "O serviço de WhatsApp está fora do ar. Tente novamente em instantes." };
  }

  const uid = uidDaBarbearia(tenantId);
  await adminDb
    .doc(`tenants/${tenantId}/private/whatsapp`)
    .set({ uid, vinculadoEm: FieldValue.serverTimestamp() }, { merge: true });

  // O daemon recusa conectar sem consentimento registrado.
  await enfileirar(uid, "session.consent", { retentionDays: 0 });
  await enfileirar(uid, "session.connect");
  return { ok: true };
}

/** Estado atual, para a tela mostrar o QR e saber quando parou de precisar perguntar. */
export async function lerEstadoPareamento(tenantId: string): Promise<EstadoPareamento> {
  const uid = uidDaBarbearia(tenantId);
  const [snap, online] = await Promise.all([adminDb.doc(`whatsappStatus/${uid}`).get(), daemonOnline()]);

  const bruto = String(snap.get("status") ?? "disconnected");
  const status: StatusPareamento =
    bruto === "connected"
      ? "conectado"
      : bruto === "qr"
        ? "qr"
        : bruto === "connecting"
          ? "conectando"
          : bruto === "loggedOut"
            ? "desvinculado"
            : "desconectado";

  const qr = snap.get("qr");
  const numero = snap.get("phoneNumber");
  const erro = snap.get("lastError");

  return {
    status,
    qr: typeof qr === "string" && qr ? qr : null,
    numero: typeof numero === "string" && numero ? numero : null,
    erro: typeof erro === "string" && erro ? erro : null,
    daemonOnline: online,
  };
}

/** Desconecta mantendo as mensagens (não expurga nada). */
export async function desconectarPareamento(tenantId: string): Promise<{ ok: boolean; erro?: string }> {
  if (!(await daemonOnline())) {
    return { ok: false, erro: "O serviço de WhatsApp está fora do ar. Tente novamente em instantes." };
  }
  await enfileirar(uidDaBarbearia(tenantId), "session.disconnect", { purge: false });
  return { ok: true };
}
