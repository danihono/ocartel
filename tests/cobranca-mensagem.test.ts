import { describe, expect, it } from "vitest";
import { mensagemBoleto, mensagemRenovacao } from "@/lib/cobranca-mensagem";

const BASE = {
  cliente: "Rui Alves Pereira",
  barbearia: "O Cartel",
  plano: "Mensal C+B",
  valor: 140,
  vencimentoISO: "2026-07-05",
};

describe("mensagemRenovacao", () => {
  it("chama pelo primeiro nome e diz plano, valor e data", () => {
    const m = mensagemRenovacao(BASE);
    expect(m).toContain("Oi, Rui!");
    expect(m).toContain("O Cartel");
    expect(m).toContain("Mensal C+B");
    expect(m).toContain("R$ 140");
    expect(m).toContain("Domingo, 5 jul");
  });

  // É lembrete, não cobrança: quem já pagou por fora não pode se sentir cobrado.
  it("dá saída para quem já pagou", () => {
    expect(mensagemRenovacao(BASE)).toContain("Se já pagou, pode ignorar");
  });

  it("não quebra com nome vazio", () => {
    expect(() => mensagemRenovacao({ ...BASE, cliente: "" })).not.toThrow();
  });
});

describe("mensagemBoleto", () => {
  const dados = {
    ...BASE,
    linkBoleto: "https://sandbox.asaas.com/i/abc123",
    linhaDigitavel: "34191.79001 01043.510047 91020.150008 1 90260000014000",
    vencimentoBoletoISO: "2026-07-08",
  };

  it("leva o link E a linha digitável", () => {
    const m = mensagemBoleto(dados);
    expect(m).toContain(dados.linkBoleto);
    expect(m).toContain(dados.linhaDigitavel);
  });

  // As duas datas são diferentes e não podem ser confundidas: a mensalidade venceu ontem,
  // o boleto vence daqui a três dias.
  it("distingue o vencimento da mensalidade do vencimento do boleto", () => {
    const m = mensagemBoleto(dados);
    expect(m).toContain("venceu em Domingo, 5 jul");
    expect(m).toContain("vencimento em Quarta, 8 jul");
  });

  it("avisa que a baixa é automática — ninguém precisa mandar comprovante", () => {
    expect(mensagemBoleto(dados)).toContain("baixa é automática");
  });
});
