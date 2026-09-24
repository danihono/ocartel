// Estoque — a lógica pura de filtro e contagem das solicitações de produto.
//
// Esta fase não controla saldo: não existe quantidade em mãos, estoque mínimo nem baixa
// de consumo. O módulo registra o que a barbearia já faz no papel — faltou, alguém anota;
// comprou, alguém dá baixa. Tratar isso como controle de estoque de verdade exigiria que
// alguém desse baixa de consumo todo dia, e um saldo que ninguém alimenta mente.
//
// Sem React e sem Firestore, pelo mesmo motivo dos outros módulos: dá para testar sem
// subir nada.

import type { SolicitacaoProduto, StatusSolicitacao } from "./types";

export type FiltroSolicitacao = "Pendentes" | "Compradas" | "Canceladas" | "Todas";

export const FILTROS_SOLICITACAO: FiltroSolicitacao[] = ["Pendentes", "Compradas", "Canceladas", "Todas"];

const STATUS_DO_FILTRO: Record<Exclude<FiltroSolicitacao, "Todas">, StatusSolicitacao> = {
  Pendentes: "pendente",
  Compradas: "comprado",
  Canceladas: "cancelado",
};

/** Data que define a qual mês a solicitação pertence: a da compra, ou a do pedido. */
export function dataDeReferencia(s: SolicitacaoProduto): string {
  return s.status === "comprado" ? (s.compradoEm ?? s.solicitadoEm) : s.solicitadoEm;
}

/**
 * Lista filtrada.
 *
 * O filtro de mês NÃO se aplica a "Pendentes" de propósito: uma falta anotada dois meses
 * atrás e nunca comprada continua sendo uma falta hoje. Esconder ela ao navegar para o mês
 * corrente seria a forma mais fácil de o sistema fazer a barbearia esquecer de comprar.
 */
export function selectSolicitacoes(
  lista: SolicitacaoProduto[],
  filtro: FiltroSolicitacao,
  mes: string,
  busca = "",
): SolicitacaoProduto[] {
  let r = lista;
  if (filtro !== "Todas") r = r.filter((s) => s.status === STATUS_DO_FILTRO[filtro]);
  if (filtro !== "Pendentes") r = r.filter((s) => dataDeReferencia(s).slice(0, 7) === mes);

  const q = busca.trim().toLowerCase();
  if (q) {
    r = r.filter(
      (s) => s.produto.toLowerCase().includes(q) || (s.observacoes ?? "").toLowerCase().includes(q),
    );
  }

  // Urgente primeiro, depois o pedido mais recente.
  return [...r].sort((a, b) => {
    if (a.status === "pendente" && b.status === "pendente" && a.urgencia !== b.urgencia) {
      return a.urgencia === "urgente" ? -1 : 1;
    }
    return dataDeReferencia(b).localeCompare(dataDeReferencia(a));
  });
}

/** Contagem por pill, com a mesma regra de mês do `selectSolicitacoes`. */
export function contagensSolicitacao(
  lista: SolicitacaoProduto[],
  mes: string,
): Record<FiltroSolicitacao, number> {
  const noMes = lista.filter((s) => dataDeReferencia(s).slice(0, 7) === mes);
  return {
    Pendentes: lista.filter((s) => s.status === "pendente").length,
    Compradas: noMes.filter((s) => s.status === "comprado").length,
    Canceladas: noMes.filter((s) => s.status === "cancelado").length,
    Todas: noMes.length,
  };
}

/** Quantas faltas urgentes esperam compra — alimenta o banner da tela. */
export function urgentesPendentes(lista: SolicitacaoProduto[]): SolicitacaoProduto[] {
  return lista.filter((s) => s.status === "pendente" && s.urgencia === "urgente");
}

/** Quanto foi gasto no mês com o que já foi comprado. */
export function gastoDoMes(lista: SolicitacaoProduto[], mes: string): number {
  const total = lista
    .filter((s) => s.status === "comprado" && (s.compradoEm ?? "").slice(0, 7) === mes)
    .reduce((soma, s) => soma + (s.custo ?? 0), 0);
  return Math.round(total * 100) / 100;
}
