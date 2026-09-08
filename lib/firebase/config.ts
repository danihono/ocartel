// Inicialização do Firebase no cliente (Web SDK). Singleton com guarda de
// getApps() para sobreviver ao HMR. Conecta nos emuladores quando
// NEXT_PUBLIC_USE_EMULATORS === "true" (desenvolvimento local).

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check — atesta que quem fala com o Firestore é ESTE site, e não um script apontando
// o SDK para o projeto. É camada COMPLEMENTAR: não substitui autenticação nem as regras,
// e não protege as server actions (que não passam pelo SDK do cliente). O que ele corta é
// a raspagem das coleções públicas e o consumo de cota por robô.
//
// Só liga quando `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` existe: sem a variável, nada muda — dá
// para publicar o resto das correções antes de registrar o site no Console. A ordem certa
// é registrar → publicar com a chave → observar as métricas em modo NÃO obrigatório →
// só então exigir App Check no Firestore.
const APPCHECK_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const acGlobal = globalThis as typeof globalThis & { __OCARTEL_APPCHECK__?: boolean };
if (APPCHECK_KEY && typeof window !== "undefined" && !acGlobal.__OCARTEL_APPCHECK__) {
  acGlobal.__OCARTEL_APPCHECK__ = true;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(APPCHECK_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* App Check não pode derrubar o app: sem ele, valem autenticação e regras. */
  }
}

export const auth: Auth = getAuth(app);

// Firestore com auto-detecção de long-polling: em produção (atrás de CDN/HTTP3 ou
// redes/proxies que cortam o streaming WebChannel) o `onSnapshot` falha com
// [unavailable] e os listeners — inclusive o de users/{uid} — nunca resolvem,
// derrubando o usuário de volta pro /login. O auto-detect cai pra long-polling
// quando o WebChannel não vinga.
//
// `persistentLocalCache` guarda os documentos no IndexedDB: no reload o primeiro
// `onSnapshot` dispara direto do cache (antes de qualquer round-trip de rede), e
// o painel já abre com dados em vez de zerado. O `persistentMultipleTabManager`
// permite várias abas abertas ao mesmo tempo (sem ele a 2ª aba falha a
// persistência) — a "Tela do cliente" e a "Tela do barbeiro" abrem em abas novas.
//
// O try/catch torna idempotente sob HMR (initializeFirestore só pode rodar uma
// vez por app).
function criarDb(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    return getFirestore(app);
  }
}
export const db: Firestore = criarDb();

// Liga os emuladores uma única vez, só no cliente. A conexão precisa acontecer
// antes de qualquer chamada ao Firestore — por isso roda no carregamento do módulo.
const emuGlobal = globalThis as typeof globalThis & { __OCARTEL_EMU__?: boolean };
if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && typeof window !== "undefined" && !emuGlobal.__OCARTEL_EMU__) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  emuGlobal.__OCARTEL_EMU__ = true;
}
