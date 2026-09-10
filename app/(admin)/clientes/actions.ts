"use server";

// Server actions do cartão na ficha do cliente.
//
// As duas existem porque o token do link e o token do cartão moram em
// `tenants/{t}/private/cartoes/clientes/{id}`, que o navegador não alcança — nem sendo o
// dono da barbearia. É de propósito: é o doc que guarda um instrumento de débito.
//
// A tela precisa de duas coisas dali: o LINK para mandar ao cliente, e o poder de tirar o
// cartão de circulação. Nada além disso sobe — nunca o token.

import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { garantirLinkToken, removerCartao } from "@/lib/cobrador/cartoes";
import { linkCartao, montarCodigoCartao } from "@/lib/cartao-link";

export interface ResultadoLink extends Resultado {
  link?: string;
}

/**
 * O link de cartão deste cliente, criando o token na primeira vez.
 *
 * A `origin` vem da tela porque só o navegador sabe em que host a barbearia está — o
 * mesmo motivo pelo qual `AgendamentoPanel` passa `window.location.origin` ao montar o
 * link de confirmação.
 */
export async function acaoLinkCartao(
  idToken: string,
  tenantId: string,
  clienteId: string,
  origin: string,
): Promise<ResultadoLink> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    const token = await garantirLinkToken(tenantId, clienteId);
    return { ok: true, link: linkCartao(origin, montarCodigoCartao({ tenantId, clienteId, token })) };
  } catch (err) {
    return comoResultado(err);
  }
}

/**
 * A barbearia tira o cartão do cliente.
 *
 * Existe porque nem toda saída parte do cliente: ele liga pedindo, ou a dona percebe que
 * o cartão é de outra pessoa. Fica registrado como `motivoRemocao: "barbearia"`, separado
 * de quando o próprio cliente remove — em qualquer conversa sobre cobrança, quem tirou o
 * cartão importa.
 */
export async function acaoRemoverCartao(
  idToken: string,
  tenantId: string,
  clienteId: string,
): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    await removerCartao(tenantId, clienteId, "barbearia");
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}
