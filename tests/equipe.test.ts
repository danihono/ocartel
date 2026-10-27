import { describe, it, expect } from "vitest";
import { conflitoAcessoBarbeiro, emailValido, mensagemAcessoBarbeiro, normalizaEmail } from "@/lib/equipe";

describe("e-mail do barbeiro", () => {
  it("normaliza e valida", () => {
    expect(normalizaEmail("  Everton@Cartel.DEV ")).toBe("everton@cartel.dev");
    expect(emailValido("everton@cartel.dev")).toBe(true);
    expect(emailValido("everton@")).toBe(false);
    expect(emailValido("")).toBe(false);
  });
});

describe("conflitoAcessoBarbeiro", () => {
  it("e-mail novo passa", () => {
    expect(conflitoAcessoBarbeiro(null, "t1", "b1")).toBeNull();
  });
  it("mesmo barbeiro da mesma barbearia passa (é o reenviar link)", () => {
    expect(conflitoAcessoBarbeiro({ role: "barbeiro", tenantId: "t1", barbeiroId: "b1" }, "t1", "b1")).toBeNull();
  });
  it("nunca rebaixa a dona nem um super admin", () => {
    expect(conflitoAcessoBarbeiro({ role: "admin", tenantId: "t1" }, "t1", "b1")).toMatch(/administra/);
    expect(conflitoAcessoBarbeiro({ role: "superAdmin" }, "t1", "b1")).toMatch(/super admin/);
  });
  it("recusa e-mail de outra barbearia ou de outro barbeiro", () => {
    expect(conflitoAcessoBarbeiro({ role: "barbeiro", tenantId: "t2", barbeiroId: "b9" }, "t1", "b1")).toMatch(/outra barbearia/);
    expect(conflitoAcessoBarbeiro({ role: "barbeiro", tenantId: "t1", barbeiroId: "b2" }, "t1", "b1")).toMatch(/outro barbeiro/);
  });
});

describe("mensagemAcessoBarbeiro", () => {
  it("leva o link e o e-mail de login", () => {
    const m = mensagemAcessoBarbeiro({ barbeiro: "Everton Silva", barbearia: "Cartel", email: "e@x.com", link: "https://l" });
    expect(m).toContain("Oi, Everton!");
    expect(m).toContain("https://l");
    expect(m).toContain("e@x.com");
  });
});
