/*
 * Apaga barbearias (tenants) do Firestore — para começar a testar do zero.
 * Usa o Admin SDK. Remove o doc do tenant + TODAS as subcoleções (clientes,
 * agendamentos, servicos, barbeiros, transacoes, planos, planosTiers, config)
 * e o doc de slug correspondente. É IRREVERSÍVEL.
 *
 * Modos:
 *   --all            apaga TODAS as barbearias e todos os slugs (reset total)
 *   --demo           apaga só as barbearias chamadas "Barbearia Demo"
 *   <slug|tenantId>  apaga uma barbearia específica
 *
 * Contra o EMULADOR (rode com o emulador ligado):
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:NEXT_PUBLIC_FIREBASE_PROJECT_ID="ocartel-497f8"; npm run limpar:tenants -- --demo
 *
 * Contra PRODUÇÃO (CUIDADO — irreversível; precisa de service account):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="./serviceAccount.json"; $env:NEXT_PUBLIC_FIREBASE_PROJECT_ID="ocartel-497f8"; npm run limpar:tenants -- --demo
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";

async function apagarTenant(db: Firestore, snap: DocumentSnapshot): Promise<void> {
  const data = snap.data();
  if (!data) return;
  const slug = data.slug as string | undefined;
  await db.recursiveDelete(snap.ref); // remove o doc + todas as subcoleções
  if (slug) await db.collection("slugs").doc(slug).delete().catch(() => {});
  console.log(`apagada: ${data.nome ?? snap.id} (${snap.id})${slug ? ` + slug "${slug}"` : ""}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Uso: npm run limpar:tenants -- (--all | --demo | <slug|tenantId>)");
    process.exit(1);
  }

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "ocartel-497f8";
  const noEmulador = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (!getApps().length) initializeApp({ projectId });
  const db = getFirestore();

  console.log(`Projeto: ${projectId} ${noEmulador ? "(EMULADOR)" : "(PRODUÇÃO)"}`);

  const tenantsCol = db.collection("tenants");
  let alvos: DocumentSnapshot[] = [];

  if (arg === "--all") {
    alvos = (await tenantsCol.get()).docs;
  } else if (arg === "--demo") {
    alvos = (await tenantsCol.where("nome", "==", "Barbearia Demo").get()).docs;
  } else {
    // tenta resolver como slug -> tenantId; senão trata o arg como tenantId direto.
    const bySlug = await db.collection("slugs").doc(arg).get();
    const tid = bySlug.exists ? (bySlug.data()!.tenantId as string) : arg;
    const t = await tenantsCol.doc(tid).get();
    if (t.exists) alvos = [t];
  }

  if (alvos.length === 0) {
    console.log("Nada encontrado para apagar.");
    process.exit(0);
  }

  console.log(`Apagando ${alvos.length} barbearia(s)…`);
  for (const t of alvos) await apagarTenant(db, t);

  if (arg === "--all") {
    // limpa slugs órfãos (de tenants que por acaso não tinham o campo slug).
    const slugs = await db.collection("slugs").get();
    await Promise.all(slugs.docs.map((d) => d.ref.delete()));
    console.log(`slugs remanescentes apagados: ${slugs.size}`);
  }

  console.log("OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
