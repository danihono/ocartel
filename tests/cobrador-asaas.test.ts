import { afterEach, describe, expect, it, vi } from "vitest";
import { CobradorAsaas } from "@/lib/cobrador/asaas";

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
