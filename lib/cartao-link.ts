// Link do cartão — núcleo puro (sem Firebase, sem React).
//
// O cliente recebe um link no WhatsApp, cai em /cartao/[codigo] e ali cadastra, vê ou
// remove o cartão que paga a mensalidade dele. Mesmo desenho de `lib/confirmacao.ts`:
// o código carrega o caminho do doc, e o token é o que autoriza.
//
// Uma diferença que importa: este código é POR CLIENTE, não por cobrança. Cadastrar
// cartão não é um evento com data — é uma relação que continua valendo mês que vem, e o
// mesmo link tem que servir para tirar o cartão depois. Um link por mensalidade viraria
// um cliente com doze links, onze deles mortos.

export { novoToken, tokenConfere } from "./confirmacao";

const SEP = ".";

export interface CodigoCartao {
  tenantId: string;
  clienteId: string;
  token: string;
}

/** Empacota tenant + cliente + token num único segmento de URL. */
export function montarCodigoCartao({ tenantId, clienteId, token }: CodigoCartao): string {
  return [tenantId, clienteId, token].join(SEP);
}

/** Inverso de `montarCodigoCartao`. Devolve null para qualquer coisa fora do formato. */
export function lerCodigoCartao(codigo: string): CodigoCartao | null {
  const partes = (codigo ?? "").split(SEP);
  if (partes.length !== 3) return null;
  const [tenantId, clienteId, token] = partes;
  if (!tenantId || !clienteId || !token) return null;
  // Ids do Firestore e o token são alfanuméricos — recusa qualquer outra coisa antes
  // mesmo de tocar no banco.
  if (!/^[A-Za-z0-9_-]+$/.test(tenantId) || !/^[A-Za-z0-9_-]+$/.test(clienteId)) return null;
  if (!/^[a-z0-9]+$/.test(token)) return null;
  return { tenantId, clienteId, token };
}

export function linkCartao(origin: string, codigo: string): string {
  return `${origin.replace(/\/+$/, "")}/cartao/${codigo}`;
}
