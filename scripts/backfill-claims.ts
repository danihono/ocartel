/*
 * Aplica os custom claims (role/tenantId/barbeiroId) em TODOS os usuários que já
 * existem, lendo o doc users/{uid} como fonte da verdade.
 *
 * O app já se auto-corrige no primeiro acesso de cada usuário (ver
 * lib/firebase/auth.tsx), então este script é para adiantar o trabalho — e é
 * pré-requisito para remover o fallback `get(users/{uid})` das regras, que só
 * pode sair quando TODO mundo já tiver claim.
 *
 * Uso (emulador):
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   npm run backfill:claims
 *
 * Uso (produção — NÃO pode ter *_EMULATOR_HOST setado):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
 *   npm run backfill:claims
 *
 * Passe --dry para só listar o que mudaria, sem escrever nada.
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { claimsDesatualizados, claimsDoPerfil } from "../lib/claims";

async function main() {
  const dry = process.argv.includes("--dry");

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "ocartel-497f8";
  if (!getApps().length) initializeApp({ projectId });

  const auth = getAuth();
  const db = getFirestore();

  const snap = await db.collection("users").get();
  let aplicados = 0;
  let emDia = 0;
  let semPerfil = 0;
  let falhas = 0;

  for (const doc of snap.docs) {
    const alvo = claimsDoPerfil(doc.data() as Record<string, unknown>);
    if (!alvo) {
      semPerfil += 1;
      console.warn(`- ${doc.id}: papel ausente ou desconhecido — ignorado.`);
      continue;
    }

    try {
      const user = await auth.getUser(doc.id);
      if (!claimsDesatualizados(user.customClaims as Record<string, unknown>, alvo)) {
        emDia += 1;
        continue;
      }
      if (dry) {
        console.log(`~ ${doc.id}: aplicaria ${JSON.stringify(alvo)}`);
      } else {
        await auth.setCustomUserClaims(doc.id, alvo);
        console.log(`✓ ${doc.id}: ${JSON.stringify(alvo)}`);
      }
      aplicados += 1;
    } catch (e) {
      // users/{uid} sem conta correspondente no Auth (conta apagada, seed manual…).
      falhas += 1;
      const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : String(e);
      console.warn(`! ${doc.id}: ${code}`);
    }
  }

  console.log(
    `\n${dry ? "[dry] " : ""}${aplicados} aplicado(s) · ${emDia} já em dia · ${semPerfil} sem papel · ${falhas} falha(s).`,
  );
  if (!dry && aplicados > 0) {
    console.log("Os usuários afetados só enxergam o claim novo no próximo token (relogar ou até 1h).");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
