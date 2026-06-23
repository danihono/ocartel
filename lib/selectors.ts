// Seletores puros: derivam as formas que as telas já esperam a partir do
// modelo único `Agendamento`. As telas leem daqui (não importam mock-data).
import type { AppState } from "./store";
import type {
  Agendamento,
  AgendamentoStatus,
  BlocoAgenda,
  Cliente,
  ProximoAgendamento,
  Transacao,
} from "./types";
import { comparaHora } from "./date";

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

export function selectClientesFiltrados(state: AppState, filtro: FiltroCliente, busca: string): Cliente[] {
  let lista = state.clientes;
  if (filtro === "VIP") lista = lista.filter((c) => c.tag === "VIP");
  else if (filtro === "Inadimplentes") lista = lista.filter((c) => c.tag === "Inadimplente");
  else if (filtro === "Avulsos") lista = lista.filter((c) => /avulso/i.test(c.plano));
  const q = normaliza(busca.trim());
  if (q) {
    lista = lista.filter(
      (c) => normaliza(c.nome).includes(q) || normaliza(c.telefone).includes(q) || normaliza(c.email).includes(q),
    );
  }
  return lista;
}

export function selectContagensCliente(state: AppState): Record<FiltroCliente, number> {
  return {
    Todos: state.clientes.length,
    VIP: state.clientes.filter((c) => c.tag === "VIP").length,
    Avulsos: state.clientes.filter((c) => /avulso/i.test(c.plano)).length,
    Inadimplentes: state.clientes.filter((c) => c.tag === "Inadimplente").length,
  };
}

export type FiltroTransacao = "Todas" | "Pagas" | "Pendentes" | "Atrasadas";

export function selectTransacoes(state: AppState, filtro: FiltroTransacao, busca: string): Transacao[] {
  let lista = state.transacoes;
  if (filtro === "Pagas") lista = lista.filter((t) => t.status === "pago");
  else if (filtro === "Pendentes") lista = lista.filter((t) => t.status === "pendente");
  else if (filtro === "Atrasadas") lista = lista.filter((t) => t.status === "atrasado");
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

/** Somatórios para os KPIs de /pagamentos. */
export function selectResumoFinanceiro(state: AppState): {
  recebido: number;
  pendente: number;
  atrasado: number;
} {
  const soma = (st: Transacao["status"]) =>
    state.transacoes.filter((t) => t.status === st).reduce((acc, t) => acc + t.valor, 0);
  return { recebido: soma("pago"), pendente: soma("pendente"), atrasado: soma("atrasado") };
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
