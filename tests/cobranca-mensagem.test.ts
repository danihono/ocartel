import { describe, expect, it } from "vitest";
import {
  mensagemBoleto,
  mensagemCartaoCadastrado,
  mensagemCartaoCobrado,
  mensagemCartaoRecusado,
  mensagemConviteCartao,
  mensagemRenovacao,
} from "@/lib/cobranca-mensagem";

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

// ---- Cartão ----
//
// Uma regra atravessa todas: a mensagem de cartão SEMPRE leva o link de remoção. Debitar
// a conta de alguém todo mês sem uma saída óbvia é o que transforma assinatura em
// contestação no banco.

const LINK = "https://ocartel.app/cartao/t.c.tok";

describe("mensagemRenovacao com convite de cartão", () => {
  it("acrescenta o convite quando o cliente ainda não tem cartão", () => {
    const texto = mensagemRenovacao({ ...BASE, linkCartao: LINK });
    expect(texto).toContain(LINK);
    expect(texto).toContain("deixar no cartão");
  });

  // Regressão: a barbearia que não usa cartão recebe exatamente a mensagem de sempre.
  it("sai idêntica quando não há link", () => {
    const semCampo = mensagemRenovacao(BASE);
    const comUndefined = mensagemRenovacao({ ...BASE, linkCartao: undefined });
    expect(semCampo).toBe(comUndefined);
    expect(semCampo).not.toContain("cartão");
  });
});

describe("mensagemConviteCartao", () => {
  it("diz o plano, o valor e como sair", () => {
    const texto = mensagemConviteCartao({ ...BASE, link: LINK });
    expect(texto).toContain("Mensal C+B");
    expect(texto).toContain("R$ 140");
    expect(texto).toContain(LINK);
    expect(texto).toContain("tirar o cartão quando quiser");
  });
});

describe("mensagemCartaoCadastrado", () => {
  it("confirma bandeira, final e o dia da cobrança", () => {
    const texto = mensagemCartaoCadastrado({
      cliente: BASE.cliente,
      barbearia: BASE.barbearia,
      bandeira: "VISA",
      ultimosDigitos: "4444",
      diaVencimento: 5,
      link: LINK,
    });
    expect(texto).toContain("VISA final 4444");
    expect(texto).toContain("todo dia 5");
    expect(texto).toContain(LINK);
  });
});

describe("mensagemCartaoCobrado", () => {
  it("é recibo: valor, final do cartão e saída", () => {
    const texto = mensagemCartaoCobrado({ ...BASE, ultimosDigitos: "4444", link: LINK });
    expect(texto).toContain("R$ 140");
    expect(texto).toContain("final 4444");
    expect(texto).toContain(LINK);
  });
});

describe("mensagemCartaoRecusado", () => {
  // Não promete boleto: por decisão de produto ele não sai sozinho para quem tem cartão.
  it("explica a recusa e oferece atualizar, sem falar de boleto", () => {
    const texto = mensagemCartaoRecusado({ ...BASE, ultimosDigitos: "4444", link: LINK });
    expect(texto).toContain("não passou");
    expect(texto).toContain("atualizar o cartão");
    expect(texto).toContain(LINK);
    expect(texto.toLowerCase()).not.toContain("boleto");
  });

  it("avisa quando parou de tentar naquele cartão", () => {
    const texto = mensagemCartaoRecusado({ ...BASE, ultimosDigitos: "4444", link: LINK, aposentado: true });
    expect(texto).toContain("paramos de tentar");
    expect(texto).toContain(LINK);
  });
});
