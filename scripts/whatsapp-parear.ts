/*
 * Pareamento do WhatsApp por linha de comando.
 *
 * O caminho normal é a tela de Configurações do painel — é lá que o dono da barbearia
 * conecta o WhatsApp dele, com o QR aparecendo e se renovando na própria página. Este
 * script existe para DIAGNÓSTICO: quando algo trava e é preciso parear sem passar pelo
 * app, ou verificar o estado direto no Firestore.
 *
 * A lógica é a mesma da tela (lib/canal/pareamento.ts) de propósito — se cada um tivesse
 * a sua, um conserto num não valeria no outro.
 *
 * O DAEMON PRECISA ESTAR RODANDO apontado para este projeto.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
 *   npm run whatsapp:parear -- <tenantId>
 */

import { writeFileSync } from "node:fs";
import { adminDb } from "@/lib/firebase/admin";
import { iniciarPareamento, lerEstadoPareamento } from "@/lib/canal/pareamento";

const ARQUIVO_QR = "whatsapp-qr.html";
const ESPERA_MAX_MS = 120_000;
const INTERVALO_MS = 2_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function salvarQr(dataUrl: string, tenantId: string) {
  writeFileSync(
    ARQUIVO_QR,
    `<!doctype html><meta charset="utf-8"><title>QR do WhatsApp — ${tenantId}</title>` +
      `<meta http-equiv="refresh" content="3">` +
      `<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee">` +
      `<div style="text-align:center"><h2>Escaneie no WhatsApp da barbearia</h2>` +
      `<p style="opacity:.7">Aparelhos conectados → Conectar um aparelho</p>` +
      `<img src="${dataUrl}" width="320" height="320" style="background:#fff;padding:12px;border-radius:12px">` +
      `<p style="opacity:.5;font-size:13px">Esta página se atualiza sozinha a cada 3s.</p></div>`,
  );
}

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    console.error("uso: npm run whatsapp:parear -- <tenantId>");
    process.exit(1);
  }

  const tenant = await adminDb.doc(`tenants/${tenantId}`).get();
  if (!tenant.exists) {
    console.error(`Barbearia "${tenantId}" não existe neste projeto.`);
    process.exit(1);
  }

  const inicio = await iniciarPareamento(tenantId);
  if (!inicio.ok) {
    console.error(inicio.erro);
    process.exit(1);
  }
  console.log("conectando… aguardando QR");

  const limite = Date.now() + ESPERA_MAX_MS;
  let ultimoQr = "";

  while (Date.now() < limite) {
    const st = await lerEstadoPareamento(tenantId);

    if (st.status === "conectado") {
      console.log(`\n✅ conectado${st.numero ? ` · +${st.numero}` : ""}`);
      process.exit(0);
    }
    if (st.qr && st.qr !== ultimoQr) {
      ultimoQr = st.qr;
      salvarQr(st.qr, tenantId);
      console.log(`📱 QR atualizado em ${ARQUIVO_QR}`);
    }
    if (st.erro) console.log(`aviso do daemon: ${st.erro}`);

    await dormir(INTERVALO_MS);
  }

  console.error("\nTempo esgotado sem conectar. Verifique o log do daemon.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
