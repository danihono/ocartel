import { describe, expect, it } from "vitest";
import {
  lerCodigoCartao,
  linkCartao,
  montarCodigoCartao,
  novoToken,
  textoAutorizacao,
  textoAutorizacaoBalcao,
  VERSAO_AUTORIZACAO,
} from "@/lib/cartao-link";

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

describe("textoAutorizacao", () => {
  // O mesmo texto vai para a tela E para o registro de consentimento. Se um dia forem
  // dois textos diferentes, a diferença só apareceria num chargeback — que é o pior
  // momento possível para descobrir que o registro não bate com o que a pessoa leu.
  it("nomeia a barbearia, o valor e o dia da cobrança", () => {
    const texto = textoAutorizacao("Barbearia do Rui", "R$ 140", 5);
    expect(texto).toContain("Barbearia do Rui");
    expect(texto).toContain("R$ 140");
    expect(texto).toContain("todo dia 5");
  });

  it("diz como cancelar — é o que sustenta a recorrência", () => {
    expect(textoAutorizacao("X", "R$ 1", 1)).toContain("cancelar a qualquer momento");
  });

  it("tem versão, para o registro dizer QUAL texto foi aceito", () => {
    expect(VERSAO_AUTORIZACAO).toBeTruthy();
  });
});

describe("textoAutorizacaoBalcao", () => {
  /**
   * É texto diferente do do cliente, e essa diferença é o ponto: no balcão quem marca a
   * caixinha não é o titular. Gravar "Autorizo a cobrar MINHA mensalidade" ali seria prova
   * falsa — e é justamente essa prova que a barbearia apresenta numa contestação.
   */
  it("registra que foi a barbearia declarando, não o titular", () => {
    const texto = textoAutorizacaoBalcao("Barbearia do Rui", "R$ 140", 5, "Carla");
    expect(texto).toContain("Carla");
    expect(texto).toContain("balcão");
    expect(texto).toContain("titular do cartão autorizou");
    // Nada de primeira pessoa: quem assina não é o dono do cartão.
    expect(texto).not.toContain("Autorizo a");
    expect(texto).not.toContain("minha mensalidade");
  });

  it("diz valor e dia, como o texto do cliente", () => {
    const texto = textoAutorizacaoBalcao("Barbearia do Rui", "R$ 140", 5, "Carla");
    expect(texto).toContain("R$ 140");
    expect(texto).toContain("todo dia 5");
  });

  it("não deixa a declaração sem autor quando o perfil não tem nome", () => {
    expect(textoAutorizacaoBalcao("X", "R$ 1", 1, "")).toContain("equipe da barbearia");
  });

  it("menciona o direito de cancelar, como o do cliente", () => {
    expect(textoAutorizacaoBalcao("X", "R$ 1", 1, "Carla")).toContain("cancelar");
  });
});
