/*
 * Provisiona um superAdmin (papel que o auto-cadastro nunca concede). Roda fora
 * do app, com o Admin SDK. Se o usuário ainda não existir no Auth e uma senha
 * for passada, ele é CRIADO; caso já exista e venha senha, a senha é atualizada.
 * Em ambos os casos, grava role "superAdmin" no doc users/{uid} + custom claim.
 *
 * Uso (promove usuário já existente):
 *   npm run provision:super-admin -- voce@dominio.com
 *
 * Uso (cria o usuário com senha, se não existir, e promove):
 *   npm run provision:super-admin -- voce@dominio.com suaSenha
 *
 * Contra o EMULADOR:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   npm run provision:super-admin -- voce@dominio.com suaSenha
 *
 * Contra PRODUÇÃO (NÃO pode ter FIRESTORE_EMULATOR_HOST setado):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
 *   npm run provision:super-admin -- voce@dominio.com suaSenha
 */

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

async function main() {
  const email = process.argv[2];
  const senha = process.argv[3]; // opcional
  if (!email) {
    console.error("Uso: npm run provision:super-admin -- voce@dominio.com [senha]");
    process.exit(1);
  }

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "ocartel-497f8";
  if (!getApps().length) initializeApp({ projectId });

  const auth = getAuth();
  const db = getFirestore();

  // Pega o usuário; cria se não existir (precisa de senha). Se existir e veio
  // senha, atualiza a senha — útil pra corrigir uma criação com senha errada.
  let user: UserRecord;
  try {
    user = await auth.getUserByEmail(email);
    if (senha) {
      user = await auth.updateUser(user.uid, { password: senha });
      console.log(`Senha de ${email} atualizada.`);
    }
  } catch (e) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code !== "auth/user-not-found") throw e;
    if (!senha) {
      console.error(`Usuário ${email} não existe no Auth. Passe uma senha pra criá-lo:`);
      console.error(`  npm run provision:super-admin -- ${email} suaSenha`);
      process.exit(1);
    }
    user = await auth.createUser({ email, password: senha, emailVerified: true });
    console.log(`Usuário ${email} criado no Auth.`);
  }

  // Preenche o shape de UserProfile (role/tenantId/nome/email) sem sobrescrever
  // um tenantId já existente (caso esteja promovendo um admin).
  const ref = db.collection("users").doc(user.uid);
  const existing = (await ref.get()).data() ?? {};
  await ref.set(
    {
      role: "superAdmin",
      email,
      nome: existing.nome || user.displayName || email.split("@")[0],
      tenantId: existing.tenantId ?? "",
    },
    { merge: true },
  );
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
