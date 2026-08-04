import { describe, it, expect } from "vitest";
import {
  novoToken,
  montarCodigo,
  lerCodigo,
  tokenConfere,
  linkConfirmacao,
  linkWhatsApp,
  mensagemWhatsApp,
} from "@/lib/confirmacao";
import { telefoneWhatsApp } from "@/lib/clientes-import";

describe("novoToken", () => {
  it("gera segredos do mesmo tamanho e diferentes entre si", () => {
    const a = novoToken();
    const b = novoToken();
    expect(a).toHaveLength(18);
    expect(a).toMatch(/^[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe("código do link", () => {
  const partes = { tenantId: "Tn4bXpQr9aZk2LmW8vCd", agendamentoId: "Ag7yHs2QpL4nRt9wZxMk", token: "abc23xyz789kmnpqrs" };

  it("vai e volta sem perder nada", () => {
    expect(lerCodigo(montarCodigo(partes))).toEqual(partes);
  });

  it("recusa formato inválido", () => {
    expect(lerCodigo("")).toBeNull();
    expect(lerCodigo("sotenant")).toBeNull();
    expect(lerCodigo("a.b")).toBeNull();
    expect(lerCodigo("a.b.c.d")).toBeNull();
    expect(lerCodigo("a..c")).toBeNull();
  });

  it("recusa caracteres fora do esperado (tentativa de path traversal)", () => {
    expect(lerCodigo("../../etc.Ag7yHs2QpL4nRt9wZxMk.abc23xyz789kmnpqrs")).toBeNull();
    expect(lerCodigo("Tn4bXpQr9aZk2LmW8vCd.Ag7yHs2QpL4nRt9wZxMk.TOKENMAIUSCULO")).toBeNull();
  });
});

describe("tokenConfere", () => {
  it("aceita só o token idêntico", () => {
    expect(tokenConfere("abc123", "abc123")).toBe(true);
    expect(tokenConfere("abc123", "abc124")).toBe(false);
    expect(tokenConfere("abc123", "abc1234")).toBe(false);
    expect(tokenConfere("", "")).toBe(true);
  });
});

describe("telefoneWhatsApp", () => {
  it("põe o 55 na frente de celular e fixo", () => {
    expect(telefoneWhatsApp("(19) 98448-7271")).toBe("5519984487271");
    expect(telefoneWhatsApp("1938481234")).toBe("551938481234");
  });
  it("não duplica o 55 de quem já guardou com ele", () => {
    expect(telefoneWhatsApp("5519984487271")).toBe("5519984487271");
    expect(telefoneWhatsApp("+55 (19) 98448-7271")).toBe("5519984487271");
  });
  it("devolve null quando não dá pra discar", () => {
    expect(telefoneWhatsApp("")).toBeNull();
    expect(telefoneWhatsApp("98448-7271")).toBeNull(); // sem DDD
    expect(telefoneWhatsApp("abc")).toBeNull();
  });
});

describe("mensagem e links", () => {
  const base = {
    cliente: "Daniel Honorato",
    barbearia: "Barbearia Cartel",
    servico: "Cabelo",
    profissional: "Eduardo",
    dateISO: "2026-08-04",
    hora: "09:00",
    link: "https://ocartel.app/c/t.a.tok",
  };

  it("trata o cliente pelo primeiro nome e traz data, serviço e link", () => {
    const msg = mensagemWhatsApp(base);
    expect(msg).toContain("Oi, Daniel!");
    expect(msg).toContain("Barbearia Cartel");
    expect(msg).toContain("Terça, 4 ago às 09:00");
    expect(msg).toContain("Cabelo · com Eduardo");
    expect(msg).toContain(base.link);
    expect(msg).toContain("Confirma pra gente?");
  });

  it("vira lembrete quando já está confirmado", () => {
    const msg = mensagemWhatsApp({ ...base, jaConfirmado: true });
    expect(msg).toContain("lembrar do seu horário");
    expect(msg).not.toContain("Confirma pra gente?");
  });

  it("omite o profissional quando não há", () => {
    expect(mensagemWhatsApp({ ...base, profissional: "" })).toContain("\nCabelo\n");
  });

  it("monta a url do wa.me com a mensagem escapada", () => {
    const url = linkWhatsApp("5519984487271", "Oi, Daniel! Confirma?");
    expect(url.startsWith("https://wa.me/5519984487271?text=")).toBe(true);
    expect(url).toContain("Oi%2C%20Daniel");
  });

  it("monta o link de confirmação sem barra dupla", () => {
    expect(linkConfirmacao("https://ocartel.app/", "t.a.tok")).toBe("https://ocartel.app/c/t.a.tok");
    expect(linkConfirmacao("http://localhost:3000", "t.a.tok")).toBe("http://localhost:3000/c/t.a.tok");
  });
});
