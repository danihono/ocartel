// Comissões — a lógica pura, sem Firestore e sem React.
//
// Duas responsabilidades, e só elas:
//   1. MONTAR as linhas do mês (o que cada barbeiro fez, com todos os fatos do caso);
//   2. CALCULAR quanto cada linha vale de comissão.
//
// A separação não é estética. A fórmula de comissão muda de barbearia para barbearia e
// ainda vai mudar aqui — ela depende de ser plano ou não, de ter sido pago na hora, de
// quantidade. A parte que é por linha (percentual dos avulsos) mora só em
// `comissaoDaLinha`: a montagem das linhas já entrega todos os fatos, a tela já sabe
// exibir, o fechamento já sabe congelar.
//
// Por isso `LinhaComissao` carrega campos que a regra de hoje ignora (`quantidade`,
// `pagoNoAto`, `forma`, `tipoCobranca`, `cobertoPorPlano`, cobrado vs. recebido). Não é
// excesso: é o contrato que evita uma migração de schema no dia da troca.
//
// A mensalidade tem conta própria, que não cabe numa linha só: o POTE DA ASSINATURA.
// Uma fatia do que entrou de mensalidade no mês é repartida pelas fichas que cada
// barbeiro fez nos atendimentos cobertos pelo plano. Como a parte de cada um depende das
// fichas de todo mundo, ela é calculada no fim de `apurarMes`, e não em `comissaoDaLinha`.
//
// Mesma disciplina de `lib/cobranca-ciclo.ts`: recebe dados crus, não o store, para ser
// testável sem subir nada.

import { HOJE_ISO, inicioDaSemana, isoParaDiaMes } from "./date";
import { statusCobranca, tipoCobranca, valorCobrado, valorRecebido } from "./selectors";
import type {
  Agendamento,
  Barbeiro,
  FechamentoComissao,
  ItemFicha,
  LinhaComissao,
  RegraComissao,
  RegraPote,
  Servico,
  Transacao,
  ValorFicha,
} from "./types";

/** Regra de quem nunca configurou nada — ninguém começa a dever comissão sozinho. */
export const REGRA_PADRAO: RegraComissao = { pctPadrao: 0 };

/** As peças que valem ficha, na ordem em que a tela mostra. */
export const ITENS_FICHA: { id: ItemFicha; nome: string }[] = [
  { id: "cabelo", nome: "Cabelo" },
  { id: "barba", nome: "Barba" },
  { id: "raspar", nome: "Raspar" },
];

/** Tabela de fichas da casa: pelo tempo de cada peça; repetida na semana vale metade. */
export const FICHAS_PADRAO: Record<ItemFicha, ValorFicha> = {
  cabelo: { cheia: 30, repetida: 15 },
  barba: { cheia: 30, repetida: 15 },
  raspar: { cheia: 20, repetida: 10 },
};

/**
 * Ponto de partida da tela de configuração. `pct: 0` = pote desligado: a tabela de fichas
 * já vem preenchida, mas ninguém passa a receber mensalidade até alguém definir o percentual.
 */
export const POTE_PADRAO: RegraPote = { pct: 0, fichas: FICHAS_PADRAO };

export interface DadosComissao {
  agendamentos: Agendamento[];
  transacoes: Transacao[];
  barbeiros: Barbeiro[];
  /** Catálogo — liga o nome do serviço de um agendamento antigo (sem `servicoId`) ao id. */
  servicos?: Servico[];
}

/** O pote da assinatura do mês, já com os números do resumo da tela. */
export interface ResumoPote {
  /** Há pote configurado com percentual acima de zero. */
  ativo: boolean;
  pct: number;
  /** Mensalidades efetivamente recebidas no mês, em R$. */
  receitaAssinaturas: number;
  /** `receitaAssinaturas × pct`, em R$. */
  valor: number;
  /** Soma das fichas de todos os barbeiros no mês. */
  totalFichas: number;
  /** Quanto vale uma ficha neste mês (`valor ÷ totalFichas`); 0 sem fichas. */
  valorPorFicha: number;
}

/** Resumo de um barbeiro no mês — uma linha da visão "todos". */
export interface ResumoBarbeiro {
  barbeiroId: string;
  barbeiroNome: string;
  atendimentos: number;
  faturamento: number;
  /** Total a receber no mês: o percentual dos avulsos + a parte do pote. */
  comissao: number;
  /** Percentual aplicado aos avulsos. */
  pct: number;
  /** Só a parte do percentual sobre os avulsos, em R$. */
  comissaoAvulso: number;
  /** Fichas do barbeiro no mês (atendimentos cobertos pelo plano). */
  fichas: number;
  /** Fatia das fichas do mês que é dele (0..1). */
  participacao: number;
  /** Só a parte do pote da assinatura, em R$. */
  valorPote: number;
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
  pote: ResumoPote;
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
 * Parte por linha: percentual do barbeiro (ou o padrão da casa) sobre o valor
 * efetivamente RECEBIDO do atendimento avulso. Consequências:
 *   - atendimento coberto pelo plano entra como R$ 0 aqui — ele é pago pelo pote da
 *     assinatura, em fichas, no fim de `apurarMes`;
 *   - cobrança em aberto não gera comissão enquanto não for recebida;
 *   - a linha da mensalidade fica em 0: ela não é de ninguém em particular, e é ela que
 *     enche o pote.
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

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Peças deduzidas do nome: "Corte + Barba" → cabelo e barba. É o palpite, a tela deixa corrigir. */
export function itensPeloNome(nome: string): ItemFicha[] {
  const n = semAcento(nome);
  const itens: ItemFicha[] = [];
  if (/corte|cabelo/.test(n)) itens.push("cabelo");
  if (/barba/.test(n)) itens.push("barba");
  if (/rasp/.test(n)) itens.push("raspar");
  return itens;
}

/** Peças de um serviço: as marcadas em Configurações, ou as deduzidas do nome. */
export function itensDoServico(servico: { id?: string; nome: string }, pote: RegraPote): ItemFicha[] {
  const marcados = servico.id ? pote.itensPorServico?.[servico.id] : undefined;
  return marcados ?? itensPeloNome(servico.nome);
}

/** Valor de uma peça; doc incompleto no Firestore cai na tabela da casa em vez de virar NaN. */
function valorDaPeca(pote: RegraPote, item: ItemFicha): ValorFicha {
  return pote.fichas?.[item] ?? FICHAS_PADRAO[item];
}

function cobertoPeloPlano(ag: Agendamento, transacoes: Transacao[]): boolean {
  return Boolean(ag.cobertoPorPlano ?? transacoes.find((t) => t.agendamentoId === ag.id)?.cobertoPorPlano);
}

/**
 * Fichas de cada atendimento coberto pelo plano no mês (`agendamentoId` → fichas).
 *
 * Cada peça vale a ficha cheia na primeira vez que o cliente a faz na semana (segunda a
 * domingo) e a ficha de repetido nas seguintes. A semana não respeita a virada do mês:
 * o cabelo do dia 31 faz o do dia 2 seguinte valer repetido se caírem na mesma semana —
 * por isso a busca começa na segunda-feira da semana do dia 1º.
 */
function fichasDoMes(
  dados: DadosComissao,
  mes: string,
  pote: RegraPote,
): Map<string, { fichas: number; repetida: boolean }> {
  const desde = inicioDaSemana(`${mes}-01`);
  const idPorNome = new Map((dados.servicos ?? []).map((s) => [s.nome, s.id]));
  const cobertos = dados.agendamentos
    .filter(
      (a) =>
        a.status === "concluido" &&
        a.date >= desde &&
        mesDe(a.date) <= mes &&
        cobertoPeloPlano(a, dados.transacoes),
    )
    .sort((a, b) => (a.date === b.date ? a.inicio.localeCompare(b.inicio) : a.date.localeCompare(b.date)));

  const feitas = new Set<string>();
  const out = new Map<string, { fichas: number; repetida: boolean }>();
  for (const ag of cobertos) {
    const cliente = ag.clienteId || semAcento(ag.clienteNome);
    const semana = inicioDaSemana(ag.date);
    let fichas = 0;
    let repetida = false;
    for (const item of itensDoServico({ id: ag.servicoId ?? idPorNome.get(ag.servico), nome: ag.servico }, pote)) {
      const chave = `${cliente}|${semana}|${item}`;
      const v = valorDaPeca(pote, item);
      if (feitas.has(chave)) {
        fichas += v.repetida;
        repetida = true;
      } else {
        fichas += v.cheia;
        feitas.add(chave);
      }
    }
    out.set(ag.id, { fichas, repetida });
  }
  return out;
}

/**
 * Reparte o pote proporcionalmente às fichas: barbeiro com 1.840 de 2.400 fichas leva
 * 1.840/2.400 do pote.
 *
 * A conta é feita em centavos com a fração exata — nada de arredondar a porcentagem antes
 * (76,67% em vez de 1.840/2.400 faz a soma das partes passar ou faltar do pote). Os
 * centavos que sobram do arredondamento vão para as maiores frações, então a soma das
 * partes é SEMPRE igual ao pote.
 */
export function distribuirPote(valor: number, fichasPorBarbeiro: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const total = [...fichasPorBarbeiro.values()].reduce((s, f) => s + f, 0);
  if (valor <= 0 || total <= 0) {
    for (const id of fichasPorBarbeiro.keys()) out.set(id, 0);
    return out;
  }
  const centavos = Math.round(valor * 100);
  const partes = [...fichasPorBarbeiro].map(([id, f]) => {
    const exato = (centavos * f) / total;
    const base = Math.floor(exato);
    return { id, base, resto: exato - base };
  });
  let sobra = centavos - partes.reduce((s, p) => s + p.base, 0);
  for (const p of [...partes].sort((a, b) => b.resto - a.resto || a.id.localeCompare(b.id))) {
    if (sobra <= 0) break;
    p.base += 1;
    sobra -= 1;
  }
  for (const p of partes) out.set(p.id, p.base / 100);
  return out;
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
  const fichasPorAgendamento = regra.pote ? fichasDoMes(dados, mes, regra.pote) : new Map();

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
      fichas: fichasPorAgendamento.get(ag.id)?.fichas ?? 0,
      repetidaNaSemana: fichasPorAgendamento.get(ag.id)?.repetida ?? false,
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
      fichas: 0,
      repetidaNaSemana: false,
    };
    linhas.push({ ...base, comissao: comissaoDaLinha(base, regra) });
  }

  // --- Pote da assinatura: X recebido de mensalidade × pct, repartido pelas fichas ---
  const atendimentos = linhas.filter((l) => l.origem === "atendimento");
  const receitaAssinaturas = arredonda(
    linhas.filter((l) => l.origem === "mensalidade").reduce((s, l) => s + l.valorRecebido, 0),
  );
  const pctPote = regra.pote?.pct ?? 0;
  const valorPote = arredonda((receitaAssinaturas * pctPote) / 100);
  const fichasPorBarbeiro = new Map<string, number>();
  for (const l of atendimentos) {
    if (l.fichas > 0) fichasPorBarbeiro.set(l.barbeiroId, (fichasPorBarbeiro.get(l.barbeiroId) ?? 0) + l.fichas);
  }
  const totalFichas = [...fichasPorBarbeiro.values()].reduce((s, f) => s + f, 0);
  const parteDoPote = distribuirPote(valorPote, fichasPorBarbeiro);

  // --- Consolidação por barbeiro ---
  const fechamentoDe = new Map(fechamentos.filter((f) => f.mes === mes).map((f) => [f.barbeiroId, f]));
  const porBarbeiro: ResumoBarbeiro[] = dados.barbeiros.map((b) => {
    const minhas = atendimentos.filter((l) => l.barbeiroId === b.id);
    const fechamento = fechamentoDe.get(b.id);
    const comissaoAvulso = arredonda(minhas.reduce((s, l) => s + l.comissao, 0));
    const fichas = fichasPorBarbeiro.get(b.id) ?? 0;
    const daParte = parteDoPote.get(b.id) ?? 0;
    return {
      barbeiroId: b.id,
      barbeiroNome: b.nome,
      atendimentos: minhas.length,
      faturamento: arredonda(minhas.reduce((s, l) => s + l.valorRecebido, 0)),
      comissao: arredonda(comissaoAvulso + daParte),
      pct: pctDoBarbeiro(regra, b.id),
      comissaoAvulso,
      fichas,
      participacao: totalFichas > 0 ? fichas / totalFichas : 0,
      valorPote: daParte,
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
    pote: {
      ativo: pctPote > 0,
      pct: pctPote,
      receitaAssinaturas,
      valor: valorPote,
      totalFichas,
      valorPorFicha: totalFichas > 0 ? valorPote / totalFichas : 0,
    },
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
    fichas: resumo.fichas,
    valorPote: resumo.valorPote,
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
