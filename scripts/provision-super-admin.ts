/*
 * Promove um usuário existente a superAdmin (papel que o auto-cadastro nunca
 * concede). Roda fora do app, com o Admin SDK.
 *
 * Uso:
 *   npm run provision:super-admin -- voce@dominio.com
 *
 * Contra o EMULADOR (o usuário precisa já ter feito cadastro no /login):
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   npm run provision:super-admin -- voce@dominio.com
 *
 * Contra PRODUÇÃO:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   npm run provision:super-admin -- voce@dominio.com
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npm run provision:super-admin -- voce@dominio.com");
    process.exit(1);
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "o-cartel";
  if (!getApps().length) initializeApp({ projectId });

  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUserByEmail(email);
  await db.collection("users").doc(user.uid).set({ role: "superAdmin" }, { merge: true });
  try {
    await auth.setCustomUserClaims(user.uid, { role: "superAdmin" });
  } catch {
    /* custom claim é opcional — as regras usam o doc users/{uid}.role */
  }

  console.log(`OK: ${email} (${user.uid}) agora é superAdmin.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
