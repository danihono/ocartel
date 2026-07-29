// Job mensal de cobrança: gera as mensalidades do ciclo em TODAS as barbearias
// e grava o retrato do mês para o console do superAdmin.
//
// Antes disso, a mensalidade só existia se alguém abrisse /pagamentos e
// clicasse no botão — ou seja, a cobrança recorrente dependia de alguém lembrar.
//
// Acionado pelo Cloud Scheduler, diariamente. Rodar todo dia é seguro: cada
// plano tem seu próprio dia de vencimento (1..28) e a geração é idempotente
// (id determinístico, ver lib/mensalidades.ts), então repetir não duplica nada.
//
//   curl -X POST https://<host>/api/cron/mensalidades \
//        -H "Authorization: Bearer $CRON_SECRET"

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { cicloDe, montarMensalidadesDoCiclo } from "@/lib/mensalidades";
import { hojeISONoFuso } from "@/lib/date";
import { snapshotDe } from "@/lib/saas-metrics";
import type { Cliente, Plano, Tenant, Transacao } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Comparação em tempo constante — evita distinguir segredos pelo tempo de resposta. */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function autorizado(req: Request): boolean {
  const esperado = process.env.CRON_SECRET ?? "";
  // Sem segredo configurado o endpoint fica FECHADO. Um job que não roda é um
  // problema visível; um endpoint de escrita aberto ao mundo, não.
  if (!esperado) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return !!token && segredoConfere(token, esperado);
}

interface ResumoTenant {
  tenantId: string;
  nome: string;
  geradas: number;
  semPlano: number;
  erro?: string;
}

async function gerarParaTenant(tenantId: string, nome: string, ciclo: string): Promise<ResumoTenant> {
  const tenantRef = adminDb.collection("tenants").doc(tenantId);

  const [clientesSnap, planosSnap, transacoesSnap] = await Promise.all([
    tenantRef.collection("clientes").get(),
    tenantRef.collection("planos").get(),
    // Só o ciclo corrente: é o bastante para a deduplicação e evita varrer todo
    // o histórico financeiro da barbearia a cada execução.
    tenantRef
      .collection("transacoes")
      .where("dueDate", ">=", `${ciclo}-01`)
      .where("dueDate", "<=", `${ciclo}-31`)
      .get(),
  ]);

  const comId = <T,>(s: FirebaseFirestore.QuerySnapshot) =>
    s.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];

  const { novas, semPlano } = montarMensalidadesDoCiclo({
    clientes: comId<Cliente>(clientesSnap),
    planos: comId<Plano>(planosSnap),
    transacoes: comId<Transacao>(transacoesSnap),
    cicloMes: ciclo,
  });

  let geradas = 0;
  for (const t of novas) {
    const { id, ...dados } = t;
    try {
      // `create` (e não `set`) de propósito: se o doc já existir — porque o
      // admin clicou no botão no mesmo instante — falha em vez de sobrescrever
      // uma cobrança que pode já ter sido paga.
      await tenantRef.collection("transacoes").doc(id).create({ ...dados, createdAt: new Date(), source: "cron" });
      geradas += 1;
    } catch {
      /* já existe — nada a fazer */
    }
  }

  return { tenantId, nome, geradas, semPlano };
}

async function executar(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const hoje = hojeISONoFuso();
  const ciclo = cicloDe(hoje);

  const tenantsSnap = await adminDb.collection("tenants").get();
  const tenants = tenantsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Tenant[];

  const resultados: ResumoTenant[] = [];
  for (const t of tenants) {
    // Barbearia suspensa não gera cobrança nova enquanto está fora do ar.
    if (t.status === "suspenso" || !t.id) continue;
    try {
      resultados.push(await gerarParaTenant(t.id, t.nome, ciclo));
    } catch (e) {
      resultados.push({ tenantId: t.id, nome: t.nome, geradas: 0, semPlano: 0, erro: String(e) });
    }
  }

  // Retrato do mês para o console do superAdmin. Reescrito a cada execução, de
  // modo que o doc do mês corrente sempre reflete o estado mais recente.
  const snapshot = snapshotDe(ciclo, tenants);
  await adminDb
    .collection("saasMetrics")
    .doc(ciclo)
    .set({ ...snapshot, atualizadoEm: new Date() });

  const geradas = resultados.reduce((acc, r) => acc + r.geradas, 0);
  return NextResponse.json({
    ciclo,
    barbearias: resultados.length,
    geradas,
    falhas: resultados.filter((r) => r.erro).length,
    detalhes: resultados,
  });
}

export async function POST(req: Request) {
  return executar(req);
}

// O Cloud Scheduler também dispara por GET — aceitar os dois evita um job que
// falha calado por causa do verbo escolhido no console.
export async function GET(req: Request) {
  return executar(req);
}
