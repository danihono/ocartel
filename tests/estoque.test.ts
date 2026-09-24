import { describe, expect, it } from "vitest";
import {
  contagensSolicitacao,
  dataDeReferencia,
  gastoDoMes,
  selectSolicitacoes,
  urgentesPendentes,
} from "@/lib/estoque";
import type { SolicitacaoProduto } from "@/lib/types";

function sol(p: Partial<SolicitacaoProduto> & { id: string; produto: string }): SolicitacaoProduto {
  return {
    quantidade: 1,
    urgencia: "normal",
    solicitadoPor: "Dona",
    solicitadoEm: "2026-06-10",
    status: "pendente",
    ...p,
  };
}

const LISTA: SolicitacaoProduto[] = [
  sol({ id: "s1", produto: "Pomada", urgencia: "urgente" }),
  sol({ id: "s2", produto: "Shampoo", solicitadoEm: "2026-04-02" }), // falta velha, nunca comprada
  sol({ id: "s3", produto: "Lâmina", status: "comprado", compradoEm: "2026-06-12", custo: 80 }),
  sol({ id: "s4", produto: "Toalha", status: "comprado", compradoEm: "2026-05-20", custo: 200 }),
  sol({ id: "s5", produto: "Cera", status: "cancelado", canceladoEm: "2026-06-15" }),
];

describe("selectSolicitacoes", () => {
  it("pendente de mês passado continua aparecendo — uma falta não expira", () => {
    const r = selectSolicitacoes(LISTA, "Pendentes", "2026-06");
    expect(r.map((s) => s.id)).toEqual(["s1", "s2"]); // urgente primeiro
  });

  it("compradas respeitam o mês da compra", () => {
    expect(selectSolicitacoes(LISTA, "Compradas", "2026-06").map((s) => s.id)).toEqual(["s3"]);
    expect(selectSolicitacoes(LISTA, "Compradas", "2026-05").map((s) => s.id)).toEqual(["s4"]);
  });

  it("'Todas' é do mês, não de todos os tempos", () => {
    expect(selectSolicitacoes(LISTA, "Todas", "2026-06").map((s) => s.id).sort()).toEqual(["s1", "s3", "s5"]);
  });

  it("busca casa produto e observação", () => {
    expect(selectSolicitacoes(LISTA, "Todas", "2026-06", "pomada").map((s) => s.id)).toEqual(["s1"]);
    const comObs = [sol({ id: "s9", produto: "Óleo", observacoes: "marca azul" })];
    expect(selectSolicitacoes(comObs, "Pendentes", "2026-06", "azul")).toHaveLength(1);
  });

  it("urgente vem antes do normal entre os pendentes", () => {
    const lista = [sol({ id: "n", produto: "Normal", solicitadoEm: "2026-06-20" }), sol({ id: "u", produto: "Urgente", urgencia: "urgente", solicitadoEm: "2026-06-01" })];
    expect(selectSolicitacoes(lista, "Pendentes", "2026-06").map((s) => s.id)).toEqual(["u", "n"]);
  });
});

describe("contagensSolicitacao", () => {
  it("conta pendentes de todos os tempos e o resto pelo mês", () => {
    expect(contagensSolicitacao(LISTA, "2026-06")).toEqual({ Pendentes: 2, Compradas: 1, Canceladas: 1, Todas: 3 });
  });
});

describe("dataDeReferencia", () => {
  it("usa a data da compra quando já comprado", () => {
    expect(dataDeReferencia(LISTA[2])).toBe("2026-06-12");
  });

  it("cai na data do pedido quando ainda não comprado", () => {
    expect(dataDeReferencia(LISTA[0])).toBe("2026-06-10");
  });
});

describe("urgentesPendentes / gastoDoMes", () => {
  it("só conta urgente que ainda não foi comprado", () => {
    const comprada = sol({ id: "x", produto: "X", urgencia: "urgente", status: "comprado", compradoEm: "2026-06-01" });
    expect(urgentesPendentes([...LISTA, comprada]).map((s) => s.id)).toEqual(["s1"]);
  });

  it("soma o custo do que foi comprado no mês", () => {
    expect(gastoDoMes(LISTA, "2026-06")).toBe(80);
    expect(gastoDoMes(LISTA, "2026-05")).toBe(200);
  });

  it("compra sem custo informado não quebra a soma", () => {
    expect(gastoDoMes([sol({ id: "y", produto: "Y", status: "comprado", compradoEm: "2026-06-03" })], "2026-06")).toBe(0);
  });
});
