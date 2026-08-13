/*
 * Pareia o WhatsApp de uma barbearia com o daemon.
 *
 * No CRM de origem isso era um botão ("Gerar QR e conectar"); aqui não há tela
 * equivalente, então o pareamento é feito por este script. Ele:
 *   1. grava o vínculo em tenants/{tenantId}/private/whatsapp (é o que lib/canal lê);
 *   2. enfileira o consentimento e a conexão na fila que o daemon consome;
 *   3. espera o QR aparecer e salva num HTML para você abrir e escanear;
 *   4. acompanha até a sessão ficar conectada.
 *
 * O DAEMON PRECISA ESTAR RODANDO apontado para este projeto. Sem ele os comandos
 * ficam parados em "pending" e o script expira sem QR nenhum.
 *
 * Uso (produção):
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
 *   npm run whatsapp:parear -- <tenantId>
 *
 * Reconectar depois (mesma sessão, sem QR novo) é só rodar de novo: o daemon
 * reidrata o pareamento existente e o status vai direto para "connected".
 */

import { writeFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const ARQUIVO_QR = "whatsapp-qr.html";
const ESPERA_MAX_MS = 120_000;
const INTERVALO_MS = 2_000;

function db() {
  if (!getApps().length) {
    initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "ocartel-497f8",
    });
  }
  return getFirestore();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Enfileira um comando e espera o daemon finalizá-lo. */
async function comando(uid: string, type: string, args: Record<string, unknown> = {}) {
  const ref = await db()
    .collection(`users/${uid}/waCommands`)
    .add({
      type,
      args,
      status: "pending",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 3_600_000),
    });

  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    const snap = await ref.get();
    const status = snap.get("status");
    if (status === "done") return snap.get("result") ?? {};
    if (status === "error") {
      throw new Error(`${type} falhou: ${snap.get("error")?.message ?? "erro desconhecido"}`);
    }
    await dormir(INTERVALO_MS);
  }
  throw new Error(
    `${type} não foi processado em 60s. O daemon está rodando e apontado para este projeto?`,
  );
}

function salvarQr(dataUrl: string, tenantId: string) {
  writeFileSync(
    ARQUIVO_QR,
    `<!doctype html><meta charset="utf-8"><title>QR do WhatsApp — ${tenantId}</title>` +
      `<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee">` +
      `<div style="text-align:center"><h2>Escaneie no WhatsApp da barbearia</h2>` +
      `<p style="opacity:.7">Aparelhos conectados → Conectar um aparelho</p>` +
      `<img src="${dataUrl}" width="320" height="320" style="background:#fff;padding:12px;border-radius:12px">` +
      `<p style="opacity:.5;font-size:13px">O QR expira em ~1 min. Se vencer, rode o script de novo.</p></div>`,
  );
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("uso: npm run whatsapp:parear -- <tenantId>");
    process.exit(1);
  }

  const tenant = await db().doc(`tenants/${tenantId}`).get();
  if (!tenant.exists) {
    console.error(`Barbearia "${tenantId}" não existe neste projeto.`);
    process.exit(1);
  }

  // O uid é só uma chave de path para o daemon — não precisa ser usuário do Auth,
  // porque quem escreve na fila é sempre o Admin SDK.
  const uid = `barbearia-${tenantId}`;

  await db().doc(`tenants/${tenantId}/private/whatsapp`).set({ uid, vinculadoEm: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`vínculo gravado: tenants/${tenantId}/private/whatsapp → ${uid}`);

  // O daemon recusa conectar sem consentimento registrado.
  await comando(uid, "session.consent", { retentionDays: 0 });
  console.log("consentimento registrado");

  // Não espera o resultado: `session.connect` só retorna quando a sessão sobe, e o
  // QR aparece ANTES disso — o que interessa aqui é o status.
  void comando(uid, "session.connect").catch(() => {});
  console.log("conectando… aguardando QR");

  const limite = Date.now() + ESPERA_MAX_MS;
  let qrMostrado = "";

  while (Date.now() < limite) {
    const st = await db().doc(`whatsappStatus/${uid}`).get();
    const status = st.get("status");
    const qr = st.get("qr");

    if (status === "connected") {
      console.log(`\n✅ conectado${st.get("phoneNumber") ? ` · +${st.get("phoneNumber")}` : ""}`);
      console.log(`\nA barbearia já pode enviar. Ligue a confirmação em Configurações.`);
      process.exit(0);
    }
    if (typeof qr === "string" && qr && qr !== qrMostrado) {
      qrMostrado = qr;
      salvarQr(qr, tenantId);
      console.log(`\n📱 QR salvo em ${ARQUIVO_QR} — abra o arquivo e escaneie.`);
    }
    if (st.get("lastError")) console.log(`aviso do daemon: ${st.get("lastError")}`);

    await dormir(INTERVALO_MS);
  }

  console.error("\nTempo esgotado sem conectar. Verifique o log do daemon.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
