// Orquestra as sessões a partir do Firestore. Para cada tenant (barbearia) escuta:
//  1. integrations/whatsapp  → comando connect/disconnect + reidratação no boot.
//  2. waPropostas (confirmacaoPendente==true) → envia a confirmação ao cliente.
//
// Usa listeners POR TENANT (não collectionGroup) de propósito: consultas de campo
// único dentro de UMA coleção são auto-indexadas pelo Firestore — sem precisar
// criar índice de collection-group manualmente.

import { db } from "./firebase.js";
import { startSession, logoutSession, endSession, isLive, getSock, log } from "./session.js";

const attached = new Set<string>(); // tenants já com listeners
const ultimoComando = new Map<string, number>(); // dedupe de command.ts por tenant

function tenantRef(tenantId: string) {
  return db.collection("tenants").doc(tenantId);
}

function attachTenant(tenantId: string) {
  if (attached.has(tenantId)) return;
  attached.add(tenantId);

  // (1) status/comando do WhatsApp
  tenantRef(tenantId)
    .collection("integrations")
    .doc("whatsapp")
    .onSnapshot(
      (snap) => {
        if (!snap.exists) return;
        const data = snap.data() ?? {};

        // Comando explícito da UI (connect/disconnect), deduplicado por ts.
        const cmd = data.command as { action?: string; ts?: number } | undefined;
        if (cmd?.action && typeof cmd.ts === "number" && cmd.ts !== ultimoComando.get(tenantId)) {
          ultimoComando.set(tenantId, cmd.ts);
          if (cmd.action === "connect") {
            startSession(tenantId).catch((err) => log.error({ err, tenantId }, "connect falhou"));
          } else if (cmd.action === "disconnect") {
            logoutSession(tenantId).catch((err) => log.error({ err, tenantId }, "disconnect falhou"));
          }
          return;
        }

        // Reidratação: sessão marcada como conectada mas sem socket vivo → recria
        // sem QR (após restart/deploy). Stagger para evitar thundering-herd.
        if (data.desiredState === "connected" && data.status !== "loggedOut" && !isLive(tenantId)) {
          setTimeout(
            () => startSession(tenantId).catch((err) => log.error({ err, tenantId }, "reidratação falhou")),
            Math.random() * 800,
          );
        }
      },
      (err) => log.error({ err, tenantId }, "listener de status caiu"),
    );

  // (2) confirmações pendentes de propostas aprovadas
  tenantRef(tenantId)
    .collection("waPropostas")
    .where("confirmacaoPendente", "==", true)
    .onSnapshot(
      async (snap) => {
        for (const doc of snap.docs) {
          const p = doc.data();
          const sock = getSock(tenantId);
          if (!sock) continue; // sem sessão viva agora; tenta de novo no próximo snapshot
          const jid = String(p.jid ?? "");
          if (!jid) {
            await doc.ref.update({ confirmacaoPendente: false });
            continue;
          }
          const texto =
            `✅ Agendamento confirmado!\n` +
            `${p.servicoNome ?? "Serviço"} com ${p.barbeiroNome ?? "nosso profissional"}\n` +
            `${p.date} às ${p.inicio}.\n` +
            `Qualquer coisa, é só chamar por aqui.`;
          try {
            await sock.sendMessage(jid, { text: texto });
            await doc.ref.update({ confirmacaoPendente: false });
            log.info({ tenantId, jid }, "confirmação enviada");
          } catch (err) {
            log.error({ err, tenantId, jid }, "falha ao enviar confirmação");
          }
        }
      },
      (err) => log.error({ err, tenantId }, "listener de propostas caiu"),
    );
}

/** Escuta a coleção de tenants e liga os listeners de cada barbearia (inclui novas). */
export function watchTenants() {
  db.collection("tenants").onSnapshot(
    (snap) => {
      for (const doc of snap.docs) attachTenant(doc.id);
    },
    (err) => log.error({ err }, "listener de tenants caiu"),
  );
}

export { endSession };
