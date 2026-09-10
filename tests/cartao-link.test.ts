import { describe, expect, it } from "vitest";
import { lerCodigoCartao, linkCartao, montarCodigoCartao, novoToken } from "@/lib/cartao-link";

// A página /cartao/[codigo] é PÚBLICA e o código dela vira caminho de doc no Firestore.
// O que chega ali não é confiável: um id com "../" dentro não pode encostar no banco.

describe("código do cartão", () => {
  it("vai e volta", () => {
    const codigo = montarCodigoCartao({ tenantId: "tenantA", clienteId: "cli9", token: "abc123" });
    expect(codigo).toBe("tenantA.cli9.abc123");
    expect(lerCodigoCartao(codigo)).toEqual({ tenantId: "tenantA", clienteId: "cli9", token: "abc123" });
  });

  it("vai e volta com token de verdade", () => {
    const token = novoToken();
    const lido = lerCodigoCartao(montarCodigoCartao({ tenantId: "t", clienteId: "c", token }));
    expect(lido?.token).toBe(token);
  });

  it("recusa o que está fora do formato", () => {
    expect(lerCodigoCartao("")).toBeNull();
    expect(lerCodigoCartao("soUmPedaco")).toBeNull();
    expect(lerCodigoCartao("tenant.cliente")).toBeNull();
    expect(lerCodigoCartao("a.b.c.d")).toBeNull();
    expect(lerCodigoCartao("tenant..token")).toBeNull();
  });

  it("recusa caminho disfarçado de id", () => {
    expect(lerCodigoCartao("tenant/../outro.cli.tok")).toBeNull();
    expect(lerCodigoCartao("tenant.cli/../../outro.tok")).toBeNull();
  });

  // O token nasce de `novoToken`, que só usa [a-z2-9]. Maiúscula ou símbolo ali significa
  // que alguém montou o código à mão.
  it("recusa token com caractere que o gerador nunca produz", () => {
    expect(lerCodigoCartao("tenant.cli.ABC123")).toBeNull();
    expect(lerCodigoCartao("tenant.cli.tok-en")).toBeNull();
  });
});

describe("linkCartao", () => {
  it("monta a URL normalizando a barra final da origin", () => {
    expect(linkCartao("https://ocartel.app/", "t.c.tok")).toBe("https://ocartel.app/cartao/t.c.tok");
    expect(linkCartao("http://localhost:3000", "t.c.tok")).toBe("http://localhost:3000/cartao/t.c.tok");
  });
});
