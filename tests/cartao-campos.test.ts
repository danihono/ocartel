import { describe, expect, it } from "vitest";
import {
  anoCompleto,
  numeroCartaoValido,
  soDigitos,
  validadeExpirada,
  validarCamposCartao,
} from "@/lib/cartao-campos";

// Estes números são os de TESTE publicados pelas bandeiras — não são cartões de ninguém.
const VISA_TESTE = "4111111111111111";
const MASTER_TESTE = "5555555555554444";

describe("numeroCartaoValido", () => {
  it("aceita número com Luhn correto", () => {
    expect(numeroCartaoValido(VISA_TESTE)).toBe(true);
    expect(numeroCartaoValido(MASTER_TESTE)).toBe(true);
  });

  it("aceita o que a atendente digitou com espaço ou traço", () => {
    expect(numeroCartaoValido("4111 1111 1111 1111")).toBe(true);
    expect(numeroCartaoValido("4111-1111-1111-1111")).toBe(true);
  });

  // O ponto do Luhn: é isso que ele pega, e é o erro mais comum de quem digita ouvindo.
  it("recusa um dígito trocado", () => {
    expect(numeroCartaoValido("4111111111111112")).toBe(false);
  });

  it("recusa dígitos vizinhos invertidos", () => {
    expect(numeroCartaoValido("5555555555544454")).toBe(false);
  });

  it("recusa tamanho fora do possível", () => {
    expect(numeroCartaoValido("")).toBe(false);
    expect(numeroCartaoValido("411111111111")).toBe(false);
    expect(numeroCartaoValido("4111111111111111111111")).toBe(false);
  });
});

describe("anoCompleto", () => {
  it("entende os dois formatos impressos no cartão", () => {
    expect(anoCompleto("26")).toBe("2026");
    expect(anoCompleto("2026")).toBe("2026");
  });
});

describe("validadeExpirada", () => {
  /**
   * O cartão vale até o ÚLTIMO dia do mês impresso. Tratar 09/2026 como vencido em 1º de
   * setembro recusaria cartão bom por um mês inteiro — e a atendente não teria como saber
   * que o problema é nosso.
   */
  it("não vence no primeiro dia do mês impresso", () => {
    expect(validadeExpirada("09", "2026", "2026-09-01")).toBe(false);
    expect(validadeExpirada("09", "2026", "2026-09-30")).toBe(false);
  });

  it("vence no mês seguinte", () => {
    expect(validadeExpirada("09", "2026", "2026-10-01")).toBe(true);
  });

  it("pega ano passado", () => {
    expect(validadeExpirada("12", "2025", "2026-09-24")).toBe(true);
  });

  it("aceita validade futura", () => {
    expect(validadeExpirada("01", "2030", "2026-09-24")).toBe(false);
  });

  // Formato ruim é erro de formato, tratado em `validarCamposCartao`; aqui não é "vencido".
  it("não chama formato inválido de vencido", () => {
    expect(validadeExpirada("13", "2026", "2026-09-24")).toBe(false);
    expect(validadeExpirada("", "", "2026-09-24")).toBe(false);
  });
});

describe("validarCamposCartao", () => {
  const bom = { titular: "Rui Alves", numero: VISA_TESTE, mesValidade: "12", anoValidade: "2030", ccv: "123" };
  const hoje = "2026-09-24";

  it("passa com tudo em ordem", () => {
    expect(validarCamposCartao(bom, hoje)).toBeNull();
  });

  // Uma mensagem por vez, na ordem em que a pessoa digitou: cinco erros de uma vez no
  // balcão, com o cliente esperando, faz a atendente desistir.
  it("reclama do titular antes de tudo", () => {
    const r = validarCamposCartao({ ...bom, titular: "  ", numero: "123", ccv: "1" }, hoje);
    expect(r).toContain("nome impresso");
  });

  it("acusa número, mês, ano, validade e CCV", () => {
    expect(validarCamposCartao({ ...bom, numero: "4111111111111112" }, hoje)).toContain("Número");
    expect(validarCamposCartao({ ...bom, mesValidade: "13" }, hoje)).toContain("Mês");
    expect(validarCamposCartao({ ...bom, anoValidade: "2" }, hoje)).toContain("Ano");
    expect(validarCamposCartao({ ...bom, mesValidade: "01", anoValidade: "2020" }, hoje)).toContain("vencido");
    expect(validarCamposCartao({ ...bom, ccv: "12" }, hoje)).toContain("segurança");
    expect(validarCamposCartao({ ...bom, ccv: "12345" }, hoje)).toContain("segurança");
  });

  it("aceita CCV de 4 dígitos (Amex)", () => {
    expect(validarCamposCartao({ ...bom, ccv: "1234" }, hoje)).toBeNull();
  });
});

describe("soDigitos", () => {
  it("limpa a digitação", () => {
    expect(soDigitos("4111 1111-1111.1111")).toBe("4111111111111111");
    expect(soDigitos("")).toBe("");
  });
});
