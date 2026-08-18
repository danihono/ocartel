import { describe, expect, it } from "vitest";
import { PAPEL_LABEL, primeiroNome, saudacao, saudacaoCompleta } from "@/lib/pessoa";

describe("primeiroNome", () => {
  it("pega só o primeiro nome", () => {
    expect(primeiroNome("Daniel Honorato")).toBe("Daniel");
    expect(primeiroNome("  Ana  Paula  Souza ")).toBe("Ana");
    expect(primeiroNome("Marina")).toBe("Marina");
  });

  it("tolera vazio/ausente", () => {
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome("   ")).toBe("");
    expect(primeiroNome(null)).toBe("");
    expect(primeiroNome(undefined)).toBe("");
  });
});

describe("saudacao", () => {
  it("muda com a hora do dia", () => {
    expect(saudacao("00:00")).toBe("Bom dia");
    expect(saudacao("08:30")).toBe("Bom dia");
    expect(saudacao("11:59")).toBe("Bom dia");
    expect(saudacao("12:00")).toBe("Boa tarde");
    expect(saudacao("17:59")).toBe("Boa tarde");
    expect(saudacao("18:00")).toBe("Boa noite");
    expect(saudacao("23:59")).toBe("Boa noite");
  });

  it("cai em 'Bom dia' se a hora vier quebrada", () => {
    expect(saudacao("")).toBe("Bom dia");
    expect(saudacao("--:--")).toBe("Bom dia");
  });
});

describe("saudacaoCompleta", () => {
  it("junta saudação e primeiro nome", () => {
    expect(saudacaoCompleta("09:00", "Daniel Honorato")).toBe("Bom dia, Daniel");
    expect(saudacaoCompleta("14:20", "Ana Paula")).toBe("Boa tarde, Ana");
    expect(saudacaoCompleta("21:00", "Daniel")).toBe("Boa noite, Daniel");
  });

  it("sem nome carregado, mostra só a saudação (sem vírgula solta)", () => {
    expect(saudacaoCompleta("09:00", null)).toBe("Bom dia");
    expect(saudacaoCompleta("19:00", "")).toBe("Boa noite");
  });
});

describe("PAPEL_LABEL", () => {
  it("cobre todos os papéis", () => {
    expect(PAPEL_LABEL.admin).toBe("Admin");
    expect(PAPEL_LABEL.superAdmin).toBe("Super admin");
    expect(PAPEL_LABEL.barbeiro).toBe("Barbeiro");
    expect(PAPEL_LABEL.cliente).toBe("Cliente");
  });
});
