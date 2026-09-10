// Cartões salvos — o dono único dos dois documentos em que um cartão tokenizado vive.
//
// Só servidor (Admin SDK). Nunca importe de um componente do cliente.
//
// Por que DOIS documentos:
//
//   segredo  tenants/{t}/private/cartoes/clientes/{clienteId}   escreve e lê: só o servidor
//   vitrine  tenants/{t}/cartoes/{clienteId}                    lê: o painel da barbearia
//
// O token não pode estar num doc que o navegador alcança, e a tela precisa mostrar
// "VISA ••4444" sem uma server action por linha. Daí a separação.
//
// A subcoleção sob `private/` não é decoração: a regra é `match /private/{doc}`, de UM
// segmento, então `private/cartoes/clientes/{id}` não casa com regra nenhuma e cai no
// deny padrão do Firestore. Nem a dona da barbearia lê aquele doc pelo navegador — que é
// o nível certo para um instrumento de débito.
//
// E por que NÃO em `Cliente`, apesar do precedente do `asaasId`: o navegador escreve o
// doc de cliente inteiro (a tela faz round-trip do objeto do store), então um campo cujo
// dono é o servidor ali dentro seria apagado na primeira edição de ficha feita com store
// desatualizado. `asaasId` sobrevive a isso porque se reconstitui numa chamada; um token
// de cartão apagado é o cliente saindo da recorrência sem ninguém perceber.

import { adminDb } from "@/lib/firebase/admin";
import { MAX_RECUSAS_CARTAO } from "@/lib/cobranca-ciclo";
import { novoToken } from "@/lib/cartao-link";
import type { CartaoCliente } from "@/lib/types";

/**
 * Doc PRIVADO do cartão. Nunca sai desta pasta, nunca vira retorno de server action,
 * nunca entra em log.
 */
export interface CartaoSalvo {
  provedor: "asaas";
  token: string;
  /** Id do cliente no gateway dono deste token — o token não vale para outro. */
  clienteExterno: string;
  bandeira: string;
  ultimosDigitos: string;
  cadastradoEm: string;
  /** Cobrança em que o cartão foi capturado — auditoria e conciliação. */
  cobrancaId: string;
  /**
   * IP de quem cadastrou. O gateway exige `remoteIp` na recobrança, e o IP certo é o de
   * quem autorizou, não o do servidor. Sem ele o cartão não é cobrável.
   */
  ipCadastro: string;
  /**
   * Prova de consentimento da recorrência: o texto exato que a pessoa aceitou, quando, e
   * de qual navegador. É a defesa num chargeback — e é o que separa isto de cobrança
   * indevida.
   */
  autorizacao: { em: string; texto: string; versao: string; userAgent?: string };
  /** Token do link público deste cliente (`/cartao/[codigo]`). */
  linkToken: string;
}

export function refCartaoPrivado(tenantId: string, clienteId: string) {
  return adminDb.doc(`tenants/${tenantId}/private/cartoes/clientes/${clienteId}`);
}

export function refCartaoVitrine(tenantId: string, clienteId: string) {
  return adminDb.doc(`tenants/${tenantId}/cartoes/${clienteId}`);
}

/** O cartão salvo deste cliente, ou null. */
export async function lerCartao(tenantId: string, clienteId: string): Promise<CartaoSalvo | null> {
  const snap = await refCartaoPrivado(tenantId, clienteId).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  if (!d.token) return null;
  return d as CartaoSalvo;
}

/** A vitrine deste cliente, ou null. Serve para saber se o cartão está aposentado. */
export async function lerCartaoVitrine(tenantId: string, clienteId: string): Promise<CartaoCliente | null> {
  const snap = await refCartaoVitrine(tenantId, clienteId).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as object), clienteId } as CartaoCliente;
}

export interface Autorizacao {
  texto: string;
  versao: string;
  ip: string;
  userAgent?: string;
}

export class SemAutorizacao extends Error {
  constructor(clienteId: string) {
    super(`Cliente ${clienteId} não tem autorização de recorrência registrada.`);
    this.name = "SemAutorizacao";
  }
}

/**
 * Registra o aceite ANTES de mandar o cliente para a página do gateway.
 *
 * Fica pendente porque a ordem real é: a pessoa aceita aqui, paga lá, e o webhook volta
 * depois com o token. Se o aceite fosse gravado só no fim, um cadastro cujo webhook
 * atrasasse salvaria um cartão sem prova de consentimento — e é exatamente essa prova
 * que sustenta a cobrança num chargeback.
 */
export async function registrarAutorizacao(
  tenantId: string,
  clienteId: string,
  a: Autorizacao,
): Promise<void> {
  await refCartaoPrivado(tenantId, clienteId).set(
    {
      autorizacaoPendente: {
        em: new Date().toISOString(),
        texto: a.texto,
        versao: a.versao,
        ...(a.userAgent ? { userAgent: a.userAgent.slice(0, 300) } : {}),
      },
      ipCadastroPendente: a.ip,
    },
    { merge: true },
  );
}

export interface DadosNovoCartao {
  token: string;
  clienteExterno: string;
  bandeira: string;
  ultimosDigitos: string;
  cobrancaId: string;
}

/**
 * Grava o cartão nos dois documentos, num batch: um cartão que exista só na vitrine
 * apareceria na tela e não cobraria, e um que exista só no privado cobraria sem aparecer.
 * As duas metades são a mesma verdade.
 *
 * O consentimento NÃO vem por parâmetro: é lido do aceite que já estava no doc, e sem
 * ele a função se recusa a salvar. Um cartão sem autorização registrada é um cartão que
 * não pode ser cobrado, então é melhor não existir — o cliente pagou aquela fatura e
 * segue a vida, e a recorrência simplesmente não começa.
 */
export async function salvarCartao(tenantId: string, clienteId: string, dados: DadosNovoCartao): Promise<void> {
  const ref = refCartaoPrivado(tenantId, clienteId);
  const atual = (await ref.get()).data() ?? {};
  const autorizacao = atual.autorizacaoPendente as CartaoSalvo["autorizacao"] | undefined;
  const ipCadastro = atual.ipCadastroPendente as string | undefined;
  if (!autorizacao || !ipCadastro) throw new SemAutorizacao(clienteId);

  const agora = new Date().toISOString();
  const batch = adminDb.batch();

  const privado: CartaoSalvo = {
    provedor: "asaas",
    token: dados.token,
    clienteExterno: dados.clienteExterno,
    bandeira: dados.bandeira,
    ultimosDigitos: dados.ultimosDigitos,
    cadastradoEm: agora,
    cobrancaId: dados.cobrancaId,
    ipCadastro,
    autorizacao,
    linkToken: String(atual.linkToken ?? novoToken()),
  };
  batch.set(refCartaoPrivado(tenantId, clienteId), privado);

  const vitrine: Omit<CartaoCliente, "clienteId"> = {
    provedor: "asaas",
    bandeira: dados.bandeira,
    ultimosDigitos: dados.ultimosDigitos,
    cadastradoEm: agora,
    ativo: true,
    falhasSeguidas: 0,
  };
  // `set` sem merge: um cadastro novo zera o histórico de falha e de remoção do cartão
  // anterior. Manter `removidoEm` de um cartão que já não existe faria a tela mostrar
  // "removido" para um cartão ativo.
  batch.set(refCartaoVitrine(tenantId, clienteId), vitrine);

  await batch.commit();
}

/**
 * Tira o cartão de circulação.
 *
 * O doc privado é APAGADO — é onde está o token, e guardar um token que ninguém deve
 * usar é só risco. A vitrine fica, com `ativo: false`: a barbearia precisa saber que
 * havia um cartão e por que ele saiu.
 */
export async function removerCartao(
  tenantId: string,
  clienteId: string,
  motivo: NonNullable<CartaoCliente["motivoRemocao"]>,
): Promise<void> {
  const batch = adminDb.batch();
  batch.delete(refCartaoPrivado(tenantId, clienteId));
  batch.set(
    refCartaoVitrine(tenantId, clienteId),
    { ativo: false, removidoEm: new Date().toISOString(), motivoRemocao: motivo },
    { merge: true },
  );
  await batch.commit();
}

/**
 * Conta uma recusa e, no limite, aposenta o cartão.
 *
 * Devolve se o cartão foi aposentado nesta chamada — é o que muda o texto da mensagem
 * que vai para o cliente ("não passou" vs. "paramos de tentar neste cartão").
 */
export async function registrarFalhaCartao(
  tenantId: string,
  clienteId: string,
  erro: string,
): Promise<{ aposentado: boolean; falhasSeguidas: number }> {
  const ref = refCartaoVitrine(tenantId, clienteId);
  const snap = await ref.get();
  const falhasSeguidas = Number(snap.data()?.falhasSeguidas ?? 0) + 1;

  await ref.set(
    { falhasSeguidas, ultimaFalhaEm: new Date().toISOString(), ultimoErro: erro.slice(0, 300) },
    { merge: true },
  );

  if (falhasSeguidas >= MAX_RECUSAS_CARTAO) {
    await removerCartao(tenantId, clienteId, "recusas");
    return { aposentado: true, falhasSeguidas };
  }
  return { aposentado: false, falhasSeguidas };
}

/**
 * Zera o contador depois de uma cobrança aprovada. Sem isso, duas recusas espalhadas ao
 * longo de um ano somariam com uma terceira e aposentariam um cartão que funciona.
 */
export async function zerarFalhas(tenantId: string, clienteId: string): Promise<void> {
  await refCartaoVitrine(tenantId, clienteId).set({ falhasSeguidas: 0, ultimoErro: "" }, { merge: true });
}

/**
 * O token do link público deste cliente, criando-o se ainda não houver.
 *
 * Mora no doc privado porque é ele que autoriza mexer no cartão. Um cliente que ainda não
 * tem cartão também precisa de link (é como ele cadastra o primeiro), então o doc pode
 * existir só com o token — `lerCartao` devolve null enquanto não houver `token` de cartão.
 */
export async function garantirLinkToken(tenantId: string, clienteId: string): Promise<string> {
  const ref = refCartaoPrivado(tenantId, clienteId);
  const snap = await ref.get();
  const atual = snap.data()?.linkToken;
  if (atual) return String(atual);

  const linkToken = novoToken();
  await ref.set({ linkToken }, { merge: true });
  return linkToken;
}
