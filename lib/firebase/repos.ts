// Camada de repositório escopada por tenant. Cada coleção vive em
// tenants/{tenantId}/<colecao>. As funções `subscribe*` abrem listeners em tempo
// real (onSnapshot) e devolvem o unsubscribe; as escritas vão direto pro
// Firestore (sem dispatch otimista — o snapshot reflete de volta).

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
  FormaPagamento,
  Plano,
  PlanoTier,
  Servico,
  Tenant,
  Transacao,
  WaProposta,
  WhatsAppIntegration,
} from "@/lib/types";

// ---- helpers ----
// Firestore limita um writeBatch a 500 operações; fatiamos em commits sequenciais.
const BATCH_LIMIT = 500;
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
  /**
   * Importação em massa: grava N clientes em lotes de até 500 (teto do writeBatch),
   * commitando sequencialmente. `onProgress` é chamado após cada lote (clientes
   * já gravados / total). Mesmo padrão de `transacoes.gerarMensalidades`.
   */
  async addMany(tenantId: string, lista: Cliente[], onProgress?: (feitos: number, total: number) => void) {
    const total = lista.length;
    for (let i = 0; i < total; i += BATCH_LIMIT) {
      const fatia = lista.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const c of fatia) {
        batch.set(doc(col(tenantId, "clientes")), { ...semId(c), createdAt: serverTimestamp() });
      }
      await batch.commit();
      onProgress?.(Math.min(i + BATCH_LIMIT, total), total);
    }
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

// ---- Transações / Cobranças ----
export const transacoes = {
  // Limite pragmático: não carrega o histórico completo de todos os tempos. As
  // mais recentes (e portanto pendentes/atrasadas correntes) cabem nesse teto.
  subscribe(tenantId: string, cb: (rows: Transacao[]) => void) {
    return onSnapshot(
      query(col(tenantId, "transacoes"), orderBy("createdAt", "desc"), limit(300)),
      (s) => cb(rows<Transacao>(s)),
    );
  },
  add(tenantId: string, t: Transacao) {
    return addDoc(col(tenantId, "transacoes"), { ...semId(t), createdAt: serverTimestamp() });
  },
  /**
   * Confirma o pagamento de uma cobrança (manual, pela dona/admin). Auditável via
   * `confirmedBy` + `confirmedAt` (timestamp do servidor). Se `clienteId` for
   * informado, incrementa `totalGasto` do cliente no MESMO batch — mantendo a
   * ficha do cliente em sincronia com o que foi recebido (avulso pago aqui).
   */
  registrarPagamento(
    tenantId: string,
    id: string,
    patch: { paidAt: string; forma: FormaPagamento; amountReceived: number; confirmedBy?: string; clienteId?: string },
  ) {
    const { clienteId, ...campos } = patch;
    const batch = writeBatch(db);
    batch.update(sub(tenantId, "transacoes/" + id), {
      status: "pago",
      source: "manual",
      confirmedAt: serverTimestamp(),
      ...campos,
    });
    if (clienteId) {
      batch.update(sub(tenantId, "clientes/" + clienteId), { totalGasto: increment(campos.amountReceived) });
    }
    return batch.commit();
  },
  /** Cria N cobranças pendentes de uma vez (a deduplicação por ciclo é feita na UI). */
  gerarMensalidades(tenantId: string, novas: Transacao[]) {
    const batch = writeBatch(db);
    for (const t of novas) {
      batch.set(doc(col(tenantId, "transacoes")), { ...semId(t), createdAt: serverTimestamp() });
    }
    return batch.commit();
  },
};

// ---- Agendamentos ----
export const agendamentos = {
  // Escopo por data: só assina agendamentos com date >= cutoffISO (ex.: últimos
  // ~6 meses + futuro), em vez de toda a coleção de todos os tempos. `date` é
  // string "YYYY-MM-DD" — comparação lexicográfica = cronológica. Índice de
  // campo único em `date` é criado automaticamente pelo Firestore.
  subscribe(tenantId: string, cutoffISO: string, cb: (rows: Agendamento[]) => void) {
    return onSnapshot(query(col(tenantId, "agendamentos"), where("date", ">=", cutoffISO)), (s) => cb(rows<Agendamento>(s)));
  },
  add(tenantId: string, a: Agendamento) {
    return addDoc(col(tenantId, "agendamentos"), { ...semId(a), createdAt: serverTimestamp() });
  },
  /** Cria N agendamentos de uma vez (agendamento recorrente). Fatiado em commits de 500. */
  async addMany(tenantId: string, lista: Agendamento[]) {
    for (let i = 0; i < lista.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const a of lista.slice(i, i + BATCH_LIMIT)) {
        batch.set(doc(col(tenantId, "agendamentos")), { ...semId(a), createdAt: serverTimestamp() });
      }
      await batch.commit();
    }
  },
  /**
   * Exclui a série inteira (consulta o Firestore por `recorrenciaId` — pega
   * ocorrências futuras fora da janela de ~180d carregada no cliente). PRESERVA
   * os já concluídos (eles geraram transação/agregados do cliente). Fatiado em 500.
   */
  async removeSerie(tenantId: string, recorrenciaId: string) {
    const snap = await getDocs(query(col(tenantId, "agendamentos"), where("recorrenciaId", "==", recorrenciaId)));
    const alvo = snap.docs.filter((d) => (d.data() as Agendamento).status !== "concluido");
    for (let i = 0; i < alvo.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const d of alvo.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
      await batch.commit();
    }
    return { excluidos: alvo.length, mantidos: snap.size - alvo.length };
  },
  setStatus(tenantId: string, id: string, status: AgendamentoStatus) {
    return updateDoc(sub(tenantId, "agendamentos/" + id), { status });
  },
  /** Atualização parcial (ex.: drag-and-drop e resize mudam `inicio`/`duracaoMin`). */
  update(tenantId: string, id: string, patch: Partial<Agendamento>) {
    return updateDoc(sub(tenantId, "agendamentos/" + id), patch as DocumentData);
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "agendamentos/" + id));
  },
  /**
   * Conclui o atendimento, gera a transação e incrementa os agregados do cliente
   * — tudo atomicamente, num único ponto. Este é o ÚNICO lugar que escreve os
   * contadores `totalGasto`/`atendimentos`; nunca duplicar em componentes de UI.
   */
  concluir(
    tenantId: string,
    id: string,
    transacao: Transacao,
    cliente?: { id: string; valor: number; dataISO: string },
  ) {
    const batch = writeBatch(db);
    batch.update(sub(tenantId, "agendamentos/" + id), {
      status: "concluido",
      // Marca o atendimento como coberto p/ o histórico do cliente exibir R$ 0.
      ...(transacao.cobertoPorPlano ? { cobertoPorPlano: true } : {}),
    });
    batch.set(doc(col(tenantId, "transacoes")), { ...semId(transacao), createdAt: serverTimestamp() });
    if (cliente?.id) {
      batch.update(sub(tenantId, "clientes/" + cliente.id), {
        atendimentos: increment(1),
        totalGasto: increment(cliente.valor),
        ultimoAtendimentoISO: cliente.dataISO,
      });
    }
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

// ---- Planos de assinatura (tiers SaaS da própria barbearia) ----
export const planosTiers = {
  subscribe(tenantId: string, cb: (rows: PlanoTier[]) => void) {
    return onSnapshot(col(tenantId, "planosTiers"), (s) => cb(rows<PlanoTier>(s)));
  },
  update(tenantId: string, tier: PlanoTier) {
    return setDoc(sub(tenantId, "planosTiers/" + tier.id), tier, { merge: true });
  },
};

// ---- Planos de assinatura do CLIENTE (mensalidade: valor/diaVencimento) ----
export const planos = {
  subscribe(tenantId: string, cb: (rows: Plano[]) => void) {
    return onSnapshot(col(tenantId, "planos"), (s) => cb(rows<Plano>(s)));
  },
  add(tenantId: string, p: Plano) {
    return addDoc(col(tenantId, "planos"), { ...semId(p), createdAt: serverTimestamp() });
  },
  update(tenantId: string, p: Plano) {
    return updateDoc(sub(tenantId, "planos/" + p.id), semId(p) as DocumentData);
  },
  remove(tenantId: string, id: string) {
    return deleteDoc(sub(tenantId, "planos/" + id));
  },
};

// ---- Integração WhatsApp (status/QR + comando connect/disconnect) ----
// A ponte com o worker Baileys é o doc `integrations/whatsapp`: o worker escreve
// status/QR; a UI escreve `command` (consumido pelo worker) e `desiredState`.
export const whatsapp = {
  subscribeStatus(tenantId: string, cb: (wa: WhatsAppIntegration | null) => void) {
    return onSnapshot(sub(tenantId, "integrations/whatsapp"), (s) =>
      cb(s.exists() ? (s.data() as WhatsAppIntegration) : null),
    );
  },
  enviarComando(tenantId: string, action: "connect" | "disconnect") {
    return setDoc(
      sub(tenantId, "integrations/whatsapp"),
      {
        command: { action, ts: Date.now() },
        desiredState: action === "connect" ? "connected" : "disconnected",
      },
      { merge: true },
    );
  },
};

// ---- Propostas de agendamento da IA (fila de aprovação) ----
export const propostas = {
  /** Só as pendentes (a aprovação/recusa muda o status e some da lista). */
  subscribe(tenantId: string, cb: (rows: WaProposta[]) => void) {
    return onSnapshot(query(col(tenantId, "waPropostas"), where("status", "==", "pendente")), (s) =>
      cb(rows<WaProposta>(s)),
    );
  },
  recusar(tenantId: string, id: string) {
    return updateDoc(sub(tenantId, "waPropostas/" + id), { status: "recusada" });
  },
  /**
   * Marca a proposta como aprovada e liga ao agendamento gerado. `confirmacaoPendente`
   * sinaliza o worker para enviar a confirmação ao cliente no WhatsApp.
   */
  aprovar(tenantId: string, id: string, agendamentoId: string) {
    return updateDoc(sub(tenantId, "waPropostas/" + id), {
      status: "aprovada",
      agendamentoId,
      confirmacaoPendente: true,
    });
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
