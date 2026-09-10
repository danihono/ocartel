import { afterEach, describe, expect, it, vi } from "vitest";
import { AsaasErro, CobradorAsaas } from "@/lib/cobrador/asaas";

// O corpo que sai para o gateway é a parte que nenhum teste de UI cobre e que, errada,
// falha em silêncio: um `externalReference` faltando não quebra a emissão — só faz o
// webhook nunca achar a cobrança, e o boleto pago fica pendente para sempre.

type Chamada = { url: string; init?: RequestInit };

function stubFetch(rotas: Record<string, unknown>): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const chave = Object.keys(rotas).find((k) => url.includes(k));
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(chave ? rotas[chave] : {}),
    } as Response;
  });
  return chamadas;
}

/** Stub de UMA resposta com status e corpo escolhidos — para os caminhos de erro. */
function stubResposta(status: number, corpo: unknown): Chamada[] {
  const chamadas: Chamada[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
    } as Response;
  });
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

const CRED = { apiKey: "$aact_teste", ambiente: "sandbox" as const };

describe("CobradorAsaas.garantirCliente", () => {
  it("reusa o cadastro existente do CPF em vez de criar outro", async () => {
    const chamadas = stubFetch({ "/customers?cpfCnpj": { data: [{ id: "cus_ja_existe" }] } });
    const id = await new CobradorAsaas(CRED).garantirCliente({ nome: "Rui", cpf: "52998224725" });

    expect(id).toBe("cus_ja_existe");
    // Um POST aqui significaria um cliente novo por mês, por pessoa, no painel da barbearia.
    expect(chamadas.filter((c) => c.init?.method === "POST")).toHaveLength(0);
  });

  it("cria quando o CPF ainda não está lá", async () => {
    const chamadas = stubFetch({ "/customers?cpfCnpj": { data: [] }, "/customers": { id: "cus_novo" } });
    const id = await new CobradorAsaas(CRED).garantirCliente({
      nome: "Rui Alves",
      cpf: "52998224725",
      email: "rui@exemplo.com",
    });

    expect(id).toBe("cus_novo");
    const post = chamadas.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toMatchObject({
      name: "Rui Alves",
      cpfCnpj: "52998224725",
      email: "rui@exemplo.com",
    });
  });
});

describe("CobradorAsaas.emitirBoleto", () => {
  it("manda boleto, vencimento e a referência que o webhook usa para achar a cobrança", async () => {
    const chamadas = stubFetch({
      "/identificationField": { identificationField: "34191.79001 01043.510047" },
      "/payments": { id: "pay_1", bankSlipUrl: "https://asaas/b/1", dueDate: "2026-08-29" },
    });

    const boleto = await new CobradorAsaas(CRED).emitirBoleto({
      clienteExterno: "cus_1",
      valor: 140,
      vencimentoISO: "2026-08-29",
      descricao: "Mensal C+B · Barbearia Teste",
      referencia: "barbeariaTeste.tx9",
    });

    const post = chamadas.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({
      customer: "cus_1",
      billingType: "BOLETO",
      value: 140,
      dueDate: "2026-08-29",
      description: "Mensal C+B · Barbearia Teste",
      externalReference: "barbeariaTeste.tx9",
    });
    expect(boleto).toEqual({
      cobrancaId: "pay_1",
      url: "https://asaas/b/1",
      linhaDigitavel: "34191.79001 01043.510047",
      vencimentoISO: "2026-08-29",
    });
  });

  // O boleto JÁ EXISTE quando a linha digitável falha. Perdê-lo por causa disso faria a
  // próxima rodada emitir um segundo boleto para a mesma pessoa.
  it("não perde o boleto se a linha digitável falhar", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("/identificationField")) return { ok: false, status: 500, text: async () => "erro" } as Response;
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "pay_2", invoiceUrl: "https://asaas/i/2" }) } as Response;
    });

    const boleto = await new CobradorAsaas(CRED).emitirBoleto({
      clienteExterno: "cus_1",
      valor: 140,
      vencimentoISO: "2026-08-29",
      descricao: "x",
      referencia: "t.tx",
    });

    expect(boleto.cobrancaId).toBe("pay_2");
    expect(boleto.url).toBe("https://asaas/i/2"); // cai na fatura quando não há bankSlipUrl
    expect(boleto.linhaDigitavel).toBe("");
  });

  it("propaga erro do gateway em vez de devolver boleto vazio", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, text: async () => "chave inválida" }) as Response);
    await expect(
      new CobradorAsaas(CRED).emitirBoleto({
        clienteExterno: "cus_1", valor: 140, vencimentoISO: "2026-08-29", descricao: "x", referencia: "t.tx",
      }),
    ).rejects.toThrow(/401/);
  });

  it("usa a base de produção só quando o ambiente é produção", async () => {
    const s = stubFetch({ "/customers": { data: [{ id: "c" }] } });
    await new CobradorAsaas({ ...CRED, ambiente: "producao" }).garantirCliente({ nome: "R", cpf: "52998224725" });
    expect(s[0].url).toContain("https://api.asaas.com/v3");

    vi.unstubAllGlobals();
    const s2 = stubFetch({ "/customers": { data: [{ id: "c" }] } });
    await new CobradorAsaas(CRED).garantirCliente({ nome: "R", cpf: "52998224725" });
    expect(s2[0].url).toContain("https://api-sandbox.asaas.com/v3");
  });
});

// ---- Cartão de crédito ----

const PEDIDO_LINK = {
  clienteExterno: "cus_1",
  valor: 140,
  vencimentoISO: "2026-07-05",
  descricao: "Mensal C+B · O Cartel",
  referencia: "tenantA.tx9",
};

describe("CobradorAsaas.pedirCartao", () => {
  it("cria a cobrança de cartão e devolve a página hospedada do Asaas", async () => {
    const chamadas = stubFetch({ "/payments": { id: "pay_1", invoiceUrl: "https://asaas/i/pay_1", dueDate: "2026-07-05" } });
    const link = await new CobradorAsaas(CRED).pedirCartao(PEDIDO_LINK);

    expect(link).toEqual({ cobrancaId: "pay_1", url: "https://asaas/i/pay_1", vencimentoISO: "2026-07-05" });
    const corpo = JSON.parse(String(chamadas[0].init!.body));
    expect(corpo).toMatchObject({ billingType: "CREDIT_CARD", externalReference: "tenantA.tx9", value: 140 });
  });

  /**
   * A fronteira do PCI, em forma de teste.
   *
   * É a ausência de dados de cartão no corpo que faz o Asaas hospedar o formulário. No
   * dia em que alguém "simplificar" isto mandando o número do cartão daqui, o produto
   * passa a precisar de certificação SAQ-D — e o teste quebra antes do deploy.
   */
  it("não manda dado de cartão nenhum no corpo", async () => {
    const chamadas = stubFetch({ "/payments": { id: "pay_1", invoiceUrl: "https://asaas/i/pay_1" } });
    await new CobradorAsaas(CRED).pedirCartao(PEDIDO_LINK);

    const corpo = JSON.parse(String(chamadas[0].init!.body));
    expect(corpo).not.toHaveProperty("creditCard");
    expect(corpo).not.toHaveProperty("creditCardToken");
    expect(corpo).not.toHaveProperty("creditCardHolderInfo");
  });
});

const PEDIDO_COBRANCA = { ...PEDIDO_LINK, cartaoToken: "tok_abc", ipRemoto: "200.1.2.3" };

describe("CobradorAsaas.cobrarNoCartao", () => {
  it("cobra pelo token, com o IP de quem autorizou, e sem dado de cartão", async () => {
    const chamadas = stubFetch({
      "/payments": { id: "pay_2", creditCard: { creditCardBrand: "VISA", creditCardNumber: "4444" } },
    });
    const r = await new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA);

    expect(r).toEqual({ situacao: "aprovada", cobrancaId: "pay_2", bandeira: "VISA", ultimosDigitos: "4444" });
    const corpo = JSON.parse(String(chamadas[0].init!.body));
    expect(corpo).toMatchObject({
      billingType: "CREDIT_CARD",
      creditCardToken: "tok_abc",
      remoteIp: "200.1.2.3",
      externalReference: "tenantA.tx9",
    });
    // O token substitui o cartão: mandar os dois seria trafegar cartão sem necessidade.
    expect(corpo).not.toHaveProperty("creditCard");
    expect(corpo).not.toHaveProperty("creditCardHolderInfo");
  });

  // Recusa é resposta, não exceção — e o texto do emissor é o que a dona lê na tela.
  it("traduz o 400 do emissor em recusa, sem lançar", async () => {
    stubResposta(400, { errors: [{ code: "invalid_creditCard", description: "Sem limite disponível" }] });
    const r = await new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA);

    expect(r).toEqual({ situacao: "recusada", motivo: "Sem limite disponível", codigo: "invalid_creditCard" });
  });

  it("recusa com motivo legível mesmo quando o corpo do 400 não é JSON", async () => {
    stubResposta(400, "<html>Bad Request</html>");
    const r = await new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA);

    expect(r.situacao).toBe("recusada");
    expect(r.situacao === "recusada" && r.motivo).toBeTruthy();
  });

  /**
   * O caminho que separa "o cliente não tem limite" de "o Asaas caiu". Se um 500 virasse
   * recusa, um incidente do gateway aposentaria o cartão da base inteira em três rodadas
   * — e ninguém seria cobrado no mês.
   */
  it("lança quando o problema é do gateway, não do cartão", async () => {
    stubResposta(500, "Internal Server Error");
    await expect(new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA)).rejects.toBeInstanceOf(AsaasErro);

    stubResposta(401, "Unauthorized");
    await expect(new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA)).rejects.toBeInstanceOf(AsaasErro);
  });

  it("deixa o timeout subir — a cobrança precisa ser conciliada, não descartada", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    });
    await expect(new CobradorAsaas(CRED).cobrarNoCartao(PEDIDO_COBRANCA)).rejects.toThrow();
  });
});

describe("CobradorAsaas.lerCartaoDaCobranca", () => {
  it("extrai token, bandeira e final", async () => {
    stubFetch({
      "/payments/pay_1": {
        creditCard: { creditCardToken: "tok_abc", creditCardBrand: "VISA", creditCardNumber: "4444" },
      },
    });
    const cartao = await new CobradorAsaas(CRED).lerCartaoDaCobranca("pay_1");

    expect(cartao).toEqual({ token: "tok_abc", bandeira: "VISA", ultimosDigitos: "4444" });
  });

  // É o sintoma de tokenização não liberada na conta — e o que faz o ciclo avisar em vez
  // de degradar em silêncio para "cartão cobrado uma vez e nunca mais".
  it("devolve null quando o Asaas não expõe token", async () => {
    stubFetch({ "/payments/pay_1": { billingType: "BOLETO" } });
    expect(await new CobradorAsaas(CRED).lerCartaoDaCobranca("pay_1")).toBeNull();
  });
});

describe("CobradorAsaas.procurarCobrancas", () => {
  it("busca pela referência, com encode", async () => {
    const chamadas = stubFetch({ "/payments?externalReference": { data: [{ id: "pay_1", status: "CONFIRMED" }] } });
    const achadas = await new CobradorAsaas(CRED).procurarCobrancas("tenantA.tx9");

    expect(achadas).toHaveLength(1);
    expect(chamadas[0].url).toContain("externalReference=tenantA.tx9");
  });

  it("devolve lista vazia quando não há nada — e não `undefined`", async () => {
    stubFetch({ "/payments?externalReference": {} });
    expect(await new CobradorAsaas(CRED).procurarCobrancas("tenantA.tx9")).toEqual([]);
  });
});
