// Cobrador — a porta trocável entre O Cartel e o gateway de pagamento.
//
// TUDO que emite boleto ou cobra cartão passa por aqui. Nada fora desta pasta pode saber COMO a cobrança
// é criada: hoje é o Asaas, amanhã pode ser outro. Trocar significa escrever outro arquivo
// nesta pasta e mudar a fábrica no fim — sem tocar em quem chama.
//
// É o mesmo desenho de `lib/canal` (a porta do WhatsApp), e pela mesma razão: o dia em que
// trocar de provedor não pode ser o dia em que se reescreve o ciclo de cobrança.
//
// Só servidor (Admin SDK). Nunca importe de um componente do cliente.

import { adminDb } from "@/lib/firebase/admin";
import { CobradorAsaas } from "./asaas";

export interface DadosClienteCobranca {
  nome: string;
  /** Só dígitos (11). Já validado por quem chama — o gateway recusa CPF inválido. */
  cpf: string;
  email?: string;
  telefone?: string;
}

export interface PedidoBoleto {
  /** Id do cliente NO GATEWAY, devolvido por `garantirCliente`. */
  clienteExterno: string;
  valor: number;
  /** Vencimento do boleto, ISO "YYYY-MM-DD". */
  vencimentoISO: string;
  descricao: string;
  /** `montarReferencia(tenantId, transacaoId)` — é por ela que o webhook se acha. */
  referencia: string;
}

export interface BoletoEmitido {
  cobrancaId: string;
  url: string;
  linhaDigitavel: string;
  vencimentoISO: string;
}

export interface PedidoLinkCartao {
  /** Id do cliente NO GATEWAY, devolvido por `garantirCliente`. */
  clienteExterno: string;
  valor: number;
  vencimentoISO: string;
  descricao: string;
  /** `montarReferencia(tenantId, transacaoId)` — é por ela que o webhook se acha. */
  referencia: string;
}

export interface LinkCartao {
  cobrancaId: string;
  /**
   * `invoiceUrl` — a página HOSPEDADA do gateway. É LÁ que o cartão é digitado, nunca
   * numa tela nossa: o Asaas não oferece tokenização pelo navegador, então um formulário
   * do O Cartel faria o número do cartão passar pelo nosso servidor e jogaria o produto
   * inteiro dentro do PCI-DSS SAQ-D. Este campo é a fronteira.
   */
  url: string;
  vencimentoISO: string;
}

export interface PedidoCobrancaCartao {
  clienteExterno: string;
  /** Token do cartão salvo. Não é o cartão: é um apelido dele, inútil fora deste cliente. */
  cartaoToken: string;
  valor: number;
  vencimentoISO: string;
  descricao: string;
  referencia: string;
  /** IP registrado no CADASTRO do cartão. O gateway exige `remoteIp` na recobrança. */
  ipRemoto: string;
}

/**
 * Recusa NÃO é erro: é resposta. O emissor negar por falta de limite é informação de
 * negócio, e some se virar exceção junto com "o gateway caiu" — que é a mesma classe de
 * `catch` e exige o oposto (retentar, não desistir).
 */
export type ResultadoCobrancaCartao =
  | { situacao: "aprovada"; cobrancaId: string; bandeira?: string; ultimosDigitos?: string }
  | { situacao: "recusada"; cobrancaId?: string; motivo: string; codigo?: string };

/**
 * Dados de cartão em trânsito, para a tokenização de balcão.
 *
 * ATENÇÃO: este é o ÚNICO tipo do sistema que carrega número de cartão, e ele existe só
 * dentro de uma chamada — nasce no corpo do request e morre quando o gateway responde.
 * Nunca persista, nunca logue, nunca devolva de server action, nunca coloque em mensagem
 * de erro. O que fica guardado é o token que volta de `tokenizarCartao`.
 *
 * A existência deste tipo é o que coloca o O Cartel dentro do PCI-DSS SAQ-D — foi uma
 * decisão de produto (a atendente digita pelo cliente, no balcão), não um acidente. O
 * caminho sem esse ônus é o da página hospedada: `pedirCartao`.
 */
export interface DadosCartaoEmTransito {
  /** Nome impresso no cartão. */
  titular: string;
  /** Só dígitos. */
  numero: string;
  /** "MM". */
  mesValidade: string;
  /** "AAAA". */
  anoValidade: string;
  ccv: string;
}

/**
 * Dados do titular que o gateway exige junto do cartão. Não são persistidos: só o token
 * sobrevive à chamada, e para recobrar o token basta ele.
 */
export interface DadosTitular {
  nome: string;
  email: string;
  /** Só dígitos. */
  cpf: string;
  /** Só dígitos (8). */
  cep: string;
  numeroEndereco: string;
  telefone?: string;
}

export interface PedidoTokenizacao {
  clienteExterno: string;
  cartao: DadosCartaoEmTransito;
  titular: DadosTitular;
  /** IP de quem está digitando — no balcão, o do aparelho da barbearia. */
  ipRemoto: string;
}

export interface CartaoTokenizado {
  token: string;
  /** "VISA", "MASTERCARD". */
  bandeira: string;
  ultimosDigitos: string;
  /**
   * Id do cliente NO GATEWAY dono deste token. Viaja junto porque o token é por cliente:
   * usá-lo com outro `customer` é recusa garantida, e reconstituir o id depois pelo CPF
   * daria certo até o dia em que o CPF do cadastro fosse corrigido.
   */
  clienteExterno: string;
}

/**
 * Tokenizar valida o cartão no emissor, então pode ser recusado — e recusa aqui é
 * resposta, não erro, pela mesma razão de `cobrarNoCartao`: a atendente precisa ler
 * "cartão inválido" na tela, e um gateway fora do ar não pode virar "cartão recusado".
 */
export type ResultadoTokenizacao =
  | { situacao: "aprovada"; cartao: CartaoTokenizado }
  | { situacao: "recusada"; motivo: string; codigo?: string };

/** O que o gateway conhece por uma referência — a base da conciliação. */
export interface CobrancaResumo {
  id: string;
  /** PENDING | CONFIRMED | RECEIVED | REFUNDED | ... */
  status: string;
  billingType: string;
  value: number;
  externalReference?: string;
}

export interface Cobrador {
  /**
   * Id do cliente no gateway, criando-o se ainda não existir. Idempotente por CPF: o
   * mesmo CPF nunca pode virar dois cadastros lá dentro.
   */
  garantirCliente(dados: DadosClienteCobranca): Promise<string>;
  emitirBoleto(pedido: PedidoBoleto): Promise<BoletoEmitido>;

  /**
   * Cria a cobrança de cartão SEM cartão nenhum e devolve a página hospedada do gateway,
   * onde o cliente digita os dados. É assim que o cartão é capturado sem encostar no
   * nosso servidor.
   */
  pedirCartao(pedido: PedidoLinkCartao): Promise<LinkCartao>;

  /**
   * Cobra usando o token salvo, sem ninguém presente. NUNCA lança quando o emissor
   * recusa — devolve `situacao: "recusada"`. Lança só quando o gateway falha, porque aí
   * a cobrança precisa ser retentada, não abandonada.
   */
  cobrarNoCartao(pedido: PedidoCobrancaCartao): Promise<ResultadoCobrancaCartao>;

  /** Lê o token que o gateway expõe depois da aprovação na página hospedada. */
  lerCartaoDaCobranca(cobrancaId: string): Promise<CartaoTokenizado | null>;

  /**
   * Troca dados de cartão por um token, SEM cobrar nada.
   *
   * É o caminho de balcão: a atendente digita o cartão do cliente presente. Diferente de
   * `pedirCartao`, aqui o número passa pelo nosso servidor — é o que exige certificação
   * PCI-DSS SAQ-D e a liberação de checkout transparente na conta do gateway.
   *
   * Não cobra de propósito: cadastrar cartão e cobrar mensalidade são coisas diferentes,
   * e juntá-las faria um cadastro de balcão virar uma cobrança que ninguém pediu. A
   * mensalidade em aberto é debitada pelo ciclo, na hora seguinte.
   */
  tokenizarCartao(pedido: PedidoTokenizacao): Promise<ResultadoTokenizacao>;

  /**
   * O que existe no gateway com esta referência. Substitui o header de idempotência que
   * o Asaas não tem: é como se descobre se um `POST` que deu timeout debitou ou não.
   */
  procurarCobrancas(referencia: string): Promise<CobrancaResumo[]>;
}

/** Credenciais do gateway desta barbearia. Mora em `private/` — nunca em `config/`. */
export interface CredenciaisAsaas {
  apiKey: string;
  ambiente: "sandbox" | "producao";
  /**
   * Token que o Asaas devolve no header `asaas-access-token` de cada webhook. É o que
   * autentica a baixa automática: sem ele, qualquer um que descubra a URL marca cobrança
   * como paga.
   */
  webhookToken?: string;
}

export class CobradorNaoConfigurado extends Error {
  constructor(tenantId: string) {
    super(`Barbearia ${tenantId} não tem gateway de cobrança configurado.`);
    this.name = "CobradorNaoConfigurado";
  }
}

/** Onde ficam as credenciais. `private/**` já é fechado nas regras (firestore.rules). */
export function refCredenciais(tenantId: string) {
  return adminDb.doc(`tenants/${tenantId}/private/asaas`);
}

export async function credenciaisDoTenant(tenantId: string): Promise<CredenciaisAsaas> {
  const snap = await refCredenciais(tenantId).get();
  const d = snap.exists ? snap.data() ?? {} : {};
  const apiKey = String(d.apiKey ?? "");
  if (!apiKey) throw new CobradorNaoConfigurado(tenantId);
  return {
    apiKey,
    // Só é produção quando alguém disse explicitamente que é. O padrão errado aqui cobra
    // gente de verdade durante um teste.
    ambiente: d.ambiente === "producao" ? "producao" : "sandbox",
    webhookToken: d.webhookToken ? String(d.webhookToken) : undefined,
  };
}

/** Devolve o cobrador da barbearia. Lança `CobradorNaoConfigurado` se não houver chave. */
export async function cobradorDoTenant(tenantId: string): Promise<Cobrador> {
  const cred = await credenciaisDoTenant(tenantId);
  return new CobradorAsaas(cred);
}
