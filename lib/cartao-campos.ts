// Validação dos campos de cartão digitados no balcão — núcleo puro.
//
// Existe para pegar erro de digitação ANTES de mandar ao gateway. Não é segurança: é
// diagnóstico. Um dígito trocado devolve 400 genérico do Asaas ("cartão não aceito"), e a
// atendente fica conferindo cartão bom achando que o cliente é que tem problema.
//
// NADA aqui guarda, loga ou devolve o número do cartão — as funções recebem e respondem
// com veredito, nunca com o dado.

/** Só os dígitos. Aceita o que a atendente digitar com espaço, ponto ou traço. */
export function soDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Luhn — a soma de verificação que toda bandeira usa.
 *
 * Pega quase todo erro de digitação de um dígito e quase toda troca de dígitos vizinhos,
 * que são exatamente os erros de quem digita cartão lendo em voz alta no balcão.
 */
export function numeroCartaoValido(numero: string): boolean {
  const d = soDigitos(numero);
  if (d.length < 13 || d.length > 19) return false;

  let soma = 0;
  let dobra = false;
  for (let i = d.length - 1; i >= 0; i -= 1) {
    let n = d.charCodeAt(i) - 48;
    if (dobra) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

/** "26" e "2026" viram 2026. Cartão traz os dois formatos impressos. */
export function anoCompleto(ano: string): string {
  const d = soDigitos(ano);
  if (d.length === 4) return d;
  if (d.length === 2) return `20${d}`;
  return d;
}

/**
 * O cartão vence no ÚLTIMO dia do mês impresso — um cartão 09/2026 ainda funciona em 30
 * de setembro de 2026. Tratar como vencido no dia 1º recusaria cartão bom por um mês.
 */
export function validadeExpirada(mes: string, ano: string, hojeISO: string): boolean {
  const m = Number(soDigitos(mes));
  const a = Number(anoCompleto(ano));
  if (!m || m < 1 || m > 12 || !a) return false; // formato inválido é outro erro, não este
  const [anoHoje, mesHoje] = hojeISO.split("-").map(Number);
  if (!anoHoje || !mesHoje) return false;
  return a < anoHoje || (a === anoHoje && m < mesHoje);
}

export interface CamposCartao {
  titular: string;
  numero: string;
  mesValidade: string;
  anoValidade: string;
  ccv: string;
}

/**
 * Devolve a primeira mensagem de erro, ou `null` se está tudo em ordem.
 *
 * Uma mensagem por vez, e na ordem em que a pessoa digitou: um formulário que acusa cinco
 * erros de uma vez no balcão, com o cliente esperando, faz a atendente desistir.
 */
export function validarCamposCartao(c: CamposCartao, hojeISO: string): string | null {
  if (!c.titular.trim()) return "Informe o nome impresso no cartão.";
  if (!numeroCartaoValido(c.numero)) return "Número do cartão inválido — confira os dígitos.";

  const mes = Number(soDigitos(c.mesValidade));
  if (!mes || mes < 1 || mes > 12) return "Mês de validade inválido.";
  if (anoCompleto(c.anoValidade).length !== 4) return "Ano de validade inválido.";
  if (validadeExpirada(c.mesValidade, c.anoValidade, hojeISO)) return "Este cartão está vencido.";

  const ccv = soDigitos(c.ccv);
  if (ccv.length < 3 || ccv.length > 4) return "Código de segurança inválido (3 ou 4 dígitos).";

  return null;
}
