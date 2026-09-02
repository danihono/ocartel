// Telefone: uma normalização só, para o sistema inteiro.
//
// Antes havia duas, e elas não conversavam: `normalizarTelefone` guardava 11 dígitos
// SEM o 55 (é o `telefoneNorm` do cliente) e `telefoneWhatsApp` montava 13 dígitos COM o
// 55 (é o que o WhatsApp usa). Como os ids determinísticos do sistema saem do telefone —
// `wa_<digits>` para o contato espelhado e `tel-<digits>` para o cliente — as duas formas
// geravam DOIS ids para a mesma pessoa, e a conta do cliente aparecia duplicada.
//
// Pior: o `normalizarTelefone` fazia `.slice(0, 11)` cru. Um número guardado como
// "5519984487271" virava "55198448727" — que não é telefone de ninguém, e não casa com
// nada.
//
// Aqui a âncora é o número em formato WhatsApp, e `chaveTelefone` devolve as duas formas
// derivadas dele de uma vez. Quem precisa de uma delas pega a que precisa; ninguém mais
// fatia string de telefone na mão.

/** As duas formas do mesmo número. */
export interface ChaveTelefone {
  /** 55 + DDD + número (12 ou 13 dígitos) — a forma do WhatsApp e do id `wa_<wa>`. */
  wa: string;
  /** DDD + número (10 ou 11 dígitos) — a forma de `telefoneNorm` e do id `tel-<curto>`. */
  curto: string;
}

/**
 * Normaliza qualquer entrada (com máscara, com +55, com 55 colado, só dígitos) nas duas
 * formas. Devolve `null` quando não dá para montar um número discável.
 *
 * O DDI só é removido quando o resto sobra com tamanho de telefone brasileiro — senão um
 * número de DDD 55 (Santa Maria/RS) perderia o próprio DDD.
 */
export function chaveTelefone(v: string): ChaveTelefone | null {
  const d = String(v ?? "").replace(/\D/g, "");
  const curto = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  if (curto.length !== 10 && curto.length !== 11) return null;
  return { wa: `55${curto}`, curto };
}

/** Id determinístico do contato no espelho do WhatsApp (o mesmo que o daemon usa). */
export function contactIdDoTelefone(wa: string): string {
  return `wa_${wa}`;
}

/** Id determinístico do cliente criado a partir de um telefone (o mesmo do booking). */
export function clienteIdDoTelefone(curto: string): string {
  return `tel-${curto}`;
}
