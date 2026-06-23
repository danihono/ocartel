"use client";

// Store central no cliente (Context + reducer), alimentado pelos mocks e
// persistido em localStorage. Desenhado para ser trocado por um banco depois:
// cada ação equivale a um endpoint e HYDRATE vira o fetch inicial.

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
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
import type {
  Agendamento,
  AgendamentoStatus,
  Barbeiro,
  Cliente,
  ConfigBarbearia,
  FormaPagamento,
  PlanoTier,
  Servico,
  Tenant,
  Transacao,
} from "./types";

const STORAGE_KEY = "ocartel:v1";

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
  ui: { hidratado: boolean };
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
    // Histórico pago (atribuído ao cliente padrão João Pedro Almeida)
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
    // Pendentes derivados dos confirmados de hoje
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
    // Um atrasado (inadimplente)
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
    auth: { logado: false, nome: "Marina Rocha", barbeariaNome: BARBEARIA.nome },
    barbeiros,
    servicos: seedServicos.map((s) => ({ ...s })),
    clientes: seedClientes.map((c) => ({ ...c })),
    agendamentos,
    transacoes,
    config,
    tenants: seedTenants.map((t) => ({ ...t })),
    planosTiers,
    ui: { hidratado: false },
  };
}

// ---- Ações ----
export type Action =
  | { type: "LOGIN"; nome?: string }
  | { type: "LOGOUT" }
  | { type: "ADD_CLIENTE"; cliente: Cliente }
  | { type: "UPDATE_CLIENTE"; cliente: Cliente }
  | { type: "ADD_AGENDAMENTO"; agendamento: Agendamento }
  | { type: "REMOVE_AGENDAMENTO"; id: string }
  | { type: "SET_AGENDAMENTO_STATUS"; id: string; status: AgendamentoStatus }
  | { type: "ADD_BARBEIRO"; barbeiro: Barbeiro }
  | { type: "UPDATE_BARBEIRO"; barbeiro: Barbeiro }
  | { type: "REMOVE_BARBEIRO"; id: string }
  | { type: "ADD_SERVICO"; servico: Servico }
  | { type: "UPDATE_SERVICO"; servico: Servico }
  | { type: "REMOVE_SERVICO"; id: string }
  | { type: "UPDATE_PLANO_TIER"; tier: PlanoTier }
  | { type: "ADD_TRANSACAO"; transacao: Transacao }
  | { type: "MARK_TRANSACAO_PAGA"; id: string }
  | { type: "UPDATE_CONFIG"; patch: Partial<ConfigBarbearia> }
  | { type: "UPDATE_TENANT"; nome: string; patch: Partial<Tenant> }
  | { type: "HYDRATE"; state: AppState | null }
  | { type: "RESET" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN":
      return { ...state, auth: { ...state.auth, logado: true, nome: action.nome || state.auth.nome } };
    case "LOGOUT":
      return { ...state, auth: { ...state.auth, logado: false } };

    case "ADD_CLIENTE":
      return { ...state, clientes: [action.cliente, ...state.clientes] };
    case "UPDATE_CLIENTE":
      return { ...state, clientes: state.clientes.map((c) => (c.id === action.cliente.id ? action.cliente : c)) };

    case "ADD_AGENDAMENTO":
      return { ...state, agendamentos: [...state.agendamentos, action.agendamento] };
    case "REMOVE_AGENDAMENTO":
      return { ...state, agendamentos: state.agendamentos.filter((a) => a.id !== action.id) };
    case "SET_AGENDAMENTO_STATUS":
      return {
        ...state,
        agendamentos: state.agendamentos.map((a) => (a.id === action.id ? { ...a, status: action.status } : a)),
      };

    case "ADD_BARBEIRO":
      return { ...state, barbeiros: [...state.barbeiros, action.barbeiro] };
    case "UPDATE_BARBEIRO":
      return { ...state, barbeiros: state.barbeiros.map((b) => (b.id === action.barbeiro.id ? action.barbeiro : b)) };
    case "REMOVE_BARBEIRO":
      return { ...state, barbeiros: state.barbeiros.filter((b) => b.id !== action.id) };

    case "ADD_SERVICO":
      return { ...state, servicos: [...state.servicos, action.servico] };
    case "UPDATE_SERVICO":
      return { ...state, servicos: state.servicos.map((s) => (s.id === action.servico.id ? action.servico : s)) };
    case "REMOVE_SERVICO":
      return { ...state, servicos: state.servicos.filter((s) => s.id !== action.id) };

    case "UPDATE_PLANO_TIER":
      return { ...state, planosTiers: state.planosTiers.map((t) => (t.id === action.tier.id ? action.tier : t)) };

    case "ADD_TRANSACAO":
      return { ...state, transacoes: [action.transacao, ...state.transacoes] };
    case "MARK_TRANSACAO_PAGA":
      return { ...state, transacoes: state.transacoes.map((t) => (t.id === action.id ? { ...t, status: "pago" } : t)) };

    case "UPDATE_CONFIG":
      return { ...state, config: { ...state.config, ...action.patch }, auth: { ...state.auth, barbeariaNome: action.patch.nome ?? state.auth.barbeariaNome } };

    case "UPDATE_TENANT":
      return { ...state, tenants: state.tenants.map((t) => (t.nome === action.nome ? { ...t, ...action.patch } : t)) };

    case "HYDRATE":
      return { ...state, ...(action.state ?? {}), ui: { hidratado: true } };
    case "RESET":
      return { ...buildSeedState(), ui: { hidratado: true } };

    default:
      return state;
  }
}

// ---- Context / Provider / Hook ----
const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildSeedState);

  // Carrega o localStorage só no cliente (evita mismatch de hidratação).
  useEffect(() => {
    let carregado: AppState | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) carregado = JSON.parse(raw) as AppState;
    } catch {
      carregado = null;
    }
    dispatch({ type: "HYDRATE", state: carregado });
  }, []);

  // Write-through após hidratar.
  useEffect(() => {
    if (!state.ui.hidratado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* localStorage indisponível (modo privado/quota) — segue em memória */
    }
  }, [state]);

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de <StoreProvider>");
  return ctx;
}

// ---- Utilitário de id (só chamar em handlers, nunca no render/semente) ----
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
