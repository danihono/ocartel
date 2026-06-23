// Inicialização do Firebase no cliente (Web SDK). Singleton com guarda de
// getApps() para sobreviver ao HMR. Conecta nos emuladores quando
// NEXT_PUBLIC_USE_EMULATORS === "true" (desenvolvimento local).

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Liga os emuladores uma única vez, só no cliente. A conexão precisa acontecer
// antes de qualquer chamada ao Firestore — por isso roda no carregamento do módulo.
const emuGlobal = globalThis as typeof globalThis & { __OCARTEL_EMU__?: boolean };
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && typeof window !== "undefined" && !emuGlobal.__OCARTEL_EMU__) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  emuGlobal.__OCARTEL_EMU__ = true;
}
