import { describe, expect, it } from "vitest";
import { candidatosSlug, monograma, slugDeReserva } from "@/lib/tenant-util";

describe("monograma", () => {
  it("usa a primeira e a última palavra", () => {
    expect(monograma("Cartel Barbearia")).toBe("CB");
    expect(monograma("  Barbearia  do  Zé ")).toBe("BZ");
  });

  it("uma palavra vira as duas primeiras letras; vazio vira OC", () => {
    expect(monograma("navalha")).toBe("NA");
    expect(monograma("   ")).toBe("OC");
  });
});

describe("candidatosSlug", () => {
  it("tenta o base e depois sufixos do tenantId, em minúsculas", () => {
    expect(candidatosSlug("cartel-barbearia", "AbCdEfGh123")).toEqual([
      "cartel-barbearia",
      "cartel-barbearia-abcd",
      "cartel-barbearia-abcdefgh",
    ]);
  });

  it("cai em 'barbearia' quando o nome não gera slug", () => {
    expect(candidatosSlug("", "XyZw")[0]).toBe("barbearia");
  });
});

describe("slugDeReserva", () => {
  it("deriva do tenantId", () => {
    expect(slugDeReserva("AbCdEfGhIjKlMnOp")).toBe("barbearia-abcdefghijkl");
  });
});
