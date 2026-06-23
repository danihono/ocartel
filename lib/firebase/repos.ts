// Camada de repositório escopada por tenant. Cada coleção vive em
// tenants/{tenantId}/<colecao>. As funções `subscribe*` abrem listeners em tempo
// real (onSnapshot) e devolvem o unsubscribe; as escritas vão direto pro
// Firestore (sem dispatch otimista — o snapshot reflete de volta).

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "./config";
import type {
  Agendamento,
  AgendamentoStatus,
  Barbeiro,
  Cliente,
  ConfigBarbearia,
  PlanoTier,
  Servico,
  Tenant,
  Transacao,
} from "@/lib/types";

// ---- helpers ----
const col = (tenantId: string, name: string) => collection(db, "tenants", tenantId, name);
const sub = (tenantId: string, name: string) => doc(db, "tenants", tenantId, name);

function rows<T>(snap: QuerySnapshot<DocumentData>): T[] {
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as T[];
}

/** Remove o `id` (Firestore gera o seu próprio) de um objeto de domínio. */
function semId<T extends { id: string }>(obj: T): Omit<T, "id"> {
  const { id: _id, ...rest } = obj;
  return rest;
}

// ---- Clientes ----
export const clientes = {
  subscribe(tenantId: string, cb: (rows: Cliente[]) => void) {
    return onSnapshot(query(col(tenantId, "clientes"), orderBy("createdAt", "desc")), (s) => cb(rows<Cliente>(s)));
  },
  add(tenantId: string, c: Cliente) {
    return addDoc(col(tenantId, "clientes"), { ...semId(c), createdAt: serverTimestamp() });
  },
  update(tenantId: string, c: Cliente) {
    return updateDoc(sub(tenantId, "clientes/" + c.id), semId(c) as DocumentData);
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "clientes/" + id));
  },
};

// ---- Barbeiros ----
export const barbeiros = {
  subscribe(tenantId: string, cb: (rows: Barbeiro[]) => void) {
    return onSnapshot(col(tenantId, "barbeiros"), (s) => cb(rows<Barbeiro>(s)));
  },
  add(tenantId: string, b: Barbeiro) {
    return addDoc(col(tenantId, "barbeiros"), { ...semId(b), createdAt: serverTimestamp() });
  },
  update(tenantId: string, b: Barbeiro) {
    return updateDoc(sub(tenantId, "barbeiros/" + b.id), semId(b) as DocumentData);
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "barbeiros/" + id));
  },
};

// ---- Serviços ----
export const servicos = {
  subscribe(tenantId: string, cb: (rows: Servico[]) => void) {
    return onSnapshot(col(tenantId, "servicos"), (s) => cb(rows<Servico>(s)));
  },
  add(tenantId: string, s: Servico) {
    return addDoc(col(tenantId, "servicos"), { ...semId(s), createdAt: serverTimestamp() });
  },
  update(tenantId: string, s: Servico) {
    return updateDoc(sub(tenantId, "servicos/" + s.id), semId(s) as DocumentData);
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "servicos/" + id));
  },
};

// ---- Transações ----
export const transacoes = {
  subscribe(tenantId: string, cb: (rows: Transacao[]) => void) {
    return onSnapshot(query(col(tenantId, "transacoes"), orderBy("createdAt", "desc")), (s) => cb(rows<Transacao>(s)));
  },
  add(tenantId: string, t: Transacao) {
    return addDoc(col(tenantId, "transacoes"), { ...semId(t), createdAt: serverTimestamp() });
  },
  marcarPaga(tenantId: string, id: string) {
    return updateDoc(sub(tenantId, "transacoes/" + id), { status: "pago" });
  },
};

// ---- Agendamentos ----
export const agendamentos = {
  subscribe(tenantId: string, cb: (rows: Agendamento[]) => void) {
    return onSnapshot(col(tenantId, "agendamentos"), (s) => cb(rows<Agendamento>(s)));
  },
  add(tenantId: string, a: Agendamento) {
    return addDoc(col(tenantId, "agendamentos"), { ...semId(a), createdAt: serverTimestamp() });
  },
  setStatus(tenantId: string, id: string, status: AgendamentoStatus) {
    return updateDoc(sub(tenantId, "agendamentos/" + id), { status });
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "agendamentos/" + id));
  },
  /** Conclui o atendimento e gera a transação correspondente — atomicamente. */
  concluir(tenantId: string, id: string, transacao: Transacao) {
    const batch = writeBatch(db);
    batch.update(sub(tenantId, "agendamentos/" + id), { status: "concluido" });
    batch.set(doc(col(tenantId, "transacoes")), { ...semId(transacao), createdAt: serverTimestamp() });
    return batch.commit();
  },
};

// ---- Config da barbearia (doc único `main`) ----
export const config = {
  subscribe(tenantId: string, cb: (config: ConfigBarbearia | null) => void) {
    return onSnapshot(sub(tenantId, "config/main"), (s) => cb(s.exists() ? (s.data() as ConfigBarbearia) : null));
  },
  update(tenantId: string, patch: Partial<ConfigBarbearia>) {
    return setDoc(sub(tenantId, "config/main"), patch, { merge: true });
  },
};

// ---- Planos de assinatura (tiers) ----
export const planosTiers = {
  subscribe(tenantId: string, cb: (rows: PlanoTier[]) => void) {
    return onSnapshot(col(tenantId, "planosTiers"), (s) => cb(rows<PlanoTier>(s)));
  },
  update(tenantId: string, tier: PlanoTier) {
    return setDoc(sub(tenantId, "planosTiers/" + tier.id), tier, { merge: true });
  },
};

// ---- Tenants (console super-admin) ----
export const tenants = {
  /** superAdmin: observa todas as barbearias. */
  subscribeAll(cb: (rows: Tenant[]) => void) {
    return onSnapshot(collection(db, "tenants"), (s) => cb(rows<Tenant>(s)));
  },
  /** Observa apenas o próprio tenant (para alimentar barbeariaNome, etc.). */
  subscribeOne(tenantId: string, cb: (tenant: Tenant | null) => void) {
    return onSnapshot(doc(db, "tenants", tenantId), (s) => cb(s.exists() ? ({ ...(s.data() as object), id: s.id } as Tenant) : null));
  },
  update(tenantId: string, patch: Partial<Tenant>) {
    return updateDoc(doc(db, "tenants", tenantId), patch as DocumentData);
  },
};
