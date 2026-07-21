// Persistência do auth do Baileys no FIRESTORE (não em disco). Segue a seção 5 do
// guia: `creds` num doc único que muda raramente; cada chave do Signal num doc
// próprio (mudam a quase toda mensagem); serialização com BufferJSON (preserva os
// Buffers); leitura em LOTE; store type-agnostic (aceita tipos novos do v7).
//
// Layout: tenants/{t}/waAuth/creds  +  tenants/{t}/waAuth/key_<base64url(type\0id)>

import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import type { AuthenticationCreds, SignalDataTypeMap } from "@whiskeysockets/baileys";
import type { Firestore } from "firebase-admin/firestore";

const CREDS_ID = "creds";
const keyDocId = (type: string, id: string) => "key_" + Buffer.from(`${type}\0${id}`).toString("base64url");

const serialize = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const deserialize = (s: string) => JSON.parse(s, BufferJSON.reviver);

export interface FirestoreAuth {
  state: {
    creds: AuthenticationCreds;
    keys: {
      get: <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ) => Promise<{ [id: string]: SignalDataTypeMap[T] }>;
      set: (data: { [t: string]: { [id: string]: unknown } }) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
  clearAuth: () => Promise<void>;
}

export async function useFirestoreAuthState(db: Firestore, tenantId: string): Promise<FirestoreAuth> {
  const authCol = db.collection("tenants").doc(tenantId).collection("waAuth");
  const credsRef = authCol.doc(CREDS_ID);

  const credsSnap = await credsRef.get();
  const creds: AuthenticationCreds =
    credsSnap.exists && typeof credsSnap.data()?.data === "string"
      ? (deserialize(credsSnap.data()!.data) as AuthenticationCreds)
      : initAuthCreds();

  const state: FirestoreAuth["state"] = {
    creds,
    keys: {
      // Lê N chaves numa tacada só (db.getAll) — evita amplificação de leitura.
      get: async (type, ids) => {
        const out: { [id: string]: any } = {};
        if (ids.length === 0) return out;
        const refs = ids.map((id) => authCol.doc(keyDocId(type, id)));
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, i) => {
          const raw = snap.exists ? snap.data()?.data : null;
          if (typeof raw !== "string") return;
          let value = deserialize(raw);
          // v7: app-state-sync-key precisa voltar ao tipo proto correto.
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          out[ids[i]] = value;
        });
        return out;
      },
      // Grava/apaga em lote — chegam muitas chaves a cada mensagem.
      set: async (data) => {
        const batch = db.batch();
        for (const type of Object.keys(data)) {
          for (const id of Object.keys(data[type])) {
            const value = data[type][id];
            const ref = authCol.doc(keyDocId(type, id));
            if (value) batch.set(ref, { data: serialize(value) });
            else batch.delete(ref);
          }
        }
        await batch.commit();
      },
    },
  };

  const saveCreds = async () => {
    await credsRef.set({ data: serialize(creds) });
  };

  const clearAuth = async () => {
    // Apaga TODA a subcollection waAuth (creds + todas as chaves), em lotes de 400.
    const snap = await authCol.get();
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  };

  return { state, saveCreds, clearAuth };
}
