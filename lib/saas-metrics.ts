// Métricas do SaaS (console do superAdmin), derivadas dos tenants reais.
//
// Puro de propósito: roda tanto no cliente (tela /super-admin) quanto no job
// mensal, que grava o retrato do mês em saasMetrics/{YYYY-MM}.

import type { PlanoSaaS, Tenant } from "./types";

/** Preço de tabela da assinatura do O Cartel, por plano. */
export const PRECO_PLANO_SAAS: Record<PlanoSaaS, number> = {
  "Básico": 129,
  Pro: 249,
};

export interface ResumoSaaS {
  total: number;
  ativas: number;
  trial: number;
  atrasadas: number;
  suspensas: number;
  /** Receita recorrente das barbearias em dia. */
  mrr: number;
  /** Receita contratada mas com pagamento atrasado — ainda não perdida, já em risco. */
  mrrEmRisco: number;
}

export function precoDoTenant(t: Pick<Tenant, "plano">): number {
  return PRECO_PLANO_SAAS[t.plano] ?? 0;
}

/**
 * Consolida a carteira. Trial e suspensa não entram no MRR (não pagam);
 * atrasada entra separada, em `mrrEmRisco` — é receita contratada que ainda
 * pode ser recuperada, e somá-la ao MRR inflaria o número.
 */
export function resumirTenants(tenants: Tenant[]): ResumoSaaS {
  const r: ResumoSaaS = { total: tenants.length, ativas: 0, trial: 0, atrasadas: 0, suspensas: 0, mrr: 0, mrrEmRisco: 0 };

  for (const t of tenants) {
    switch (t.status) {
      case "ativo":
        r.ativas += 1;
        r.mrr += precoDoTenant(t);
        break;
      case "trial":
        r.trial += 1;
        break;
      case "atrasado":
        r.atrasadas += 1;
        r.mrrEmRisco += precoDoTenant(t);
        break;
      case "suspenso":
        r.suspensas += 1;
        break;
    }
  }

  return r;
}

/** Retrato mensal gravado pelo job — a série histórica do gráfico do console. */
export interface SnapshotSaaS extends ResumoSaaS {
  /** "YYYY-MM" — também é o id do doc. */
  mes: string;
}

export function snapshotDe(mes: string, tenants: Tenant[]): SnapshotSaaS {
  return { mes, ...resumirTenants(tenants) };
}
