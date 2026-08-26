// Ciclo automático de cobrança — a lógica pura, sem HTTP e sem Firestore.
//
// Três decisões vivem aqui, e só aqui:
//   1. QUAIS mensalidades o ciclo precisa criar neste mês;
//   2. QUEM recebe o aviso de renovação hoje;
//   3. DE QUEM sai boleto hoje.
//
// Separar isso da rota é a mesma escolha já feita em `lib/confirmacao-disparo.ts`, e pelo
// mesmo motivo: é a parte em que errar custa dinheiro de verdade, então ela precisa ser
// testável sem subir servidor nenhum.
//
// O fuso NÃO é reimplementado aqui: `agoraEmBrasilia` e `deveDispararAgora` vêm do módulo
// de confirmação, que já resolveu o problema (a VPS roda em UTC; às 23h de Brasília "hoje"
// já é outro dia lá).

import { addDias, isoParaDiaMes } from "./date";
import {
  clientePossuiPlanoAtivo,
  diaVencimentoCliente,
  ehDoCliente,
  planoDoCliente,
  tipoCobranca,
} from "./selectors";
import type { Cliente, Plano, Transacao } from "./types";

export { agoraEmBrasilia, deveDispararAgora } from "./confirmacao-disparo";

/** Padrões de quem nunca configurou nada na tela (a config inteira é opcional). */
export const PADRAO_DIAS_ANTES_ALERTA = 3;
export const PADRAO_DIAS_VENCIMENTO_BOLETO = 3;

/** Cobrança recém-nascida: sem `id`, que quem grava (Firestore) é que atribui. */
export type NovaMensalidade = Omit<Transacao, "id">;

export interface DadosCiclo {
  clientes: Cliente[];
  planos: Plano[];
  transacoes: Transacao[];
}

export interface Mensalidades {
  novas: NovaMensalidade[];
  /**
   * Clientes marcados como assinantes cujo plano não existe mais no cadastro. Não geram
   * cobrança e não podem sumir em silêncio — a barbearia precisa saber para arrumar.
   */
  semPlano: number;
}

/**
 * As mensalidades que faltam no ciclo `cicloMes` ("YYYY-MM").
 *
 * IDEMPOTENTE por construção: um cliente que já tem mensalidade vencendo naquele mês é
 * pulado. É o que deixa o botão manual e o disparo agendado rodarem quantas vezes for —
 * ninguém é cobrado duas vezes pelo mesmo mês.
 */
export function mensalidadesAGerar({ clientes, planos, transacoes }: DadosCiclo, cicloMes: string): Mensalidades {
  const novas: NovaMensalidade[] = [];
  let semPlano = 0;

  for (const cl of clientes) {
    const plano = planoDoCliente(planos, cl);
    if (!plano) {
      if (clientePossuiPlanoAtivo(cl)) semPlano += 1;
      continue;
    }

    const jaTem = transacoes.some(
      (t) => tipoCobranca(t) === "mensalidade" && ehDoCliente(t, cl) && (t.dueDate ?? "").slice(0, 7) === cicloMes,
    );
    if (jaTem) continue;

    // O dia é do CLIENTE (com herança do plano legado para assinantes antigos).
    const dia = String(diaVencimentoCliente(cl, plano)).padStart(2, "0");
    const venc = `${cicloMes}-${dia}`;

    novas.push({
      data: isoParaDiaMes(venc),
      clienteNome: cl.nome,
      clienteId: cl.id,
      servico: plano.nome,
      barbeiroNome: "",
      valor: plano.valor,
      status: "pendente",
      forma: "pix",
      type: "mensalidade",
      planId: plano.id,
      dueDate: venc,
      amount: plano.valor,
      source: "manual",
    });
  }

  return { novas, semPlano };
}

/** Qualquer coisa que não seja "pago" é dívida aberta — inclusive o "atrasado" legado. */
function emAberto(t: Transacao): boolean {
  return t.status !== "pago" && !t.paidAt;
}

/**
 * Sai o aviso de renovação para esta cobrança hoje?
 *
 * A janela é EXATA (`dueDate === hoje + diasAntes`), não "faltam até N dias": o ciclo roda
 * todo dia, e um "até" faria a mesma pessoa receber a mesma mensagem três dias seguidos.
 * `alertaEnviadoEm` cobre o resto — reprocessar o mesmo dia não remanda nada.
 */
export function deveAlertar(t: Transacao, hojeISO: string, diasAntes: number = PADRAO_DIAS_ANTES_ALERTA): boolean {
  if (!emAberto(t)) return false;
  if (t.alertaEnviadoEm) return false;
  if (tipoCobranca(t) !== "mensalidade") return false;
  if (!t.dueDate) return false;
  return t.dueDate === addDias(hojeISO, Math.max(0, Math.round(diasAntes)));
}

/**
 * Sai boleto para esta cobrança hoje?
 *
 * Chegou o dia do vencimento e não entrou dinheiro. Usa `<=` e não `===` de propósito: se o
 * disparo ficou fora do ar no dia exato, quem venceu ontem ainda precisa ser cobrado — e a
 * presença de `boleto` garante que ninguém receba dois.
 */
export function deveEmitirBoleto(t: Transacao, hojeISO: string): boolean {
  if (!emAberto(t)) return false;
  if (t.boleto) return false;
  if (tipoCobranca(t) !== "mensalidade") return false;
  if (!t.dueDate) return false;
  return t.dueDate <= hojeISO;
}

/** Vencimento do BOLETO: alguns dias de folga a partir de hoje, para dar tempo de pagar. */
export function vencimentoBoleto(
  hojeISO: string,
  dias: number = PADRAO_DIAS_VENCIMENTO_BOLETO,
): string {
  return addDias(hojeISO, Math.max(1, Math.round(dias) || PADRAO_DIAS_VENCIMENTO_BOLETO));
}

/**
 * Empacota tenant + transação na referência que vai para o gateway e volta no webhook.
 * Sem isso o webhook receberia um pagamento sem saber de qual barbearia ele é — mesmo
 * truque de `montarCodigo` em `lib/confirmacao.ts`.
 */
const SEP_REF = ".";

export function montarReferencia(tenantId: string, transacaoId: string): string {
  return `${tenantId}${SEP_REF}${transacaoId}`;
}

export function lerReferencia(ref: string): { tenantId: string; transacaoId: string } | null {
  const partes = String(ref ?? "").split(SEP_REF);
  if (partes.length !== 2) return null;
  const [tenantId, transacaoId] = partes;
  if (!tenantId || !transacaoId) return null;
  // Ids do Firestore são alfanuméricos — recusa qualquer outra coisa antes de tocar no banco.
  if (!/^[A-Za-z0-9_-]+$/.test(tenantId) || !/^[A-Za-z0-9_-]+$/.test(transacaoId)) return null;
  return { tenantId, transacaoId };
}
