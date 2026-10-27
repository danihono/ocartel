// Relatórios por período — cálculo puro, sem Firebase.
//
// Os dados chegam de uma server action (app/(admin)/relatorios/actions.ts) que lê o
// período inteiro no servidor: o navegador só guarda uma janela recente (agendamentos dos
// últimos meses, as últimas cobranças), e um relatório de "este ano" calculado dali sairia
// pela metade sem ninguém perceber.
//
// De onde vem cada número:
//   - DINHEIRO vem das cobranças pagas no período (`paidAt`). É o que entrou no caixa —
//     inclusive mensalidade, que não tem atendimento.
//   - MOVIMENTO (atendimentos, faltas, horários de pico) vem da agenda (`date`).
// Os dois não se misturam: um atendimento de outubro pago em novembro é receita de
// novembro e atendimento de outubro, como num extrato.

import { addDias, addMeses, diasEntre } from "./date";
import { formaPagamentoLabel, valorRecebido } from "./selectors";
import type { Agendamento, Barbeiro, Transacao } from "./types";

export type PresetPeriodo = "mes" | "mes-passado" | "7d" | "30d" | "90d" | "ano" | "personalizado";

export interface Periodo {
  inicio: string; // "YYYY-MM-DD", inclusivo
  fim: string; // "YYYY-MM-DD", inclusivo
}

export const PRESETS: { value: Exclude<PresetPeriodo, "personalizado">; label: string }[] = [
  { value: "mes", label: "Este mês" },
  { value: "mes-passado", label: "Mês passado" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "ano", label: "Este ano" },
];

export function periodoDoPreset(preset: Exclude<PresetPeriodo, "personalizado">, hojeISO: string): Periodo {
  const inicioMes = `${hojeISO.slice(0, 7)}-01`;
  switch (preset) {
    case "mes":
      return { inicio: inicioMes, fim: hojeISO };
    case "mes-passado": {
      const inicio = addMeses(inicioMes, -1);
      return { inicio, fim: addDias(inicioMes, -1) };
    }
    case "7d":
      return { inicio: addDias(hojeISO, -6), fim: hojeISO };
    case "30d":
      return { inicio: addDias(hojeISO, -29), fim: hojeISO };
    case "90d":
      return { inicio: addDias(hojeISO, -89), fim: hojeISO };
    case "ano":
      return { inicio: `${hojeISO.slice(0, 4)}-01-01`, fim: hojeISO };
  }
}

/** Número de dias do período (inclusivo). */
export function duracaoDias(p: Periodo): number {
  return diasEntre(p.inicio, p.fim) + 1;
}

/** O período imediatamente anterior, com o mesmo número de dias — a base da comparação. */
export function periodoAnterior(p: Periodo): Periodo {
  const n = duracaoDias(p);
  return { inicio: addDias(p.inicio, -n), fim: addDias(p.inicio, -1) };
}

const noPeriodo = (iso: string | undefined, p: Periodo) => !!iso && iso.slice(0, 10) >= p.inicio && iso.slice(0, 10) <= p.fim;

export interface ResumoPeriodo {
  /** Tudo o que entrou (cobranças pagas no período). */
  receita: number;
  /** Parte da receita que veio de mensalidades. */
  receitaMensalidades: number;
  /** Cobranças pagas. */
  pagamentos: number;
  atendimentos: number;
  /** Receita de atendimentos avulsos ÷ atendimentos concluídos. */
  ticketMedio: number;
  faltas: number;
  /** faltas ÷ (concluídos + faltas), 0..100. */
  taxaFaltas: number;
  cancelados: number;
  novosClientes: number;
}

export interface LinhaRanking {
  nome: string;
  qtd: number;
  receita: number;
}

export interface Relatorio {
  periodo: Periodo;
  anterior: Periodo;
  atual: ResumoPeriodo;
  comparacao: ResumoPeriodo;
  porServico: LinhaRanking[];
  porBarbeiro: LinhaRanking[];
  porForma: LinhaRanking[];
  /** Receita por dia do período, na ordem. */
  serie: { dia: string; receita: number }[];
  /** Agendamentos (sem bloqueio nem cancelado) por dia da semana × hora. [0]=Seg … [6]=Dom. */
  calor: number[][];
  horas: number[];
}

export interface DadosRelatorio {
  agendamentos: Agendamento[];
  transacoes: Transacao[];
  barbeiros: Barbeiro[];
  novosClientes: { atual: number; anterior: number };
}

const pagas = (ts: Transacao[], p: Periodo) => ts.filter((t) => t.status === "pago" && noPeriodo(t.paidAt, p));

function resumo(d: DadosRelatorio, p: Periodo, novos: number): ResumoPeriodo {
  const tp = pagas(d.transacoes, p);
  const receita = tp.reduce((s, t) => s + valorRecebido(t), 0);
  const receitaMensalidades = tp.filter((t) => t.type === "mensalidade").reduce((s, t) => s + valorRecebido(t), 0);
  const ags = d.agendamentos.filter((a) => noPeriodo(a.date, p));
  const atendimentos = ags.filter((a) => a.status === "concluido").length;
  const faltas = ags.filter((a) => a.status === "noshow").length;
  const cancelados = ags.filter((a) => a.status === "cancelado").length;
  const receitaAvulsa = receita - receitaMensalidades;
  return {
    receita,
    receitaMensalidades,
    pagamentos: tp.length,
    atendimentos,
    ticketMedio: atendimentos ? Math.round(receitaAvulsa / atendimentos) : 0,
    faltas,
    taxaFaltas: atendimentos + faltas ? Math.round((faltas / (atendimentos + faltas)) * 100) : 0,
    cancelados,
    novosClientes: novos,
  };
}

function ranking(mapa: Map<string, { qtd: number; receita: number }>): LinhaRanking[] {
  return [...mapa.entries()]
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.receita - a.receita || b.qtd - a.qtd || a.nome.localeCompare(b.nome));
}

function somar(mapa: Map<string, { qtd: number; receita: number }>, chave: string, receita: number, qtd = 1) {
  const atual = mapa.get(chave) ?? { qtd: 0, receita: 0 };
  mapa.set(chave, { qtd: atual.qtd + qtd, receita: atual.receita + receita });
}

export function montarRelatorio(d: DadosRelatorio, periodo: Periodo): Relatorio {
  const anterior = periodoAnterior(periodo);
  const tp = pagas(d.transacoes, periodo);
  const nomeBarbeiro = new Map(d.barbeiros.map((b) => [b.id, b.nome]));

  // Por serviço: o dinheiro de cada item cobrado. Mensalidade vira uma linha só.
  const porServico = new Map<string, { qtd: number; receita: number }>();
  for (const t of tp) somar(porServico, t.type === "mensalidade" ? "Mensalidades" : t.servico || "Sem item", valorRecebido(t));

  // Por barbeiro: atendimentos da agenda + dinheiro das cobranças ligadas a ele.
  const porBarbeiro = new Map<string, { qtd: number; receita: number }>();
  for (const a of d.agendamentos) {
    if (a.status === "concluido" && noPeriodo(a.date, periodo)) somar(porBarbeiro, nomeBarbeiro.get(a.barbeiroId) ?? "Sem barbeiro", 0);
  }
  for (const t of tp) {
    if (t.type === "mensalidade") continue;
    const nome = (t.barbeiroId && nomeBarbeiro.get(t.barbeiroId)) || t.barbeiroNome || "Sem barbeiro";
    somar(porBarbeiro, nome, valorRecebido(t), 0);
  }

  const porForma = new Map<string, { qtd: number; receita: number }>();
  for (const t of tp) somar(porForma, t.forma ? (formaPagamentoLabel[t.forma] ?? t.forma) : "Não informada", valorRecebido(t));

  // Série diária (receita por dia).
  const n = duracaoDias(periodo);
  const porDia = new Map<string, number>();
  for (const t of tp) {
    const dia = (t.paidAt ?? "").slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + valorRecebido(t));
  }
  const serie = Array.from({ length: n }, (_, i) => {
    const dia = addDias(periodo.inicio, i);
    return { dia, receita: porDia.get(dia) ?? 0 };
  });

  // Mapa de calor dia da semana × hora (o que de fato ocupou a agenda).
  const ocupando = d.agendamentos.filter((a) => noPeriodo(a.date, periodo) && a.status !== "bloqueio" && a.status !== "cancelado");
  const horasUsadas = ocupando.map((a) => Number(a.inicio.slice(0, 2))).filter((h) => Number.isFinite(h));
  const hMin = horasUsadas.length ? Math.min(8, ...horasUsadas) : 8;
  const hMax = horasUsadas.length ? Math.max(19, ...horasUsadas) : 19;
  const horas = Array.from({ length: hMax - hMin + 1 }, (_, i) => hMin + i);
  const calor = Array.from({ length: 7 }, () => horas.map(() => 0));
  for (const a of ocupando) {
    const h = Number(a.inicio.slice(0, 2));
    // getUTCDay: 0=Dom … 6=Sáb → 0=Seg … 6=Dom
    const dow = (new Date(`${a.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const col = h - hMin;
    if (col >= 0 && col < horas.length) calor[dow][col] += 1;
  }

  return {
    periodo,
    anterior,
    atual: resumo(d, periodo, d.novosClientes.atual),
    comparacao: resumo(d, anterior, d.novosClientes.anterior),
    porServico: ranking(porServico),
    porBarbeiro: ranking(porBarbeiro),
    porForma: ranking(porForma),
    serie,
    calor,
    horas,
  };
}

/**
 * Variação percentual entre dois valores, para o selo "▲ 12%". `null` quando não há base
 * (o período anterior foi zero) — "infinito por cento" não diz nada a ninguém.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
