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
}

/** Aviso preventivo, alguns dias antes do vencimento. Não cobra: lembra. */
export function mensagemRenovacao(d: DadosRenovacao): string {
  return [
    `Oi, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia}.`,
    "",
    `Sua mensalidade do ${d.plano} (${formatBRL(d.valor)}) vence em ${isoParaLabelLongo(d.vencimentoISO)}.`,
    "",
    "Se já pagou, pode ignorar. Qualquer coisa, é só chamar por aqui.",
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
