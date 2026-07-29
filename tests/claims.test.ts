import { describe, expect, it } from "vitest";
import { claimsDesatualizados, claimsDoPerfil, ehRole } from "@/lib/claims";

describe("ehRole", () => {
  it("aceita os papéis do domínio", () => {
    expect(ehRole("admin")).toBe(true);
    expect(ehRole("barbeiro")).toBe(true);
    expect(ehRole("superAdmin")).toBe(true);
  });

  it("rejeita papel inventado, vazio e não-string", () => {
    expect(ehRole("dono")).toBe(false);
    expect(ehRole("")).toBe(false);
    expect(ehRole(undefined)).toBe(false);
    expect(ehRole(42)).toBe(false);
  });
});

describe("claimsDoPerfil", () => {
  it("espelha papel, tenant e vínculo do barbeiro", () => {
    expect(claimsDoPerfil({ role: "barbeiro", tenantId: "t1", barbeiroId: "b7" })).toEqual({
      role: "barbeiro",
      tenantId: "t1",
      barbeiroId: "b7",
    });
  });

  it("omite barbeiroId quando não há vínculo", () => {
    const claims = claimsDoPerfil({ role: "admin", tenantId: "t1" });
    expect(claims).toEqual({ role: "admin", tenantId: "t1" });
    expect(claims && "barbeiroId" in claims).toBe(false);
  });

  it("omite barbeiroId vazio em vez de gravar string vazia", () => {
    expect(claimsDoPerfil({ role: "admin", tenantId: "t1", barbeiroId: "" })).toEqual({
      role: "admin",
      tenantId: "t1",
    });
  });

  it("normaliza tenantId ausente para string vazia (superAdmin não tem barbearia)", () => {
    expect(claimsDoPerfil({ role: "superAdmin" })).toEqual({ role: "superAdmin", tenantId: "" });
  });

  it("recusa perfil sem papel reconhecido — melhor claim nenhum que papel inventado", () => {
    expect(claimsDoPerfil({ role: "dono", tenantId: "t1" })).toBeNull();
    expect(claimsDoPerfil({ tenantId: "t1" })).toBeNull();
    expect(claimsDoPerfil(null)).toBeNull();
    expect(claimsDoPerfil(undefined)).toBeNull();
  });
});

describe("claimsDesatualizados", () => {
  const alvo = { role: "barbeiro" as const, tenantId: "t1", barbeiroId: "b7" };

  it("considera desatualizado quando não há token", () => {
    expect(claimsDesatualizados(null, alvo)).toBe(true);
    expect(claimsDesatualizados(undefined, alvo)).toBe(true);
  });

  it("considera em dia quando os três campos batem", () => {
    expect(claimsDesatualizados({ role: "barbeiro", tenantId: "t1", barbeiroId: "b7" }, alvo)).toBe(false);
  });

  it("ignora campos extras do token (iss, aud, exp…)", () => {
    const token = { role: "barbeiro", tenantId: "t1", barbeiroId: "b7", iss: "x", exp: 123 };
    expect(claimsDesatualizados(token, alvo)).toBe(false);
  });

  it("detecta promoção de papel", () => {
    expect(claimsDesatualizados({ role: "barbeiro", tenantId: "t1" }, { role: "admin", tenantId: "t1" })).toBe(true);
  });

  it("detecta troca de barbearia", () => {
    expect(claimsDesatualizados({ role: "admin", tenantId: "t1" }, { role: "admin", tenantId: "t2" })).toBe(true);
  });

  it("detecta vínculo de barbeiro que mudou ou sumiu", () => {
    expect(claimsDesatualizados({ role: "barbeiro", tenantId: "t1", barbeiroId: "b1" }, alvo)).toBe(true);
    expect(claimsDesatualizados({ role: "barbeiro", tenantId: "t1" }, alvo)).toBe(true);
  });

  it("trata barbeiroId ausente e vazio como equivalentes", () => {
    const semVinculo = { role: "admin" as const, tenantId: "t1" };
    expect(claimsDesatualizados({ role: "admin", tenantId: "t1" }, semVinculo)).toBe(false);
    expect(claimsDesatualizados({ role: "admin", tenantId: "t1", barbeiroId: "" }, semVinculo)).toBe(false);
  });
});
