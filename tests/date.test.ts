import { describe, it, expect } from "vitest";
import {
  addDias,
  addMeses,
  diaSemana,
  diasEntre,
  indiceSegDom,
  inicioDaSemana,
  diasDaSemana,
  isoParaDiaMes,
  isoParaLabel,
  mesAnoCurto,
  tempoRelativo,
} from "@/lib/date";

describe("addDias", () => {
  it("soma e subtrai dias atravessando meses", () => {
    expect(addDias("2026-06-23", 1)).toBe("2026-06-24");
    expect(addDias("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDias("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("não vaza timezone (usa UTC internamente)", () => {
    expect(addDias("2026-06-23", 0)).toBe("2026-06-23");
    expect(addDias("2026-06-23", 7)).toBe("2026-06-30");
  });
});

describe("addMeses", () => {
  it("faz clamp no último dia do mês de destino", () => {
    expect(addMeses("2026-01-31", 1)).toBe("2026-02-28"); // fev/2026 não é bissexto
    expect(addMeses("2024-01-31", 1)).toBe("2024-02-29"); // fev/2024 é bissexto
  });
  it("preserva o dia quando cabe", () => {
    expect(addMeses("2026-03-15", 2)).toBe("2026-05-15");
  });
});

describe("diaSemana / indiceSegDom", () => {
  it("diaSemana usa 0=Dom..6=Sáb", () => {
    expect(diaSemana("2026-06-23")).toBe(2); // terça
    expect(diaSemana("2026-06-28")).toBe(0); // domingo
  });
  it("indiceSegDom converte para 0=Seg..6=Dom (alinha com diasAtivos)", () => {
    expect(indiceSegDom("2026-06-22")).toBe(0); // segunda
    expect(indiceSegDom("2026-06-23")).toBe(1); // terça
    expect(indiceSegDom("2026-06-28")).toBe(6); // domingo
  });
});

describe("inicioDaSemana / diasDaSemana", () => {
  it("a semana começa na segunda", () => {
    expect(inicioDaSemana("2026-06-23")).toBe("2026-06-22"); // segunda anterior
    expect(inicioDaSemana("2026-06-28")).toBe("2026-06-22"); // domingo ainda é da mesma semana
  });
  it("diasDaSemana devolve 7 dias, segunda a domingo", () => {
    const dias = diasDaSemana("2026-06-23");
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe("2026-06-22");
    expect(dias[6]).toBe("2026-06-28");
  });
});

describe("diasEntre", () => {
  it("conta dias inteiros (ate - de)", () => {
    expect(diasEntre("2026-06-22", "2026-06-23")).toBe(1);
    expect(diasEntre("2026-06-23", "2026-06-22")).toBe(-1);
    expect(diasEntre("2026-06-23", "2026-06-23")).toBe(0);
  });
});

describe("tempoRelativo", () => {
  const hoje = "2026-06-23";
  it("rótulos relativos", () => {
    expect(tempoRelativo("2026-06-23", hoje)).toBe("hoje");
    expect(tempoRelativo("2026-06-22", hoje)).toBe("ontem");
    expect(tempoRelativo("2026-06-20", hoje)).toBe("há 3 dias");
    expect(tempoRelativo("2026-06-10", hoje)).toBe("há 1 semana");
  });
  it("data futura vira 'hoje' (d<=0)", () => {
    expect(tempoRelativo("2026-06-30", hoje)).toBe("hoje");
  });
});

describe("formatação de labels", () => {
  it("isoParaDiaMes / isoParaLabel / mesAnoCurto", () => {
    expect(isoParaDiaMes("2026-06-23")).toBe("23 jun");
    expect(isoParaLabel("2026-06-23")).toBe("Ter, 23 jun");
    expect(mesAnoCurto("2026-06-23")).toBe("jun/26");
  });
});
