// Orquestra as sessões a partir do Firestore — por POLLING, não por listeners.
//
// Os listeners em tempo real (onSnapshot) do Firestore Admin SDK são um stream
// gRPC de longa duração que, no Cloud Run, morre de tempos em tempos com
// "Exceeded maximum number of retries allowed" — deixando o worker surdo. Aqui a
// gente troca por leituras pontuais (.get()) num loop: chamada curta, robusta, sem
// stream pra cair. Latência de alguns segundos é irrelevante para o caso (conectar,
// reidratar, confirmar).
//
// A cada ciclo, para cada tenant (barbearia):
//  1. lê integrations/whatsapp → comando connect/disconnect (dedupe por ts) +
//     reidratação (desiredState connected e sem socket vivo).
//  2. lê waPropostas (confirmacaoPendente==true) → envia a confirmação ao cliente.

import { db } from "./firebase.js";
import { startSession, logoutSession, endSession, isLive, getSock, log } from "./session.js";

const POLL_MS = 4000; // intervalo do ciclo
const REFRESH_TENANTS_MS = 60_000; // recarrega a lista de tenants a cada 1 min

const ultimoComando = new Map<string, number>(); // dedupe de command.ts por tenant
let tenantIds: string[] = [];
let ultimaListagem = 0;
let rodando = false;

function tenantRef(tenantId: string) {
  return db.collection("tenants").doc(tenantId);
}

async function tenantIdsAtuais(): Promise<string[]> {
  const agora = Date.now();
  if (tenantIds.length === 0 || agora - ultimaListagem > REFRESH_TENANTS_MS) {
    const snap = await db.collection("tenants").get();
    tenantIds = snap.docs.map((d) => d.id);
    ultimaListagem = agora;
  }
  return tenantIds;
}

async function processarTenant(tenantId: string) {
  const ref = tenantRef(tenantId);

  // 1. comando / reidratação
  const waSnap = await ref.collection("integrations").doc("whatsapp").get();
  if (waSnap.exists) {
    const data = waSnap.data() ?? {};
    const cmd = data.command as { action?: string; ts?: number } | undefined;

    if (cmd?.action && typeof cmd.ts === "number" && cmd.ts !== ultimoComando.get(tenantId)) {
      ultimoComando.set(tenantId, cmd.ts);
      log.info({ tenantId, action: cmd.action }, "comando recebido");
      if (cmd.action === "connect") {
        startSession(tenantId).catch((err) => log.error({ err, tenantId }, "connect falhou"));
      } else if (cmd.action === "disconnect") {
        logoutSession(tenantId).catch((err) => log.error({ err, tenantId }, "disconnect falhou"));
      }
    } else if (data.desiredState === "connected" && data.status !== "loggedOut" && !isLive(tenantId)) {
      // Reidratação / auto-recuperação: quer estar conectado mas não há socket vivo.
      log.info({ tenantId }, "reidratando sessão");
      startSession(tenantId).catch((err) => log.error({ err, tenantId }, "reidratação falhou"));
    }
  }

  // 2. confirmações pendentes de propostas aprovadas
  const props = await ref.collection("waPropostas").where("confirmacaoPendente", "==", true).get();
  for (const doc of props.docs) {
    const p = doc.data();
    const sock = getSock(tenantId);
    if (!sock) continue; // sem sessão viva agora; tenta no próximo ciclo
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
}

async function tick() {
  if (rodando) return; // não sobrepõe ciclos
  rodando = true;
  try {
    const ids = await tenantIdsAtuais();
    for (const id of ids) {
      try {
        await processarTenant(id);
      } catch (err) {
        log.error({ err, tenantId: id }, "erro ao processar tenant");
      }
    }
  } catch (err) {
    log.error({ err }, "erro no ciclo de polling (tenants)");
  } finally {
    rodando = false;
  }
}

/** Inicia o controle por polling. Substitui os antigos listeners onSnapshot. */
export function watchTenants() {
  log.info({ pollMs: POLL_MS }, "controle por polling iniciado");
  setInterval(() => {
    tick().catch((err) => log.error({ err }, "tick falhou"));
  }, POLL_MS);
  tick().catch((err) => log.error({ err }, "tick inicial falhou"));
}

export { endSession };
