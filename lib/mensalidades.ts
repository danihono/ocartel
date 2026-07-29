// Geração das mensalidades de um ciclo (mês) a partir dos clientes assinantes.
//
// Vivia dentro da tela de Pagamentos, onde só rodava quando alguém clicava no
// botão. Agora mora aqui, puro e sem dependência de React/Firebase, para ser
// compartilhado entre o botão e o job mensal — e para ser testável.

import { isoParaDiaMes } from "./date";
import { clientePossuiPlanoAtivo, ehDoCliente, tipoCobranca } from "./selectors";
import type { Cliente, Plano, Transacao } from "./types";

/** "YYYY-MM" */
export const CICLO_RE = /^\d{4}-\d{2}$/;

/**
 * Id determinístico da mensalidade. É aqui que mora a idempotência: dois
 * disparos no mesmo ciclo (clique duplo, job repetido, job correndo junto com o
 * clique) escrevem no MESMO doc em vez de criarem cobranças duplicadas.
 */
export function idMensalidade(clienteId: string, cicloMes: string): string {
  return `mens-${clienteId}-${cicloMes}`;
}

/** Ciclo ("YYYY-MM") a que uma data ISO pertence. */
export function cicloDe(iso: string): string {
  return iso.slice(0, 7);
}

export interface EntradaCiclo {
  clientes: Cliente[];
  planos: Plano[];
  transacoes: Transacao[];
  /** "YYYY-MM" */
  cicloMes: string;
}

export interface ResultadoCiclo {
  novas: Transacao[];
  /** Clientes marcados como assinantes que não têm plano cadastrado equivalente. */
  semPlano: number;
}

/**
 * Plano vigente do cliente: por `planId` (vínculo real) ou, para os cadastros
 * antigos, casando o rótulo `plano` pelo nome. Plano inativo não cobra.
 */
function planoDoCliente(cliente: Cliente, planos: Plano[]): Plano | null {
  const p = cliente.planId
    ? planos.find((pl) => pl.id === cliente.planId)
    : planos.find((pl) => pl.nome === cliente.plano);
  return p && (p.ativo ?? true) ? p : null;
}

/** Vencimento do ciclo, limitado a 1..28 para existir em todo mês (fevereiro inclusive). */
export function vencimentoDoCiclo(cicloMes: string, diaVencimento?: number): string {
  const dia = String(Math.min(28, Math.max(1, diaVencimento ?? 5))).padStart(2, "0");
  return `${cicloMes}-${dia}`;
}

/**
 * Monta as mensalidades que ainda FALTAM no ciclo. Não escreve nada — quem
 * chama decide como gravar (batch no cliente, Admin SDK no job).
 */
export function montarMensalidadesDoCiclo({ clientes, planos, transacoes, cicloMes }: EntradaCiclo): ResultadoCiclo {
  if (!CICLO_RE.test(cicloMes)) return { novas: [], semPlano: 0 };

  const novas: Transacao[] = [];
  let semPlano = 0;

  for (const cliente of clientes) {
    const plano = planoDoCliente(cliente, planos);
    if (!plano) {
      // Rotulado como assinante, mas sem plano cadastrado: não dá para cobrar.
      // Vira aviso para o admin em vez de silêncio.
      if (clientePossuiPlanoAtivo(cliente)) semPlano += 1;
      continue;
    }

    // Já existe cobrança de mensalidade deste cliente no ciclo? Vale para as
    // criadas à mão também (que têm id aleatório), por isso a checagem é por
    // vencimento e não por id.
    const jaTem = transacoes.some(
      (t) => tipoCobranca(t) === "mensalidade" && ehDoCliente(t, cliente) && cicloDe(t.dueDate ?? "") === cicloMes,
    );
    if (jaTem) continue;

    const venc = vencimentoDoCiclo(cicloMes, plano.diaVencimento);
    novas.push({
      id: idMensalidade(cliente.id, cicloMes),
      data: isoParaDiaMes(venc),
      clienteNome: cliente.nome,
      clienteId: cliente.id,
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
