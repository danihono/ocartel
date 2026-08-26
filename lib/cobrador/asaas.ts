// Implementação do `Cobrador` sobre a API do Asaas (v3).
//
// A conta é DA BARBEARIA, não do O Cartel: o dinheiro do boleto cai direto na conta dela.
// Por isso a chave é por tenant (`tenants/{id}/private/asaas`) e não uma variável global.
//
// Docs: https://docs.asaas.com — `POST /customers`, `POST /payments`, `GET /payments/{id}/identificationField`

import type {
  BoletoEmitido,
  Cobrador,
  CredenciaisAsaas,
  DadosClienteCobranca,
  PedidoBoleto,
} from "./index";

const BASE = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
} as const;

/** Uma chamada demorada não pode segurar o ciclo inteiro de uma barbearia. */
const TIMEOUT_MS = 15_000;

export class AsaasErro extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
  ) {
    super(`Asaas respondeu ${status}: ${corpo.slice(0, 300)}`);
    this.name = "AsaasErro";
  }
}

export class CobradorAsaas implements Cobrador {
  constructor(private readonly cred: CredenciaisAsaas) {}

  private async chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${BASE[this.cred.ambiente]}${caminho}`, {
      ...init,
      headers: {
        access_token: this.cred.apiKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const texto = await resp.text();
    if (!resp.ok) throw new AsaasErro(resp.status, texto);
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  /**
   * Procura pelo CPF antes de criar. O Asaas aceita cadastrar o mesmo documento duas
   * vezes, e é assim que o painel da barbearia vira um cemitério de clientes duplicados —
   * um por mês, por pessoa.
   */
  async garantirCliente(dados: DadosClienteCobranca): Promise<string> {
    const busca = await this.chamar<{ data?: { id: string }[] }>(
      `/customers?cpfCnpj=${encodeURIComponent(dados.cpf)}&limit=1`,
    );
    const achado = busca.data?.[0]?.id;
    if (achado) return achado;

    const criado = await this.chamar<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify({
        name: dados.nome,
        cpfCnpj: dados.cpf,
        ...(dados.email ? { email: dados.email } : {}),
        ...(dados.telefone ? { mobilePhone: dados.telefone } : {}),
      }),
    });
    return criado.id;
  }

  async emitirBoleto(pedido: PedidoBoleto): Promise<BoletoEmitido> {
    const cobranca = await this.chamar<{
      id: string;
      bankSlipUrl?: string;
      invoiceUrl?: string;
      dueDate?: string;
    }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: pedido.clienteExterno,
        billingType: "BOLETO",
        value: Number(pedido.valor.toFixed(2)),
        dueDate: pedido.vencimentoISO,
        description: pedido.descricao,
        // A âncora do webhook. Sem ela a baixa automática não sabe qual cobrança quitar.
        externalReference: pedido.referencia,
      }),
    });

    return {
      cobrancaId: cobranca.id,
      // `bankSlipUrl` é o PDF do boleto; `invoiceUrl` é a fatura, que também abre o boleto
      // e funciona melhor no celular. Preferimos a que existir.
      url: cobranca.bankSlipUrl ?? cobranca.invoiceUrl ?? "",
      linhaDigitavel: await this.linhaDigitavel(cobranca.id),
      vencimentoISO: cobranca.dueDate ?? pedido.vencimentoISO,
    };
  }

  /**
   * A linha digitável vem numa chamada à parte. Se ela falhar, o boleto JÁ EXISTE e não
   * pode ser perdido — o cliente ainda recebe o link. Por isso o erro é engolido aqui, e
   * só aqui.
   */
  private async linhaDigitavel(cobrancaId: string): Promise<string> {
    try {
      const r = await this.chamar<{ identificationField?: string }>(
        `/payments/${encodeURIComponent(cobrancaId)}/identificationField`,
      );
      return r.identificationField ?? "";
    } catch {
      return "";
    }
  }
}
