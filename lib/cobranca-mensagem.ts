// Textos da cobrança automática — núcleo puro (sem Firebase, sem React).
//
// Mesmo tom das mensagens de confirmação (`lib/confirmacao.ts`): primeiro nome, frase curta,
// nada de robô. Quem envia é `lib/canal`; aqui só se decide o QUE dizer.

import { isoParaLabelLongo } from "./date";
import { formatBRL } from "./selectors";

function primeiroNome(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
}

export interface DadosRenovacao {
  cliente: string;
  barbearia: string;
  plano: string;
  valor: number;
  /** ISO "YYYY-MM-DD" — vira "Terça, 4 ago". */
  vencimentoISO: string;
  /**
   * Link para cadastrar o cartão. Só vem quando a barbearia liga a cobrança no cartão E
   * este cliente ainda não tem cartão salvo — é o canal natural de adoção, sem custar
   * uma mensagem a mais. Ausente ⇒ a mensagem sai exatamente como sempre saiu.
   */
  linkCartao?: string;
}

/** Aviso preventivo, alguns dias antes do vencimento. Não cobra: lembra. */
export function mensagemRenovacao(d: DadosRenovacao): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia}.`,
    "",
    `Sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) vence em ${isoParaLabelLongo(d.vencimentoISO)}.`,
    "",
    "Se já pagou, pode ignorar. Qualquer coisa, é só chamar por aqui.",
    ...(d.linkCartao
      ? ["", "Se quiser, dá pra deixar no cartão e não pensar mais nisso:", d.linkCartao]
      : []),
  ].join("\n");
}

export interface DadosBoleto extends DadosRenovacao {
  linkBoleto: string;
  linhaDigitavel: string;
  /** Vencimento do BOLETO (ISO), que é depois do vencimento da mensalidade. */
  vencimentoBoletoISO: string;
}

/**
 * Sai no dia do vencimento, para quem não pagou. Leva o link E a linha digitável: quem
 * está no celular abre o link, quem está no app do banco copia a linha.
 */
export function mensagemBoleto(d: DadosBoleto): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia}.`,
    "",
    `Sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) venceu em ${isoParaLabelLongo(d.vencimentoISO)}.`,
    `Geramos um boleto no seu CPF, com vencimento em ${isoParaLabelLongo(d.vencimentoBoletoISO)}:`,
    d.linkBoleto,
    "",
    "Ou copie a linha digitável:",
    d.linhaDigitavel,
    "",
    "Assim que o pagamento cair, a baixa é automática — não precisa mandar comprovante.",
  ].join("\n");
}

// ---- Cartão de crédito ----
//
// Toda mensagem de cartão carrega o link de remoção. Isso não é gentileza: a barbearia
// está debitando a conta de alguém todo mês, e a saída fácil é a condição para isso ser
// defensável — no bom senso e num chargeback.

export interface DadosConviteCartao {
  cliente: string;
  barbearia: string;
  plano: string;
  valor: number;
  link: string;
}

/** Convite para cadastrar o cartão. Sai por clique-para-conversar, no painel. */
export function mensagemConviteCartao(d: DadosConviteCartao): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia}.`,
    "",
    `Dá pra deixar sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) no cartão e não`,
    "precisar pagar boleto todo mês. O cadastro leva um minuto:",
    d.link,
    "",
    "A cobrança é sempre no mesmo dia, e você pode tirar o cartão quando quiser por esse",
    "mesmo link.",
  ].join("\n");
}

export interface DadosCartaoCadastrado {
  cliente: string;
  barbearia: string;
  bandeira: string;
  ultimosDigitos: string;
  /** Dia do mês em que a mensalidade dele vence. */
  diaVencimento: number;
  link: string;
}

/** Confirmação de que o cartão ficou salvo. Sai quando o webhook captura o token. */
export function mensagemCartaoCadastrado(d: DadosCartaoCadastrado): string {
  return [
    `Prontinho, ${primeiroNome(d.cliente)}! Cartão ${d.bandeira} final ${d.ultimosDigitos} cadastrado.`,
    "",
    `Sua mensalidade na ${d.barbearia} vai ser cobrada nele todo dia ${d.diaVencimento}.`,
    "Você recebe um aviso aqui a cada cobrança, e pode remover o cartão quando quiser:",
    d.link,
  ].join("\n");
}

export interface DadosCartaoCobrado {
  cliente: string;
  barbearia: string;
  plano: string;
  valor: number;
  ultimosDigitos: string;
  link: string;
}

/**
 * Recibo mensal. Parece dispensável e não é: cobrança que aparece na fatura sem ninguém
 * ter avisado é exatamente a que o cliente contesta no banco.
 */
export function mensagemCartaoCobrado(d: DadosCartaoCobrado): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) foi`,
    `paga no cartão final ${d.ultimosDigitos}.`,
    "",
    `Tá tudo certo, não precisa fazer nada. Se quiser trocar ou tirar o cartão:`,
    d.link,
  ].join("\n");
}

export interface DadosCartaoRecusado {
  cliente: string;
  barbearia: string;
  plano: string;
  valor: number;
  ultimosDigitos: string;
  link: string;
  /** Cartão aposentado por recusas seguidas — aí o recado é outro. */
  aposentado?: boolean;
}

/**
 * O cartão não passou. NÃO manda boleto: por decisão de produto, quem tem cartão salvo
 * não recebe boleto automático — a dona decide caso a caso, vendo a recusa no painel.
 * Então aqui o cliente é avisado do que houve e de como arrumar, e ninguém promete um
 * boleto que talvez não venha.
 */
export function mensagemCartaoRecusado(d: DadosCartaoRecusado): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia}.`,
    "",
    `A cobrança da sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) não passou no`,
    `cartão final ${d.ultimosDigitos} — pode ter sido limite ou o cartão ter vencido.`,
    "",
    ...(d.aposentado
      ? [
          "Como não passou algumas vezes, paramos de tentar nesse cartão. Você pode",
          "cadastrar outro por aqui:",
        ]
      : ["Você pode atualizar o cartão por aqui:"]),
    d.link,
    "",
    "Qualquer coisa, é só chamar neste WhatsApp.",
  ].join("\n");
}
