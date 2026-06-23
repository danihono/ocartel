// Firebase Admin SDK — APENAS no servidor (server actions / route handlers).
// Nunca importe isto de um componente do cliente.
//
// Em produção (Firebase App Hosting) usa as credenciais padrão do ambiente (ADC).
// Em desenvolvimento com emulador, o Admin SDK detecta FIRESTORE_EMULATOR_HOST
// automaticamente; basta o projectId bater com o do emulador.

import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function adminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "o-cartel";
  return initializeApp({ projectId });
}

export const adminDb = getFirestore(adminApp());
