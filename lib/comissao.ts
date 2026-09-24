// Comissões — a lógica pura, sem Firestore e sem React.
//
// Duas responsabilidades, e só elas:
//   1. MONTAR as linhas do mês (o que cada barbeiro fez, com todos os fatos do caso);
//   2. CALCULAR quanto cada linha vale de comissão.
//
// A separação não é estética. A fórmula de comissão muda de barbearia para barbearia e
// ainda vai mudar aqui — ela depende de ser plano ou não, de ter sido pago na hora, de
// quantidade. A regra que está implementada hoje (percentual) é PROVISÓRIA. Quando a
// definitiva chegar, o único lugar que muda é `comissaoDaLinha`: a montagem das linhas já
// entrega todos os fatos, a tela já sabe exibir, o fechamento já sabe congelar.
//
// Por isso `LinhaComissao` carrega campos que a regra de hoje ignora (`quantidade`,
// `pagoNoAto`, `forma`, `tipoCobranca`, `cobertoPorPlano`, cobrado vs. recebido). Não é
// excesso: é o contrato que evita uma migração de schema no dia da troca.
//
// Mesma disciplina de `lib/cobranca-ciclo.ts`: recebe dados crus, não o store, para ser
// testável sem subir nada.

import { HOJE_ISO, isoParaDiaMes } from "./date";
import { statusCobranca, tipoCobranca, valorCobrado, valorRecebido } from "./selectors";
import type {
  Agendamento,
  Barbeiro,
  FechamentoComissao,
  LinhaComissao,
  RegraComissao,
  Transacao,
} from "./types";

/** Regra de quem nunca configurou nada — ninguém começa a dever comissão sozinho. */
export const REGRA_PADRAO: RegraComissao = { pctPadrao: 0 };

export interface DadosComissao {
  agendamentos: Agendamento[];
  transacoes: Transacao[];
  barbeiros: Barbeiro[];
}

/** Resumo de um barbeiro no mês — uma linha da visão "todos". */
export interface ResumoBarbeiro {
  barbeiroId: string;
  barbeiroNome: string;
  atendimentos: number;
  faturamento: number;
  comissao: number;
  /** Percentual aplicado (só informativo enquanto a regra é percentual). */
  pct: number;
  /** Fechamento já gravado deste mês, se houver. */
  fechamento?: FechamentoComissao;
}

export interface ApuracaoMes {
  /** "YYYY-MM". */
  mes: string;
  linhas: LinhaComissao[];
  porBarbeiro: ResumoBarbeiro[];
  totalFaturamento: number;
  totalComissao: number;
  /** Linhas cuja cobrança foi adivinhada (docs legados sem `agendamentoId`). */
  qtdInferidas: number;
  /** Atendimentos concluídos sem nenhuma cobrança correspondente. */
  qtdSemCobranca: number;
}

/** Percentual vigente para um barbeiro (o dele, ou o padrão da casa). */
export function pctDoBarbeiro(regra: RegraComissao, barbeiroId: string): number {
  const proprio = regra.pctPorBarbeiro?.[barbeiroId];
  return typeof proprio === "number" ? proprio : regra.pctPadrao;
}

/**
 * ⚠️ PONTO ÚNICO DE TROCA DA FÓRMULA ⚠️
 *
 * Tudo que decide quanto vale a comissão de uma linha está aqui dentro. Trocar a regra
 * da barbearia é reescrever esta função — nada mais: nem schema, nem tela, nem os
 * fechamentos já gravados (que guardam um retrato da regra que usaram).
 *
 * Regra PROVISÓRIA em vigor: percentual do barbeiro (ou o padrão da casa) sobre o valor
 * efetivamente RECEBIDO do atendimento. Consequências que já valem hoje:
 *   - atendimento coberto pelo plano entra como R$ 0, logo comissão 0;
 *   - cobrança em aberto não gera comissão enquanto não for recebida;
 *   - mensalidade não gera comissão, porque não é de ninguém em particular — a fórmula
 *     definitiva é que vai dizer se e como ela se reparte.
 *
 * `linha` chega sem o campo `comissao` justamente porque é esta função que o preenche.
 */
export function comissaoDaLinha(linha: Omit<LinhaComissao, "comissao">, regra: RegraComissao): number {
  if (linha.origem === "mensalidade") return 0;
  if (linha.status !== "pago") return 0;
  const pct = pctDoBarbeiro(regra, linha.barbeiroId);
  return arredonda((linha.valorRecebido * pct) / 100);
}

/** Centavos, sem herdar o lixo de ponto flutuante nas somas. */
function arredonda(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Mês ("YYYY-MM") de uma data ISO; "" quando não há data. */
function mesDe(iso: string | undefined): string {
  return (iso ?? "").slice(0, 7);
}

/**
 * Acha a cobrança de um atendimento.
 *
 * Caminho novo: a transação nasce com `agendamentoId` (ver FinalizarAtendimentoModal).
 * Caminho legado: transações antigas só têm `barbeiroNome` (texto), o nome do serviço e
 * um rótulo curto de data — então casamos por esses três e marcamos a linha como
 * `inferido`, para a tela poder avisar antes de alguém fechar o mês em cima de um palpite.
 */
function achaCobranca(
  ag: Agendamento,
  barbeiroNome: string,
  transacoes: Transacao[],
  usadas: Set<string>,
): { tx?: Transacao; vinculo: LinhaComissao["vinculo"] } {
  const forte = transacoes.find((t) => t.agendamentoId === ag.id);
  if (forte) return { tx: forte, vinculo: "forte" };

  const rotulo = isoParaDiaMes(ag.date);
  const inferida = transacoes.find(
    (t) =>
      !usadas.has(t.id) &&
      !t.agendamentoId &&
      tipoCobranca(t) === "avulso" &&
      t.servico === ag.servico &&
      t.barbeiroNome === barbeiroNome &&
      (t.paidAt === ag.date || t.dueDate === ag.date || t.data === rotulo),
  );
  if (inferida) return { tx: inferida, vinculo: "inferido" };

  return { vinculo: "sem-cobranca" };
}

/**
 * Apura um mês inteiro. Sempre recalculado dos atendimentos — nunca lido de um agregado,
 * para que corrigir um atendimento errado corrija a comissão junto.
 *
 * `fechamentos` entra só para anexar ao resumo o que já foi fechado; ele não altera o
 * cálculo. O valor congelado de um mês fechado é o do fechamento, e a tela mostra os dois
 * quando divergem (foi exatamente isso que o retrato da regra existe para permitir).
 */
export function apurarMes(
  dados: DadosComissao,
  mes: string,
  regra: RegraComissao,
  fechamentos: FechamentoComissao[] = [],
  hojeISO: string = HOJE_ISO,
): ApuracaoMes {
  const nomePorId = new Map(dados.barbeiros.map((b) => [b.id, b.nome]));
  const usadas = new Set<string>();
  const linhas: LinhaComissao[] = [];

  // --- Atendimentos concluídos do mês ---
  const concluidos = dados.agendamentos
    .filter((a) => a.status === "concluido" && mesDe(a.date) === mes)
    .sort((a, b) => (a.date === b.date ? a.inicio.localeCompare(b.inicio) : a.date.localeCompare(b.date)));

  for (const ag of concluidos) {
    const barbeiroNome = nomePorId.get(ag.barbeiroId) ?? "";
    const { tx, vinculo } = achaCobranca(ag, barbeiroNome, dados.transacoes, usadas);
    if (tx) usadas.add(tx.id);

    const base: Omit<LinhaComissao, "comissao"> = {
      id: ag.id,
      origem: "atendimento",
      dataISO: ag.date,
      barbeiroId: ag.barbeiroId,
      barbeiroNome,
      clienteNome: ag.clienteNome,
      servico: ag.servico,
      quantidade: 1,
      cobertoPorPlano: Boolean(ag.cobertoPorPlano ?? tx?.cobertoPorPlano),
      tipoCobranca: tx ? tipoCobranca(tx) : "avulso",
      ...(tx ? { forma: tx.forma } : {}),
      // Sem cobrança não há o que receber: a linha entra como pendente, e a regra de hoje
      // não paga comissão sobre ela. Some da conta quando a cobrança for lançada.
      //
      // O status sai de `hojeISO`, e não da data do atendimento: "atrasado" é a comparação
      // do vencimento com HOJE (ver selectors.statusCobranca). Derivar isso com a data do
      // próprio registro faria nada nunca vencer.
      status: tx ? statusCobranca(tx, hojeISO) : "pendente",
      pagoNoAto: Boolean(tx && tx.paidAt === ag.date),
      valorCobrado: tx ? valorCobrado(tx) : 0,
      valorRecebido: tx && statusCobranca(tx, hojeISO) === "pago" ? valorRecebido(tx) : 0,
      vinculo,
    };
    linhas.push({ ...base, comissao: comissaoDaLinha(base, regra) });
  }

  // --- Mensalidades do mês (não têm agendamento nem barbeiro) ---
  for (const t of dados.transacoes) {
    if (tipoCobranca(t) !== "mensalidade") continue;
    const dataISO = t.paidAt ?? t.dueDate ?? "";
    if (mesDe(dataISO) !== mes) continue;
    const st = statusCobranca(t, hojeISO);
    const base: Omit<LinhaComissao, "comissao"> = {
      id: t.id,
      origem: "mensalidade",
      dataISO,
      barbeiroId: "",
      barbeiroNome: "",
      clienteNome: t.clienteNome,
      servico: t.servico,
      quantidade: 1,
      cobertoPorPlano: false,
      tipoCobranca: "mensalidade",
      forma: t.forma,
      status: st,
      pagoNoAto: false,
      valorCobrado: valorCobrado(t),
      valorRecebido: st === "pago" ? valorRecebido(t) : 0,
      vinculo: "forte",
    };
    linhas.push({ ...base, comissao: comissaoDaLinha(base, regra) });
  }

  // --- Consolidação por barbeiro ---
  const fechamentoDe = new Map(fechamentos.filter((f) => f.mes === mes).map((f) => [f.barbeiroId, f]));
  const porBarbeiro: ResumoBarbeiro[] = dados.barbeiros.map((b) => {
    const minhas = linhas.filter((l) => l.origem === "atendimento" && l.barbeiroId === b.id);
    const fechamento = fechamentoDe.get(b.id);
    return {
      barbeiroId: b.id,
      barbeiroNome: b.nome,
      atendimentos: minhas.length,
      faturamento: arredonda(minhas.reduce((s, l) => s + l.valorRecebido, 0)),
      comissao: arredonda(minhas.reduce((s, l) => s + l.comissao, 0)),
      pct: pctDoBarbeiro(regra, b.id),
      ...(fechamento ? { fechamento } : {}),
    };
  });
  porBarbeiro.sort((a, b) => b.comissao - a.comissao || a.barbeiroNome.localeCompare(b.barbeiroNome));

  return {
    mes,
    linhas,
    porBarbeiro,
    totalFaturamento: arredonda(porBarbeiro.reduce((s, r) => s + r.faturamento, 0)),
    totalComissao: arredonda(porBarbeiro.reduce((s, r) => s + r.comissao, 0)),
    qtdInferidas: linhas.filter((l) => l.vinculo === "inferido").length,
    qtdSemCobranca: linhas.filter((l) => l.vinculo === "sem-cobranca").length,
  };
}

/**
 * Id determinístico do fechamento. É o que torna "Fechar mês" idempotente: clicar duas
 * vezes escreve no mesmo doc em vez de criar um segundo.
 */
export function idFechamento(mes: string, barbeiroId: string): string {
  return `${mes}_${barbeiroId}`;
}

/** Fechamento pronto para gravar, a partir do resumo apurado. */
export function montarFechamento(
  resumo: ResumoBarbeiro,
  mes: string,
  regra: RegraComissao,
  fechadoPor: string,
  agoraISO: string,
): FechamentoComissao {
  return {
    id: idFechamento(mes, resumo.barbeiroId),
    mes,
    barbeiroId: resumo.barbeiroId,
    barbeiroNome: resumo.barbeiroNome,
    total: resumo.comissao,
    faturamento: resumo.faturamento,
    qtdLinhas: resumo.atendimentos,
    regra,
    fechadoPor,
    fechadoEm: agoraISO,
  };
}

/** Mês anterior/seguinte a partir de "YYYY-MM" (a navegação da tela). */
export function mesVizinho(mes: string, passo: number): string {
  const [y, m] = mes.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + passo, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}
