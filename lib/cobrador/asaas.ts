// Implementação do `Cobrador` sobre a API do Asaas (v3).
//
// A conta é DA BARBEARIA, não do O Cartel: o dinheiro do boleto cai direto na conta dela.
// Por isso a chave é por tenant (`tenants/{id}/private/asaas`) e não uma variável global.
//
// Docs: https://docs.asaas.com — `POST /customers`, `POST /payments`,
// `GET /payments/{id}`, `GET /payments/{id}/identificationField`, `GET /payments`
//
// O cartão nunca é digitado aqui. `pedirCartao` cria a cobrança e devolve a página do
// próprio Asaas; a partir dela o que circula é o `creditCardToken`. Isso é deliberado: o
// Asaas não tem tokenização pelo navegador, e mandar o número do cartão pelo nosso
// servidor exigiria certificação PCI-DSS SAQ-D.

import type {
  BoletoEmitido,
  CartaoTokenizado,
  Cobrador,
  CobrancaResumo,
  CredenciaisAsaas,
  DadosClienteCobranca,
  LinkCartao,
  PedidoBoleto,
  PedidoCobrancaCartao,
  PedidoLinkCartao,
  ResultadoCobrancaCartao,
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

interface ErroAsaas {
  code?: string;
  description?: string;
}

/**
 * O Asaas devolve `{"errors":[{"code","description"}]}` num 400. Vale ler: "Sem limite
 * disponível" é o que a dona precisa ver na tela, e "erro 400 no gateway" não é.
 * O corpo pode não ser JSON (proxy, HTML de erro), então nada aqui pode lançar.
 */
function primeiroErro(corpo: string): ErroAsaas {
  try {
    const json = JSON.parse(corpo) as { errors?: ErroAsaas[] };
    return json.errors?.[0] ?? {};
  } catch {
    return {};
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
   * Cobrança de cartão SEM dados de cartão: o Asaas devolve `invoiceUrl`, a página dele
   * em que o cliente digita o número. Nada de `creditCard` nem `creditCardToken` no
   * corpo — é justamente a ausência deles que faz o Asaas hospedar o formulário, e que
   * mantém o cartão fora do nosso servidor.
   */
  async pedirCartao(pedido: PedidoLinkCartao): Promise<LinkCartao> {
    const cobranca = await this.chamar<{ id: string; invoiceUrl?: string; dueDate?: string }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: pedido.clienteExterno,
        billingType: "CREDIT_CARD",
        value: Number(pedido.valor.toFixed(2)),
        dueDate: pedido.vencimentoISO,
        description: pedido.descricao,
        externalReference: pedido.referencia,
      }),
    });

    return {
      cobrancaId: cobranca.id,
      // Só `invoiceUrl`: numa cobrança de cartão não existe `bankSlipUrl` para servir de
      // reserva, e cair num campo vazio mandaria o cliente para lugar nenhum.
      url: cobranca.invoiceUrl ?? "",
      vencimentoISO: cobranca.dueDate ?? pedido.vencimentoISO,
    };
  }

  /**
   * Debita o cartão salvo, sem ninguém presente.
   *
   * `creditCardHolderInfo` NÃO vai: o titular já foi capturado na tokenização. E o
   * `remoteIp` é o do cadastro, não o do servidor — é o IP de quem autorizou.
   */
  async cobrarNoCartao(pedido: PedidoCobrancaCartao): Promise<ResultadoCobrancaCartao> {
    try {
      const cobranca = await this.chamar<{
        id: string;
        creditCard?: { creditCardBrand?: string; creditCardNumber?: string };
      }>("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: pedido.clienteExterno,
          billingType: "CREDIT_CARD",
          value: Number(pedido.valor.toFixed(2)),
          dueDate: pedido.vencimentoISO,
          description: pedido.descricao,
          externalReference: pedido.referencia,
          creditCardToken: pedido.cartaoToken,
          remoteIp: pedido.ipRemoto,
        }),
      });

      return {
        situacao: "aprovada",
        cobrancaId: cobranca.id,
        bandeira: cobranca.creditCard?.creditCardBrand,
        ultimosDigitos: cobranca.creditCard?.creditCardNumber,
      };
    } catch (err) {
      // 400 é o emissor dizendo não. Qualquer outra coisa (401, 5xx, timeout) é o gateway
      // falhando — e tratar isso como recusa faria um Asaas fora do ar aposentar o cartão
      // da base inteira em três rodadas.
      if (err instanceof AsaasErro && err.status === 400) {
        const { code, description } = primeiroErro(err.corpo);
        return {
          situacao: "recusada",
          motivo: description || "O cartão foi recusado pelo banco emissor.",
          ...(code ? { codigo: code } : {}),
        };
      }
      throw err;
    }
  }

  /**
   * O token do cartão que pagou esta cobrança.
   *
   * Devolve `null` quando não houver — cobrança paga por outro meio, ou tokenização
   * ainda não liberada na conta da barbearia. Erro de rede NÃO é engolido aqui: quem
   * chama precisa saber que falhou para tentar de novo, senão o cliente cadastra o
   * cartão e a recorrência simplesmente nunca começa.
   */
  async lerCartaoDaCobranca(cobrancaId: string): Promise<CartaoTokenizado | null> {
    const r = await this.chamar<{
      customer?: string;
      creditCard?: { creditCardNumber?: string; creditCardBrand?: string; creditCardToken?: string };
    }>(`/payments/${encodeURIComponent(cobrancaId)}`);

    const token = r.creditCard?.creditCardToken;
    if (!token || !r.customer) return null;
    return {
      token,
      bandeira: r.creditCard?.creditCardBrand ?? "Cartão",
      ultimosDigitos: r.creditCard?.creditCardNumber ?? "",
      clienteExterno: r.customer,
    };
  }

  async procurarCobrancas(referencia: string): Promise<CobrancaResumo[]> {
    const r = await this.chamar<{ data?: CobrancaResumo[] }>(
      `/payments?externalReference=${encodeURIComponent(referencia)}&limit=10`,
    );
    return r.data ?? [];
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
