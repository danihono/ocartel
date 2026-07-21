// Firebase Admin — inicialização única. Em produção (Cloud Run no mesmo projeto)
// usa ADC; em dev usa FIRESTORE_EMULATOR_HOST ou GOOGLE_APPLICATION_CREDENTIALS.

import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function app() {
  const existing = getApps();
  if (existing.length) return existing[0];
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "ocartel-497f8";
  // applicationDefault() cobre ADC (Cloud Run) e GOOGLE_APPLICATION_CREDENTIALS (local).
  try {
    return initializeApp({ projectId, credential: applicationDefault() });
  } catch {
    // Emulador: sem credencial, só projectId.
    return initializeApp({ projectId });
  }
}

export const db: Firestore = getFirestore(app());
