import { describe, it, expect } from "vitest";
import { chaveTelefone, clienteIdDoTelefone, contactIdDoTelefone } from "@/lib/telefone";
import { normalizarTelefone, telefoneWhatsApp } from "@/lib/clientes-import";

describe("chaveTelefone", () => {
  it("aceita as formas que o usuário digita", () => {
    for (const entrada of ["(19) 98448-7271", "19984487271", "+55 (19) 98448-7271", "5519984487271"]) {
      expect(chaveTelefone(entrada)).toEqual({ wa: "5519984487271", curto: "19984487271" });
    }
  });

  it("aceita fixo de 10 dígitos", () => {
    expect(chaveTelefone("1938481234")).toEqual({ wa: "551938481234", curto: "1938481234" });
  });

  it("recusa o que não dá número discável", () => {
    for (const lixo of ["", "abc", "98448-7271", "1234567890123456"]) {
      expect(chaveTelefone(lixo)).toBeNull();
    }
  });

  // DDD 55 é Santa Maria/RS. Tirar o "55" da frente por reflexo comeria o DDD.
  it("não confunde DDD 55 com DDI 55", () => {
    expect(chaveTelefone("55991234567")).toEqual({ wa: "5555991234567", curto: "55991234567" });
    expect(chaveTelefone("5532101234")).toEqual({ wa: "555532101234", curto: "5532101234" });
  });

  it("ida e volta: o número com DDI volta igual", () => {
    const chave = chaveTelefone("5555991234567");
    expect(chave).toEqual({ wa: "5555991234567", curto: "55991234567" });
  });
});

describe("ids determinísticos", () => {
  // É o casamento destes dois que impede a mesma pessoa de virar dois cadastros.
  it("saem os dois da mesma chave", () => {
    const chave = chaveTelefone("(19) 98448-7271")!;
    expect(contactIdDoTelefone(chave.wa)).toBe("wa_5519984487271");
    expect(clienteIdDoTelefone(chave.curto)).toBe("tel-19984487271");
  });
});

describe("normalizarTelefone", () => {
  it("deixa só dígitos, sem DDI", () => {
    expect(normalizarTelefone("(11) 99999-0000")).toBe("11999990000");
    expect(normalizarTelefone("11 9 9999 0000 123")).toBe("11999990000");
  });

  // O bug antigo: `.slice(0, 11)` cru cortava "5519984487271" em "55198448727".
  it("tira o DDI em vez de mutilar o número", () => {
    expect(normalizarTelefone("5519984487271")).toBe("19984487271");
    expect(normalizarTelefone("+55 19 98448-7271")).toBe("19984487271");
  });
});

describe("telefoneWhatsApp", () => {
  it("monta o número com DDI", () => {
    expect(telefoneWhatsApp("(19) 98448-7271")).toBe("5519984487271");
    expect(telefoneWhatsApp("1938481234")).toBe("551938481234");
  });

  it("devolve null para o que não é telefone", () => {
    expect(telefoneWhatsApp("")).toBeNull();
    expect(telefoneWhatsApp("98448-7271")).toBeNull();
  });
});
