"use server";

// Dados de um período para a tela de Relatórios, lidos no servidor.
//
// O navegador só guarda uma janela recente da agenda e das cobranças; um relatório do ano
// calculado dali sairia incompleto. Aqui vêm o período pedido E o anterior (a base da
// comparação), e o cálculo em si continua no navegador (lib/relatorios.ts).

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { serializar } from "@/lib/serializar";
import { duracaoDias, periodoAnterior } from "@/lib/relatorios";
import type { Agendamento, Transacao } from "@/lib/types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Teto do período: um ano e pouco. Com a comparação, lê até ~2 anos de dados. */
const MAX_DIAS = 400;

export async function acaoDadosRelatorio(
  idToken: string,
  tenantId: string,
  inicio: string,
  fim: string,
): Promise<Resultado & { agendamentos?: Agendamento[]; transacoes?: Transacao[]; novosClientes?: { atual: number; anterior: number } }> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    if (!ISO.test(inicio) || !ISO.test(fim) || inicio > fim) return { ok: false, erro: "Período inválido." };
    if (duracaoDias({ inicio, fim }) > MAX_DIAS) return { ok: false, erro: `Escolha um período de até ${MAX_DIAS} dias.` };

    const ant = periodoAnterior({ inicio, fim });
    const t = adminDb.doc(`tenants/${tenantId}`);
    const linhas = <T,>(snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.map((d) => ({ ...(serializar(d.data()) as object), id: d.id }) as T);

    // Datas da agenda e de pagamento são texto ISO; o `` no fim pega "2026-10-27T…".
    const [ags, ts, novos, novosAnt] = await Promise.all([
      t.collection("agendamentos").where("date", ">=", ant.inicio).where("date", "<=", fim).get(),
      t.collection("transacoes").where("paidAt", ">=", ant.inicio).where("paidAt", "<=", `${fim}`).get(),
      contarClientes(t, inicio, fim),
      contarClientes(t, ant.inicio, ant.fim),
    ]);

    return {
      ok: true,
      agendamentos: linhas<Agendamento>(ags),
      transacoes: linhas<Transacao>(ts),
      novosClientes: { atual: novos, anterior: novosAnt },
    };
  } catch (err) {
    return comoResultado(err);
  }
}

/** Clientes cadastrados entre dois dias (pelo `createdAt`; cadastros antigos sem ele não contam). */
async function contarClientes(t: FirebaseFirestore.DocumentReference, de: string, ate: string): Promise<number> {
  const ini = Timestamp.fromDate(new Date(`${de}T00:00:00-03:00`));
  const fimDia = Timestamp.fromDate(new Date(`${ate}T23:59:59.999-03:00`));
  const snap = await t.collection("clientes").where("createdAt", ">=", ini).where("createdAt", "<=", fimDia).count().get();
  return snap.data().count;
}
