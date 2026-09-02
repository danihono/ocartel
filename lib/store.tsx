"use client";

// Store central no cliente (Context + reducer). Alimentado pelo Firestore: os
// dados chegam por listeners em tempo real (onSnapshot) e são despachados via
// SET_DATA; as escritas vão direto pros repositórios (lib/firebase/repos.ts) e o
// snapshot reflete de volta. O reducer virou um cache de leitura.
//
// `buildSeedState()` é o estado inicial determinístico (idêntico no servidor e no
// 1º render do cliente) e vem VAZIO de propósito: o <AuthGuard> renderiza o
// conteúdo de forma otimista (latch de sessão), então qualquer dado de exemplo
// aqui apareceria de verdade na tela antes dos dados reais. Os mocks de
// `lib/mock-data.ts` seguem servindo ao `seedDemoTenant` (lib/firebase/bootstrap.ts),
// que é onde eles fazem sentido.

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from "react";
import { addDias, hojeLocalISO } from "./date";
import { ORDEM_CLIENTE_PADRAO, type FiltroCliente, type FiltroTipoCobranca, type FiltroTransacao, type OrdemCliente } from "./selectors";
import type { NovaMensalidade } from "./cobranca-ciclo";
import { useAuth } from "./firebase/auth";
import * as repo from "./firebase/repos";
import type {
  Agendamento,
  AgendamentoStatus,
  Barbeiro,
  Cliente,
  ConfigBarbearia,
  FormaPagamento,
  Plano,
  PlanoTier,
  Role,
  Servico,
  Tenant,
  Transacao,
} from "./types";

// Estado de UI de cada tela. Vive no store (que fica na raiz e sobrevive às
// rotas) para que trocar de aba no menu não perca contexto nem remonte a tela
// do zero — é o que fazia a navegação parecer um reload.
export interface TelasUi {
  /** `dateISO: null` = hoje, resolvido no render pelo relógio (nunca envelhece). */
  agenda: { dateISO: string | null; view: "dia" | "semana" | "mes"; busca: string };
  clientes: { busca: string; filtro: FiltroCliente; selId: string | null; ordem: OrdemCliente };
  /** `conversaId` é o id do contato no espelho (`wa_<55…>`), não o id do cliente. */
  whatsapp: { busca: string; conversaId: string | null };
  pagamentos: { busca: string; filtro: FiltroTransacao; tipo: FiltroTipoCobranca };
  planos: { aba: "servicos" | "planos" };
}

export const telasIniciais: TelasUi = {
  agenda: { dateISO: null, view: "dia", busca: "" },
  clientes: { busca: "", filtro: "Todos", selId: null, ordem: ORDEM_CLIENTE_PADRAO },
  whatsapp: { busca: "", conversaId: null },
  pagamentos: { busca: "", filtro: "Todas", tipo: "todos" },
  planos: { aba: "servicos" },
};

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
  planos: Plano[];
  ui: { hidratado: boolean; visao: Role; barbeiroVisaoId: string | null; telas: TelasUi };
}

// ---- Semente determinística (idêntica no servidor e no 1º render do cliente) ----
// Vazia de propósito — ver o comentário no topo do arquivo.
export function buildSeedState(): AppState {
  const config: ConfigBarbearia = {
    nome: "",
    endereco: "",
    telefone: "",
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  };

  return {
    auth: { logado: false, nome: "", barbeariaNome: "" },
    barbeiros: [],
    servicos: [],
    clientes: [],
    agendamentos: [],
    transacoes: [],
    config,
    tenants: [],
    planosTiers: [],
    planos: [],
    ui: { hidratado: false, visao: "admin", barbeiroVisaoId: null, telas: telasIniciais },
  };
}

// ---- Ações (apenas estado de UI + injeção de dados pelos listeners) ----
type StatePatch = Partial<Omit<AppState, "ui">> & { ui?: Partial<Omit<AppState["ui"], "telas">> };
export type Action =
  | { type: "SET_DATA"; patch: StatePatch }
  | { type: "SET_VISAO"; visao: Role }
  | { type: "SET_BARBEIRO_VISAO"; id: string }
  | { type: "SET_AUTH"; patch: Partial<AppState["auth"]> }
  | { [K in keyof TelasUi]: { type: "SET_TELA"; tela: K; patch: Partial<TelasUi[K]> } }[keyof TelasUi];

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DATA":
      return { ...state, ...action.patch, ui: { ...state.ui, ...(action.patch.ui ?? {}) } };
    case "SET_AUTH":
      return { ...state, auth: { ...state.auth, ...action.patch } };
    case "SET_TELA":
      return {
        ...state,
        ui: { ...state.ui, telas: { ...state.ui.telas, [action.tela]: { ...state.ui.telas[action.tela], ...action.patch } } },
      };
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
  clientes: {
    add: (c: Cliente) => Promise<Ref>;
    addMany: (lista: Cliente[], onProgress?: (feitos: number, total: number) => void) => Promise<void>;
    update: (c: Cliente) => Promise<void>;
    remove: (id: string) => Promise<void>;
  };
  barbeiros: { add: (b: Barbeiro) => Promise<Ref>; update: (b: Barbeiro) => Promise<void>; remove: (id: string) => Promise<void> };
  servicos: { add: (s: Servico) => Promise<Ref>; update: (s: Servico) => Promise<void>; remove: (id: string) => Promise<void> };
  agendamentos: {
    add: (a: Agendamento) => Promise<Ref>;
    addMany: (lista: Agendamento[]) => Promise<void>;
    update: (id: string, patch: Partial<Agendamento>) => Promise<void>;
    setStatus: (id: string, status: AgendamentoStatus) => Promise<void>;
    remove: (id: string) => Promise<void>;
    removeSerie: (recorrenciaId: string) => Promise<{ excluidos: number; mantidos: number }>;
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
      patch: { paidAt: string; forma: FormaPagamento; amountReceived: number; confirmedBy?: string; clienteId?: string },
    ) => Promise<void>;
    gerarMensalidades: (novas: NovaMensalidade[]) => Promise<void>;
  };
  config: { update: (patch: Partial<ConfigBarbearia>) => Promise<void> };
  cobrador: {
    salvar: (cred: { apiKey: string; ambiente: "sandbox" | "producao"; webhookToken: string }) => Promise<void>;
    remover: () => Promise<void>;
  };
  planosTiers: { update: (tier: PlanoTier) => Promise<void> };
  planos: { add: (p: Plano) => Promise<Ref>; update: (p: Plano) => Promise<void>; remove: (id: string) => Promise<void> };
  tenants: { update: (tenantId: string, patch: Partial<Tenant>) => Promise<void> };
}

function buildActions(tenantId: string): StoreActions {
  return {
    clientes: {
      add: (c) => repo.clientes.add(tenantId, c),
      addMany: (lista, onProgress) => repo.clientes.addMany(tenantId, lista, onProgress),
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
      addMany: (lista) => repo.agendamentos.addMany(tenantId, lista),
      update: (id, patch) => repo.agendamentos.update(tenantId, id, patch),
      setStatus: (id, status) => repo.agendamentos.setStatus(tenantId, id, status),
      remove: (id) => repo.agendamentos.remove(tenantId, id),
      removeSerie: (recorrenciaId) => repo.agendamentos.removeSerie(tenantId, recorrenciaId),
      concluir: (id, transacao, cliente) => repo.agendamentos.concluir(tenantId, id, transacao, cliente),
    },
    transacoes: {
      add: (t) => repo.transacoes.add(tenantId, t),
      registrarPagamento: (id, patch) => repo.transacoes.registrarPagamento(tenantId, id, patch),
      gerarMensalidades: (novas) => repo.transacoes.gerarMensalidades(tenantId, novas),
    },
    config: { update: (patch) => repo.config.update(tenantId, patch) },
    cobrador: {
      salvar: (cred) => repo.cobrador.salvar(tenantId, cred),
      remover: () => repo.cobrador.remover(tenantId),
    },
    planosTiers: { update: (tier) => repo.planosTiers.update(tenantId, tier) },
    planos: {
      add: (p) => repo.planos.add(tenantId, p),
      update: (p) => repo.planos.update(tenantId, p),
      remove: (id) => repo.planos.remove(tenantId, id),
    },
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
  // Último tenant já carregado. O efeito abaixo também re-roda quando só o
  // `nome` do perfil chega — nesse caso NÃO podemos zerar o cache nem o
  // `hidratado`, senão as telas piscam "Carregando…" sem motivo.
  const tenantCarregado = useRef<string | null>(null);

  // Assina os listeners do tenant. Limpa a semente ao entrar e refaz ao trocar
  // de tenant / deslogar.
  useEffect(() => {
    const isSuper = role === "superAdmin";
    if (!tenantId && !isSuper) {
      tenantCarregado.current = null; // logout: o próximo login recarrega do zero
      return;
    }

    const chave = tenantId ?? "__super__";
    // Só zera quando SAI de um tenant já carregado para outro. Na 1ª montagem
    // `tenantCarregado.current` é null e a semente já está vazia — zerar de novo
    // ali só apagaria o que o cache local do Firestore acabou de entregar.
    const trocouDeTenant = tenantCarregado.current !== null && tenantCarregado.current !== chave;
    tenantCarregado.current = chave;

    dispatch({ type: "SET_AUTH", patch: { logado: true, nome } });
    if (trocouDeTenant) {
      dispatch({
        type: "SET_DATA",
        patch: {
          clientes: [],
          agendamentos: [],
          servicos: [],
          barbeiros: [],
          transacoes: [],
          tenants: [],
          planos: [],
          ui: { hidratado: false },
        },
      });
    }

    const unsubs: Array<() => void> = [];

    // Janela de agendamentos: ~6 meses atrás + tudo no futuro (não puxa todo o
    // histórico de todos os tempos). `date` é "YYYY-MM-DD" (compara lexicograficamente).
    const cutoffAgendamentos = addDias(hojeLocalISO(), -180);

    if (tenantId) {
      // `hidratado` = todos os listeners essenciais já entregaram o 1º snapshot.
      // Antes disso, dependia só da config — e um tenant sem `config/main` (o
      // `if (!cfg) return` de outrora) travava /planos e /barbeiro em
      // "Carregando…" para sempre.
      const ESSENCIAIS = ["clientes", "barbeiros", "servicos", "transacoes", "agendamentos", "planos", "config"] as const;
      const chegaram = new Set<string>();
      const marcarChegada = (quem: (typeof ESSENCIAIS)[number]) => {
        if (chegaram.has(quem)) return;
        chegaram.add(quem);
        if (chegaram.size === ESSENCIAIS.length) dispatch({ type: "SET_DATA", patch: { ui: { hidratado: true } } });
      };

      unsubs.push(
        repo.clientes.subscribe(tenantId, (rows) => {
          dispatch({ type: "SET_DATA", patch: { clientes: rows } });
          marcarChegada("clientes");
        }),
        repo.barbeiros.subscribe(tenantId, (rows) => {
          dispatch({ type: "SET_DATA", patch: { barbeiros: rows } });
          marcarChegada("barbeiros");
        }),
        repo.servicos.subscribe(tenantId, (rows) => {
          dispatch({ type: "SET_DATA", patch: { servicos: rows } });
          marcarChegada("servicos");
        }),
        repo.transacoes.subscribe(tenantId, (rows) => {
          dispatch({ type: "SET_DATA", patch: { transacoes: rows } });
          marcarChegada("transacoes");
        }),
        repo.agendamentos.subscribe(tenantId, cutoffAgendamentos, (rows) => {
          dispatch({ type: "SET_DATA", patch: { agendamentos: rows } });
          marcarChegada("agendamentos");
        }),
        repo.planosTiers.subscribe(tenantId, (rows) => dispatch({ type: "SET_DATA", patch: { planosTiers: rows } })),
        repo.planos.subscribe(tenantId, (rows) => {
          dispatch({ type: "SET_DATA", patch: { planos: rows } });
          marcarChegada("planos");
        }),
        // `cfg` nulo = a barbearia ainda não tem doc de config; é uma resposta
        // válida, não "carregando". Mantém a config atual e segue.
        repo.config.subscribe(tenantId, (cfg) => {
          if (cfg) {
            dispatch({ type: "SET_AUTH", patch: { barbeariaNome: cfg.nome } });
            dispatch({ type: "SET_DATA", patch: { config: cfg } });
          }
          marcarChegada("config");
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

  // Sem o useMemo, o objeto do value é novo a cada render do provider e TODO
  // consumidor re-renderiza junto, mesmo quando nada que ele lê mudou.
  const value = useMemo<StoreValue>(() => ({ state, dispatch, actions }), [state, actions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
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
