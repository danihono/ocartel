// Seletores puros: derivam as formas que as telas já esperam a partir do
// modelo único `Agendamento`. As telas leem daqui (não importam mock-data).
import type { AppState } from "./store";
import type {
  Agendamento,
  AgendamentoStatus,
  BlocoAgenda,
  Cliente,
  ClienteTag,
  FormaPagamento,
  ProximoAgendamento,
  TipoCobranca,
  Transacao,
  TransacaoStatus,
} from "./types";
import { comparaHora, HOJE_ISO, isoParaDiaMes } from "./date";

/** Slug estável para ids (minúsculo, sem acento). */
export function slug(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 60 -> "1h", 90 -> "1h30", 40 -> "40min". */
export function fmtDur(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Reproduz o rótulo do bloco: "Corte + Barba · 1h", "Corte · em atendimento"... */
export function rotuloServico(servico: string, dur: number, status: AgendamentoStatus): string {
  if (status === "atendimento") return `${servico} · em atendimento`;
  if (status === "noshow") return `${servico} · no-show`;
  if (status === "concluido") return `${servico} · concluído`;
  if (status === "cancelado") return `${servico} · cancelado`;
  return `${servico} · ${fmtDur(dur)}`;
}

export function barbeiroNomePorId(state: AppState, id: string): string {
  return state.barbeiros.find((b) => b.id === id)?.nome ?? id;
}

export function barbeiroIdPorNome(state: AppState, nome: string): string {
  return state.barbeiros.find((b) => b.nome === nome)?.id ?? slug(nome);
}

function doDia(ags: Agendamento[], dateISO: string): Agendamento[] {
  return ags.filter((a) => a.date === dateISO);
}

export type BlocoComId = BlocoAgenda & { id: string };

/** Colunas da agenda (na ordem de state.barbeiros) para um dia. */
export function selectAgendaPorBarbeiro(
  state: AppState,
  dateISO: string,
): { barbeiro: AppState["barbeiros"][number]; blocos: BlocoComId[] }[] {
  const doDiaAgs = doDia(state.agendamentos, dateISO);
  return state.barbeiros.map((barbeiro) => {
    const blocos = doDiaAgs
      .filter((a) => a.barbeiroId === barbeiro.id)
      .sort((a, b) => comparaHora(a.inicio, b.inicio))
      .map<BlocoComId>((a) => ({
        id: a.id,
        inicio: a.inicio,
        duracaoMin: a.duracaoMin,
        cliente: a.clienteNome,
        servico: rotuloServico(a.servico, a.duracaoMin, a.status),
        status: a.status,
      }));
    return { barbeiro, blocos };
  });
}

/** Lista "Próximos na agenda" (exclui bloqueios), ordenada por hora. */
export function selectProximos(state: AppState, dateISO: string, limit = 5): (ProximoAgendamento & { id: string })[] {
  return doDia(state.agendamentos, dateISO)
    .filter((a) => a.status !== "bloqueio")
    .sort((a, b) => comparaHora(a.inicio, b.inicio))
    .slice(0, limit)
    .map((a) => ({
      id: a.id,
      hora: a.inicio,
      cliente: a.clienteNome,
      servico: a.servico,
      barbeiro: barbeiroNomePorId(state, a.barbeiroId),
      status: a.status,
    }));
}

/** Atendimentos (exclui bloqueio) de um barbeiro no dia. */
export function selectAtendimentosHoje(state: AppState, barbeiroId: string, dateISO: string): number {
  return doDia(state.agendamentos, dateISO).filter(
    (a) => a.barbeiroId === barbeiroId && a.status !== "bloqueio",
  ).length;
}

/** KPI "Agendamentos hoje": total e quantos aguardando confirmação. */
export function selectKpiAgendamentosHoje(state: AppState, dateISO: string): { total: number; aguardando: number } {
  const dia = doDia(state.agendamentos, dateISO).filter((a) => a.status !== "bloqueio");
  return { total: dia.length, aguardando: dia.filter((a) => a.status === "agendado").length };
}

function normaliza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type FiltroCliente = "Todos" | "VIP" | "Avulsos" | "Inadimplentes";

export function selectClientesFiltrados(
  state: AppState,
  filtro: FiltroCliente,
  busca: string,
  hojeISO: string = HOJE_ISO,
): Cliente[] {
  let lista = state.clientes;
  if (filtro === "VIP") lista = lista.filter((c) => c.tag === "VIP");
  // "Inadimplente" é DERIVADO das cobranças (fonte única), não do tag manual.
  else if (filtro === "Inadimplentes") lista = lista.filter((c) => clienteEstaInadimplente(state, c, hojeISO));
  else if (filtro === "Avulsos") lista = lista.filter((c) => /avulso/i.test(c.plano));
  const q = normaliza(busca.trim());
  if (q) {
    lista = lista.filter(
      (c) => normaliza(c.nome).includes(q) || normaliza(c.telefone).includes(q) || normaliza(c.email).includes(q),
    );
  }
  return lista;
}

export function selectContagensCliente(state: AppState, hojeISO: string = HOJE_ISO): Record<FiltroCliente, number> {
  return {
    Todos: state.clientes.length,
    VIP: state.clientes.filter((c) => c.tag === "VIP").length,
    Avulsos: state.clientes.filter((c) => /avulso/i.test(c.plano)).length,
    Inadimplentes: state.clientes.filter((c) => clienteEstaInadimplente(state, c, hojeISO)).length,
  };
}

// ---- Cobranças (modelo de pagamento) ----

/**
 * Status DERIVADO de uma cobrança. "atrasado" = pendente com `dueDate` vencida —
 * calculado na leitura, nunca gravado. Tolera docs legados com "atrasado" salvo.
 */
export function statusCobranca(t: Transacao, hojeISO: string = HOJE_ISO): TransacaoStatus {
  if (t.status === "pago") return "pago";
  if (t.dueDate) return t.dueDate < hojeISO ? "atrasado" : "pendente";
  return t.status === "atrasado" ? "atrasado" : "pendente"; // legado sem dueDate
}

/** Valor originalmente cobrado (cai em `valor` p/ docs legados). */
export function valorCobrado(t: Transacao): number {
  return t.amount ?? t.valor;
}

/** Valor efetivamente recebido (cai em `valor` p/ docs legados). */
export function valorRecebido(t: Transacao): number {
  return t.amountReceived ?? t.valor;
}

/** Tipo de cobrança (ausente ⇒ "avulso"). */
export function tipoCobranca(t: Transacao): TipoCobranca {
  return t.type ?? "avulso";
}

/** Cliente tem ≥1 cobrança atrasada — fonte única do "Inadimplente". */
export function clienteEstaInadimplente(state: AppState, cliente: Cliente, hojeISO: string = HOJE_ISO): boolean {
  return state.transacoes.some((t) => ehDoCliente(t, cliente) && statusCobranca(t, hojeISO) === "atrasado");
}

/**
 * Cliente assinante: tem um plano atribuído diferente de "Avulso" — então os
 * atendimentos são cobertos (R$ 0) ao concluir. Mesma convenção do filtro de
 * "Avulsos" (`/avulso/i`). Sem data de vencimento por enquanto.
 */
export function clientePossuiPlanoAtivo(cliente: Cliente | null | undefined): boolean {
  const p = (cliente?.plano ?? "").trim();
  return p !== "" && !/avulso/i.test(p);
}

/**
 * Marcador exibido. "Inadimplente" é DERIVADO das cobranças (fonte única); o tag
 * manual cobre só VIP/Novo. Um "Inadimplente" gravado à mão (legado) é ignorado.
 */
export function tagDerivadaCliente(state: AppState, cliente: Cliente, hojeISO: string = HOJE_ISO): ClienteTag {
  if (clienteEstaInadimplente(state, cliente, hojeISO)) return "Inadimplente";
  return cliente.tag === "Inadimplente" ? "" : cliente.tag;
}

export type FiltroTransacao = "Todas" | "Pagas" | "Pendentes" | "Atrasadas";
export type FiltroTipoCobranca = "todos" | "mensalidade" | "avulso";

const STATUS_DO_FILTRO: Record<Exclude<FiltroTransacao, "Todas">, TransacaoStatus> = {
  Pagas: "pago",
  Pendentes: "pendente",
  Atrasadas: "atrasado",
};

export function selectTransacoes(
  state: AppState,
  filtro: FiltroTransacao,
  busca: string,
  tipo: FiltroTipoCobranca = "todos",
  hojeISO: string = HOJE_ISO,
): Transacao[] {
  let lista = state.transacoes;
  if (tipo !== "todos") lista = lista.filter((t) => tipoCobranca(t) === tipo);
  if (filtro !== "Todas") lista = lista.filter((t) => statusCobranca(t, hojeISO) === STATUS_DO_FILTRO[filtro]);
  const q = normaliza(busca.trim());
  if (q) {
    lista = lista.filter(
      (t) =>
        normaliza(t.clienteNome).includes(q) ||
        normaliza(t.servico).includes(q) ||
        normaliza(t.barbeiroNome).includes(q),
    );
  }
  return lista;
}

/** Contagem por status (derivado) para as pills, respeitando o filtro de tipo. */
export function selectContagensTransacao(
  state: AppState,
  tipo: FiltroTipoCobranca = "todos",
  hojeISO: string = HOJE_ISO,
): Record<FiltroTransacao, number> {
  const base = tipo === "todos" ? state.transacoes : state.transacoes.filter((t) => tipoCobranca(t) === tipo);
  const cont = (st: TransacaoStatus) => base.filter((t) => statusCobranca(t, hojeISO) === st).length;
  return { Todas: base.length, Pagas: cont("pago"), Pendentes: cont("pendente"), Atrasadas: cont("atrasado") };
}

/** Somatórios para os KPIs de /pagamentos (mês de `hojeISO`). */
export function selectResumoFinanceiro(
  state: AppState,
  hojeISO: string = HOJE_ISO,
): { recebidoMes: number; aReceber: number; emAtraso: number; qtdAtraso: number } {
  const mes = hojeISO.slice(0, 7); // "YYYY-MM"
  let recebidoMes = 0;
  let aReceber = 0;
  let emAtraso = 0;
  let qtdAtraso = 0;
  for (const t of state.transacoes) {
    const st = statusCobranca(t, hojeISO);
    if (st === "pago") {
      if ((t.paidAt ?? "").slice(0, 7) === mes) recebidoMes += valorRecebido(t);
    } else if (st === "atrasado") {
      emAtraso += valorCobrado(t);
      qtdAtraso += 1;
    } else {
      aReceber += valorCobrado(t);
    }
  }
  return { recebidoMes, aReceber, emAtraso, qtdAtraso };
}

export function precoServico(state: AppState, nome: string): number {
  return state.servicos.find((s) => s.nome === nome)?.preco ?? 0;
}

/** "R$ 1.005" — formatação determinística (sem toLocaleString, evita mismatch). */
export function formatBRL(n: number): string {
  return "R$ " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function duracaoServico(state: AppState, nome: string): number {
  return state.servicos.find((s) => s.nome === nome)?.duracaoMin ?? 40;
}

// ---- Derivações por cliente (painel de detalhe) ----

/** Casa um agendamento/transação ao cliente por id (preferido) ou nome (fallback p/ dados legados). */
export function ehDoCliente(item: { clienteId?: string; clienteNome?: string }, cliente: Cliente): boolean {
  if (item.clienteId) return item.clienteId === cliente.id;
  return (item.clienteNome ?? "") === cliente.nome;
}

export interface HistoricoItem {
  id: string;
  dateISO: string;
  data: string; // "23 jun"
  servico: string;
  barbeiro: string;
  valor: number;
}

/** Histórico real de atendimentos concluídos do cliente, mais recente primeiro. */
export function selectHistoricoCliente(state: AppState, cliente: Cliente): HistoricoItem[] {
  return state.agendamentos
    .filter((a) => a.status === "concluido" && ehDoCliente(a, cliente))
    .sort((a, b) => (a.date === b.date ? comparaHora(b.inicio, a.inicio) : b.date.localeCompare(a.date)))
    .map((a) => ({
      id: a.id,
      dateISO: a.date,
      data: isoParaDiaMes(a.date),
      servico: a.servico,
      barbeiro: barbeiroNomePorId(state, a.barbeiroId),
      // Atendimento coberto pelo plano não cobra o corte → R$ 0 no histórico.
      valor: a.cobertoPorPlano ? 0 : precoServico(state, a.servico),
    }));
}

/** Próximo agendamento futuro (ativo) do cliente, ou null. */
export function selectProximoAgendamentoCliente(
  state: AppState,
  cliente: Cliente,
  hojeISO: string,
): (Agendamento & { barbeiroNome: string }) | null {
  const ativos: AgendamentoStatus[] = ["agendado", "confirmado", "atendimento"];
  const p = state.agendamentos
    .filter((a) => ehDoCliente(a, cliente) && a.date >= hojeISO && ativos.includes(a.status))
    .sort((a, b) => (a.date === b.date ? comparaHora(a.inicio, b.inicio) : a.date.localeCompare(b.date)))[0];
  return p ? { ...p, barbeiroNome: barbeiroNomePorId(state, p.barbeiroId) } : null;
}

/** Forma de pagamento mais usada pelo cliente (moda das transações), ou null. */
export function selectFormaPreferidaCliente(state: AppState, cliente: Cliente): FormaPagamento | null {
  const contagem = new Map<FormaPagamento, number>();
  for (const t of state.transacoes) {
    // Cobertos pelo plano não têm forma real de pagamento — não contam aqui.
    if (ehDoCliente(t, cliente) && !t.cobertoPorPlano) contagem.set(t.forma, (contagem.get(t.forma) ?? 0) + 1);
  }
  let melhor: FormaPagamento | null = null;
  let max = 0;
  for (const [forma, n] of contagem) {
    if (n > max) {
      max = n;
      melhor = forma;
    }
  }
  return melhor;
}

export const formaPagamentoLabel: Record<FormaPagamento, string> = {
  pix: "Pix",
  cartao: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  dinheiro: "Dinheiro",
};
