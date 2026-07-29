import { describe, expect, it } from "vitest";
import { PRECO_PLANO_SAAS, resumirTenants, snapshotDe, textoEvento, variacao } from "@/lib/saas-metrics";
import type { Tenant, TenantStatus, PlanoSaaS } from "@/lib/types";

const tenant = (status: TenantStatus, plano: PlanoSaaS = "Pro", id = "t"): Tenant => ({
  id,
  nome: `Barbearia ${id}`,
  cidade: "",
  monograma: "BX",
  plano,
  status,
  mrr: "",
  agendamentosMes: "",
});

describe("resumirTenants", () => {
  it("devolve zeros para carteira vazia", () => {
    expect(resumirTenants([])).toEqual({
      total: 0,
      ativas: 0,
      trial: 0,
      atrasadas: 0,
      suspensas: 0,
      mrr: 0,
      mrrEmRisco: 0,
    });
  });

  it("soma o MRR só das barbearias em dia", () => {
    const r = resumirTenants([tenant("ativo", "Pro", "a"), tenant("ativo", "Básico", "b")]);
    expect(r.ativas).toBe(2);
    expect(r.mrr).toBe(PRECO_PLANO_SAAS.Pro + PRECO_PLANO_SAAS["Básico"]);
  });

  it("não conta trial no MRR — trial não paga", () => {
    const r = resumirTenants([tenant("trial", "Pro", "a")]);
    expect(r.trial).toBe(1);
    expect(r.mrr).toBe(0);
  });

  it("não conta suspensa no MRR", () => {
    const r = resumirTenants([tenant("suspenso", "Pro", "a")]);
    expect(r.suspensas).toBe(1);
    expect(r.mrr).toBe(0);
    expect(r.mrrEmRisco).toBe(0);
  });

  it("separa a atrasada em mrrEmRisco em vez de inflar o MRR", () => {
    const r = resumirTenants([tenant("atrasado", "Pro", "a")]);
    expect(r.atrasadas).toBe(1);
    expect(r.mrr).toBe(0);
    expect(r.mrrEmRisco).toBe(PRECO_PLANO_SAAS.Pro);
  });

  it("consolida uma carteira mista", () => {
    const r = resumirTenants([
      tenant("ativo", "Pro", "a"),
      tenant("ativo", "Pro", "b"),
      tenant("trial", "Básico", "c"),
      tenant("atrasado", "Básico", "d"),
      tenant("suspenso", "Pro", "e"),
    ]);
    expect(r).toEqual({
      total: 5,
      ativas: 2,
      trial: 1,
      atrasadas: 1,
      suspensas: 1,
      mrr: PRECO_PLANO_SAAS.Pro * 2,
      mrrEmRisco: PRECO_PLANO_SAAS["Básico"],
    });
  });
});

describe("snapshotDe", () => {
  it("carimba o mês junto do resumo", () => {
    const s = snapshotDe("2026-03", [tenant("ativo", "Pro", "a")]);
    expect(s.mes).toBe("2026-03");
    expect(s.ativas).toBe(1);
    expect(s.mrr).toBe(PRECO_PLANO_SAAS.Pro);
  });
});

describe("variacao", () => {
  const snap = (mes: string, ativas: number, mrr: number) => ({
    mes,
    total: ativas,
    ativas,
    trial: 0,
    atrasadas: 0,
    suspensas: 0,
    mrr,
    mrrEmRisco: 0,
  });

  it("não inventa variação sem histórico suficiente", () => {
    expect(variacao([], "ativas")).toBeNull();
    expect(variacao([snap("2026-03", 5, 900)], "ativas")).toBeNull();
  });

  it("compara os dois últimos meses", () => {
    const serie = [snap("2026-01", 3, 500), snap("2026-02", 5, 900)];
    expect(variacao(serie, "ativas")).toBe(2);
    expect(variacao(serie, "mrr")).toBe(400);
  });

  it("devolve negativo quando encolhe", () => {
    expect(variacao([snap("2026-01", 5, 900), snap("2026-02", 4, 700)], "ativas")).toBe(-1);
  });

  it("devolve zero quando fica estável", () => {
    expect(variacao([snap("2026-01", 5, 900), snap("2026-02", 5, 900)], "mrr")).toBe(0);
  });
});

describe("textoEvento", () => {
  it("descreve cada tipo de evento", () => {
    expect(textoEvento({ tipo: "nova", tenantNome: "Cartel" })).toContain("Cartel");
    expect(textoEvento({ tipo: "suspensa", tenantNome: "Cartel" })).toContain("suspensa");
    expect(textoEvento({ tipo: "reativada", tenantNome: "Cartel" })).toContain("reativada");
  });

  it("inclui o detalhe da troca de plano quando existe", () => {
    expect(textoEvento({ tipo: "plano", tenantNome: "Cartel", detalhe: "Básico → Pro" })).toContain("Básico → Pro");
  });

  it("não deixa separador solto quando não há detalhe", () => {
    expect(textoEvento({ tipo: "plano", tenantNome: "Cartel" })).not.toContain("·");
  });
});
