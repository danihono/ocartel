"use client";

// Store central no cliente (Context + reducer). Agora alimentado pelo Firestore:
// os dados chegam por listeners em tempo real (onSnapshot) e são despachados via
// SET_DATA; as escritas vão direto pros repositórios (lib/firebase/repos.ts) e o
// snapshot reflete de volta. O reducer virou um cache de leitura.
//
// `buildSeedState()` continua sendo o estado inicial determinístico (idêntico no
// servidor e no 1º render do cliente) — as telas com dados ficam atrás do
// <AuthGuard>, então a semente nunca aparece para o usuário.

import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import {
  BARBEARIA,
  agendaBarbeiros,
  agendaBlocos,
  bookingBarbeiros,
  clientes as seedClientes,
  historicoCliente,
  servicos as seedServicos,
  tenants as seedTenants,
} from "./mock-data";
import { HOJE_ISO, isoParaDiaMes } from "./date";
import { slug } from "./selectors";
import { useAuth } from "./firebase/auth";
import * as repo from "./firebase/repos";
import type {
  Agendamento,
  AgendamentoStatus,
  Barbeiro,
  Cliente,
  ConfigBarbearia,
  FormaPagamento,
  PlanoTier,
  Role,
  Servico,
  Tenant,
  Transacao,
} from "./types";

export interface AppState {
  auth: { logado: boolean; nome: string; barbeariaNome: string };
  barbeiros: Barbeiro[];
  servicos: Servico[];
  clientes: Cliente[];
  agendamentos: Agendamento[];
  transacoes: Transacao[];
  config: ConfigBarbearia;
  tenants: Tenant[];
  planosTiers: PlanoTier[];
  ui: { hidratado: boolean; visao: Role; barbeiroVisaoId: string | null };
}

// ---- Semente determinística (idêntica no servidor e no 1º render do cliente) ----
export function buildSeedState(): AppState {
  const barbeiros: Barbeiro[] = agendaBarbeiros.map((b) => {
    const bk = bookingBarbeiros.find((x) => x.nome === b.nome);
    return { id: slug(b.nome), nome: b.nome, iniciais: b.iniciais, cor: b.cor, rating: bk?.rating, especialidade: bk?.especialidade };
  });
  const nomePorId = (id: string) => barbeiros.find((b) => b.id === id)?.nome ?? id;
  const precoDe = (nome: string) => seedServicos.find((s) => s.nome === nome)?.preco ?? 0;

  const agendamentos: Agendamento[] = [];
  agendaBlocos.forEach((blocos, idx) => {
    const barbeiro = barbeiros[idx];
    blocos.forEach((bl) => {
      const nomeServico = bl.servico.split(" · ")[0].trim();
      agendamentos.push({
        id: `ag-${barbeiro.id}-${bl.inicio.replace(":", "")}`,
        date: HOJE_ISO,
        barbeiroId: barbeiro.id,
        clienteNome: bl.cliente,
        servico: nomeServico,
        servicoId: seedServicos.find((s) => s.nome === nomeServico)?.id,
        inicio: bl.inicio,
        duracaoMin: bl.duracaoMin,
        status: bl.status,
        origem: "admin",
      });
    });
  });

  const hojeLabel = isoParaDiaMes(HOJE_ISO);
  const transacoes: Transacao[] = [
    ...historicoCliente.map((h, i) => ({
      id: `tx-hist-${i}`,
      data: h.data,
      clienteNome: "João Pedro Almeida",
      servico: h.servico,
      barbeiroNome: h.barbeiro,
      valor: Number(h.valor.replace(/[^\d]/g, "")),
      status: "pago" as const,
      forma: (i % 2 === 0 ? "pix" : "cartao") as FormaPagamento,
    })),
    ...agendamentos
      .filter((a) => a.status === "confirmado")
      .map((a, i) => ({
        id: `tx-pend-${i}`,
        data: hojeLabel,
        clienteNome: a.clienteNome,
        servico: a.servico,
        barbeiroNome: nomePorId(a.barbeiroId),
        valor: precoDe(a.servico),
        status: "pendente" as const,
        forma: (["pix", "cartao", "dinheiro"][i % 3]) as FormaPagamento,
      })),
    { id: "tx-atr-0", data: "12 abr", clienteNome: "Rafael Lima", servico: "Luzes", barbeiroNome: "Everton", valor: 120, status: "atrasado", forma: "pix" },
  ];

  const config: ConfigBarbearia = {
    nome: BARBEARIA.nome,
    endereco: BARBEARIA.endereco,
    telefone: "(11) 3060-1200",
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  };

  const planosTiers: PlanoTier[] = [
    { id: "basico", nome: "Básico", preco: 129, descricao: "1 unidade · até 3 barbeiros" },
    { id: "pro", nome: "Pro", preco: 249, descricao: "Multi-unidade · ilimitado" },
  ];

  return {
    auth: { logado: false, nome: "", barbeariaNome: BARBEARIA.nome },
    barbeiros,
    servicos: seedServicos.map((s) => ({ ...s })),
    clientes: seedClientes.map((c) => ({ ...c })),
    agendamentos,
    transacoes,
    config,
    tenants: seedTenants.map((t) => ({ ...t })),
    planosTiers,
    ui: { hidratado: false, visao: "admin", barbeiroVisaoId: barbeiros[0]?.id ?? null },
  };
}

// ---- Ações (apenas estado de UI + injeção de dados pelos listeners) ----
type StatePatch = Partial<Omit<AppState, "ui">> & { ui?: Partial<AppState["ui"]> };
export type Action =
  | { type: "SET_DATA"; patch: StatePatch }
  | { type: "SET_VISAO"; visao: Role }
  | { type: "SET_BARBEIRO_VISAO"; id: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DATA":
      return { ...state, ...action.patch, ui: { ...state.ui, ...(action.patch.ui ?? {}) } };
    case "SET_VISAO":
      return { ...state, ui: { ...state.ui, visao: action.visao } };
    case "SET_BARBEIRO_VISAO":
      return { ...state, ui: { ...state.ui, barbeiroVisaoId: action.id } };
    default:
      return state;
  }
}

// ---- Ações de escrita (assíncronas, escopadas no tenant atual) ----
type Ref = { id: string };
export interface StoreActions {
  clientes: { add: (c: Cliente) => Promise<Ref>; update: (c: Cliente) => Promise<void>; remove: (id: string) => Promise<void> };
  barbeiros: { add: (b: Barbeiro) => Promise<Ref>; update: (b: Barbeiro) => Promise<void>; remove: (id: string) => Promise<void> };
  servicos: { add: (s: Servico) => Promise<Ref>; update: (s: Servico) => Promise<void>; remove: (id: string) => Promise<void> };
  agendamentos: {
    add: (a: Agendamento) => Promise<Ref>;
    update: (id: string, patch: Partial<Agendamento>) => Promise<void>;
    setStatus: (id: string, status: AgendamentoStatus) => Promise<void>;
    remove: (id: string) => Promise<void>;
    concluir: (
      id: string,
      transacao: Transacao,
      cliente?: { id: string; valor: number; dataISO: string },
    ) => Promise<void>;
  };
  transacoes: {
    add: (t: Transacao) => Promise<Ref>;
    registrarPagamento: (
      id: string,
      patch: { paidAt: string; forma: FormaPagamento; amountReceived: number; confirmedBy?: string },
    ) => Promise<void>;
    gerarMensalidades: (novas: Transacao[]) => Promise<void>;
  };
  config: { update: (patch: Partial<ConfigBarbearia>) => Promise<void> };
  planosTiers: { update: (tier: PlanoTier) => Promise<void> };
  tenants: { update: (tenantId: string, patch: Partial<Tenant>) => Promise<void> };
}

function buildActions(tenantId: string): StoreActions {
  return {
    clientes: {
      add: (c) => repo.clientes.add(tenantId, c),
      update: (c) => repo.clientes.update(tenantId, c),
      remove: (id) => repo.clientes.remove(tenantId, id),
    },
    barbeiros: {
      add: (b) => repo.barbeiros.add(tenantId, b),
      update: (b) => repo.barbeiros.update(tenantId, b),
      remove: (id) => repo.barbeiros.remove(tenantId, id),
    },
    servicos: {
      add: (s) => repo.servicos.add(tenantId, s),
      update: (s) => repo.servicos.update(tenantId, s),
      remove: (id) => repo.servicos.remove(tenantId, id),
    },
    agendamentos: {
      add: (a) => repo.agendamentos.add(tenantId, a),
      update: (id, patch) => repo.agendamentos.update(tenantId, id, patch),
      setStatus: (id, status) => repo.agendamentos.setStatus(tenantId, id, status),
      remove: (id) => repo.agendamentos.remove(tenantId, id),
      concluir: (id, transacao, cliente) => repo.agendamentos.concluir(tenantId, id, transacao, cliente),
    },
    transacoes: {
      add: (t) => repo.transacoes.add(tenantId, t),
      registrarPagamento: (id, patch) => repo.transacoes.registrarPagamento(tenantId, id, patch),
      gerarMensalidades: (novas) => repo.transacoes.gerarMensalidades(tenantId, novas),
    },
    config: { update: (patch) => repo.config.update(tenantId, patch) },
    planosTiers: { update: (tier) => repo.planosTiers.update(tenantId, tier) },
    tenants: { update: (tid, patch) => repo.tenants.update(tid, patch) },
  };
}

// ---- Context / Provider / Hook ----
interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  actions: StoreActions;
}
const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildSeedState);
  const { profile, role, tenantId } = useAuth();
  const nome = profile?.nome ?? "";

  // Assina os listeners do tenant. Limpa a semente ao entrar e refaz ao trocar
  // de tenant / deslogar.
  useEffect(() => {
    const isSuper = role === "superAdmin";
    if (!tenantId && !isSuper) return;

    dispatch({
      type: "SET_DATA",
      patch: {
        auth: { logado: true, nome, barbeariaNome: "" },
        clientes: [],
        agendamentos: [],
        servicos: [],
        barbeiros: [],
        transacoes: [],
        tenants: [],
        ui: { hidratado: false },
      },
    });

    const unsubs: Array<() => void> = [];

    if (tenantId) {
      unsubs.push(
        repo.clientes.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { clientes: rows } })),
        repo.barbeiros.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { barbeiros: rows } })),
        repo.servicos.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { servicos: rows } })),
        repo.transacoes.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { transacoes: rows } })),
        repo.agendamentos.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { agendamentos: rows } })),
        repo.planosTiers.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { planosTiers: rows } })),
        repo.config.subscribe(tenantId, (cfg) => {
          if (cfg) dispatch({ type: "SET_DATA", patch: { config: cfg, auth: { logado: true, nome, barbeariaNome: cfg.nome }, ui: { hidratado: true } } });
        }),
      );
    } else {
      // superAdmin sem tenant próprio: nada de coleções por tenant.
      dispatch({ type: "SET_DATA", patch: { ui: { hidratado: true } } });
    }

    if (isSuper) {
      unsubs.push(repo.tenants.subscribeAll((rows) => dispatch({ type: "SET_DATA", patch: { tenants: rows } })));
    } else if (tenantId) {
      unsubs.push(repo.tenants.subscribeOne(tenantId, (t) => dispatch({ type: "SET_DATA", patch: { tenants: t ? [t] : [] } })));
    }

    return () => unsubs.forEach((u) => u());
  }, [tenantId, role, nome]);

  const actions = useMemo<StoreActions>(() => buildActions(tenantId ?? ""), [tenantId]);

  return <StoreContext.Provider value={{ state, dispatch, actions }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>");
  return ctx;
}

// ---- Utilitário de id (id é ignorado na escrita — Firestore gera o seu) ----
let _contador = 0;
export function makeId(prefix = "id"): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    /* fallback abaixo */
  }
  _contador += 1;
  return `${prefix}-${Date.now()}-${_contador}`;
}
