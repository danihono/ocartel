"use server";

// Server actions do cartão na ficha do cliente.
//
// As duas existem porque o token do link e o token do cartão moram em
// `tenants/{t}/private/cartoes/clientes/{id}`, que o navegador não alcança — nem sendo o
// dono da barbearia. É de propósito: é o doc que guarda um instrumento de débito.
//
// A tela precisa de duas coisas dali: o LINK para mandar ao cliente, e o poder de tirar o
// cartão de circulação. Nada além disso sobe — nunca o token.

import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { canalDoTenant, WhatsAppNaoConfigurado } from "@/lib/canal";
import { cobradorDoTenant, CobradorNaoConfigurado, type Cobrador } from "@/lib/cobrador";
import { garantirLinkToken, registrarAutorizacao, removerCartao, salvarCartao } from "@/lib/cobrador/cartoes";
import {
  linkCartao,
  montarCodigoCartao,
  textoAutorizacaoBalcao,
  VERSAO_AUTORIZACAO,
} from "@/lib/cartao-link";
import { anoCompleto, soDigitos, validarCamposCartao } from "@/lib/cartao-campos";
import { mensagemCartaoCadastrado } from "@/lib/cobranca-mensagem";
import { normalizarCpf, telefoneWhatsApp, validarCpf } from "@/lib/clientes-import";
import { diaVencimentoCliente, formatBRL, planoDoCliente } from "@/lib/selectors";
import type { Cliente, Plano } from "@/lib/types";

/** Campos que a tela do balcão manda. O número do cartão vive só aqui e na chamada. */
export interface EntradaCartaoBalcao {
  titular: string;
  numero: string;
  mesValidade: string;
  anoValidade: string;
  ccv: string;
  /** CPF do titular; vazio ⇒ usa o do cadastro do cliente. */
  cpfTitular: string;
  cep: string;
  numeroEndereco: string;
  /** A atendente declarou que o titular autorizou. Sem isso, a action recusa. */
  declarouAutorizacao: boolean;
  /** Origem do painel, para montar o link de remoção que vai no WhatsApp do cliente. */
  origin: string;
}

export interface ResultadoCadastroCartao extends Resultado {
  bandeira?: string;
  ultimosDigitos?: string;
  /**
   * Se a confirmação saiu no WhatsApp do cliente. No balcão isso importa: é a única prova
   * do lado DELE, já que a caixinha foi marcada pela atendente.
   */
  avisouCliente?: boolean;
}

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

/**
 * Cadastro de cartão pelo BALCÃO: a atendente digita o cartão do cliente presente.
 *
 * Este é o único ponto do sistema que recebe número de cartão, e existe por decisão de
 * produto — o caminho sem ônus regulatório é o link da página hospedada do Asaas
 * (`/cartao/[codigo]`), que continua funcionando em paralelo.
 *
 * Consequências, para quem vier depois:
 *
 *   - o O Cartel entra no escopo PCI-DSS SAQ-D enquanto esta função existir;
 *   - exige checkout transparente/tokenização liberados na conta Asaas da barbearia;
 *   - nada do cartão pode ser logado, persistido ou devolvido — o retorno carrega no
 *     máximo bandeira e quatro últimos dígitos, que é o que a tela mostra.
 *
 * NÃO cobra nada. Cadastrar cartão e cobrar mensalidade são coisas diferentes: juntá-las
 * faria um cadastro de balcão virar uma cobrança que o cliente não pediu. A mensalidade
 * em aberto é debitada pelo ciclo, na hora seguinte.
 */
export async function acaoCadastrarCartaoNoBalcao(
  idToken: string,
  tenantId: string,
  clienteId: string,
  entrada: EntradaCartaoBalcao,
): Promise<ResultadoCadastroCartao> {
  try {
    const quem = await exigirQuemGerencia(idToken, tenantId);

    const cliente = await lerCliente(tenantId, clienteId);
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    if (!entrada.declarouAutorizacao) {
      return { ok: false, erro: "Confirme que o titular do cartão autorizou a cobrança." };
    }

    const cpf = normalizarCpf(entrada.cpfTitular || cliente.cpf || "");
    if (!validarCpf(cpf)) return { ok: false, erro: "CPF do titular inválido." };

    const cartao = {
      titular: entrada.titular.trim(),
      numero: soDigitos(entrada.numero),
      mesValidade: soDigitos(entrada.mesValidade).padStart(2, "0"),
      anoValidade: anoCompleto(entrada.anoValidade),
      ccv: soDigitos(entrada.ccv),
    };
    const invalido = validarCamposCartao(cartao, hojeISO());
    if (invalido) return { ok: false, erro: invalido };

    const cep = soDigitos(entrada.cep);
    if (cep.length !== 8) return { ok: false, erro: "CEP do titular inválido." };
    if (!entrada.numeroEndereco.trim()) return { ok: false, erro: "Informe o número do endereço do titular." };

    let gateway;
    try {
      gateway = await cobradorDoTenant(tenantId);
    } catch (err) {
      if (err instanceof CobradorNaoConfigurado) {
        return { ok: false, erro: "Cadastre a chave do Asaas em Configurações antes de cadastrar cartão." };
      }
      throw err;
    }

    const asaasId = await garantirClienteNoGateway(gateway, tenantId, cliente, cpf);

    const cabecalhos = await headers();
    const ip = primeiroIp(cabecalhos.get("x-forwarded-for"));

    // O aceite é gravado ANTES da chamada, como no caminho do cliente: `salvarCartao` se
    // recusa a salvar cartão sem consentimento no doc, e essa ordem é o que garante que
    // nenhum token entre no banco sem a declaração correspondente.
    const { valor, diaVencimento, barbearia } = await contextoDaMensalidade(tenantId, cliente);
    await registrarAutorizacao(tenantId, clienteId, {
      texto: textoAutorizacaoBalcao(barbearia, formatBRL(valor), diaVencimento, quem.nome),
      versao: VERSAO_AUTORIZACAO,
      ip,
      userAgent: cabecalhos.get("user-agent") ?? undefined,
      origem: "balcao",
      registradoPor: quem.nome || quem.uid,
    });

    const r = await gateway.tokenizarCartao({
      clienteExterno: asaasId,
      cartao,
      titular: {
        nome: entrada.titular.trim() || cliente.nome,
        email: cliente.email || `${cpf}@sememail.local`,
        cpf,
        cep,
        numeroEndereco: entrada.numeroEndereco.trim(),
        telefone: telefoneWhatsApp(cliente.telefone ?? "") ?? undefined,
      },
      ipRemoto: ip,
    });

    if (r.situacao === "recusada") return { ok: false, erro: r.motivo };

    await salvarCartao(tenantId, clienteId, {
      token: r.cartao.token,
      clienteExterno: r.cartao.clienteExterno,
      bandeira: r.cartao.bandeira,
      ultimosDigitos: r.cartao.ultimosDigitos,
      // Não houve cobrança: o cartão nasceu de uma tokenização, não do pagamento de uma
      // fatura. Fica registrado assim para a conciliação não procurar cobrança que não existe.
      cobrancaId: "",
    });

    // A confirmação no WhatsApp é a prova do lado do CLIENTE — no balcão, quem marcou a
    // caixinha foi a atendente. Sem ela, a única trilha é a declaração de quem digitou.
    const avisou = await avisarCartaoCadastrado({
      tenantId,
      clienteId,
      cliente,
      barbearia,
      diaVencimento,
      bandeira: r.cartao.bandeira,
      ultimosDigitos: r.cartao.ultimosDigitos,
      origin: entrada.origin,
    });

    return {
      ok: true,
      bandeira: r.cartao.bandeira,
      ultimosDigitos: r.cartao.ultimosDigitos,
      avisouCliente: avisou,
    };
  } catch (err) {
    // A exceção NUNCA pode carregar o corpo enviado ao gateway. `comoResultado` só lê
    // `err.message`, e `AsaasErro` guarda a resposta — não o request.
    return comoResultado(err);
  }
}

// ---- Auxiliares (não são actions; um arquivo "use server" só exporta função async) ----

async function lerCliente(tenantId: string, clienteId: string): Promise<Cliente | null> {
  const snap = await adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as object), id: clienteId } as Cliente;
}

/** "YYYY-MM-DD" de hoje — mesma abordagem do booking-core. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Primeiro IP da cadeia: o de quem digitou. O do servidor não serve ao gateway. */
function primeiroIp(cabecalho: string | null): string {
  return (cabecalho ?? "").split(",")[0].trim() || "0.0.0.0";
}

async function garantirClienteNoGateway(
  gateway: Cobrador,
  tenantId: string,
  cliente: Cliente,
  cpf: string,
): Promise<string> {
  if (cliente.asaasId) return cliente.asaasId;
  const asaasId = await gateway.garantirCliente({
    nome: cliente.nome,
    cpf,
    email: cliente.email || undefined,
    telefone: telefoneWhatsApp(cliente.telefone ?? "") ?? undefined,
  });
  await adminDb.doc(`tenants/${tenantId}/clientes/${cliente.id}`).set({ asaasId }, { merge: true });
  return asaasId;
}

/** Valor, dia e nome da barbearia — o que entra no texto da declaração. */
async function contextoDaMensalidade(
  tenantId: string,
  cliente: Cliente,
): Promise<{ valor: number; diaVencimento: number; barbearia: string }> {
  const [configSnap, planosSnap] = await Promise.all([
    adminDb.doc(`tenants/${tenantId}/config/main`).get(),
    adminDb.collection(`tenants/${tenantId}/planos`).get(),
  ]);
  const planos = planosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as Plano);
  const plano = planoDoCliente(planos, cliente);
  return {
    valor: plano?.valor ?? 0,
    diaVencimento: diaVencimentoCliente(cliente, plano),
    barbearia: String(configSnap.data()?.nome ?? ""),
  };
}

/**
 * Confirma ao cliente, pelo WhatsApp, que o cartão dele ficou salvo — com o link para
 * tirar. Devolve se conseguiu.
 *
 * Falha aqui NÃO desfaz o cadastro: o token já está salvo e cobrável. Mas a tela precisa
 * saber, porque no balcão esta mensagem é a única prova do lado do cliente.
 */
async function avisarCartaoCadastrado(p: {
  tenantId: string;
  clienteId: string;
  cliente: Cliente;
  barbearia: string;
  diaVencimento: number;
  bandeira: string;
  ultimosDigitos: string;
  origin: string;
}): Promise<boolean> {
  try {
    const telefone = telefoneWhatsApp(p.cliente.telefone ?? "");
    if (!telefone) return false;

    const token = await garantirLinkToken(p.tenantId, p.clienteId);
    const texto = mensagemCartaoCadastrado({
      cliente: p.cliente.nome,
      barbearia: p.barbearia,
      bandeira: p.bandeira,
      ultimosDigitos: p.ultimosDigitos,
      diaVencimento: p.diaVencimento,
      link: linkCartao(p.origin, montarCodigoCartao({ tenantId: p.tenantId, clienteId: p.clienteId, token })),
    });

    const canal = await canalDoTenant(p.tenantId);
    const r = await canal.enviarMensagem(telefone, texto);
    return r.ok !== false;
  } catch (err) {
    if (err instanceof WhatsAppNaoConfigurado) return false;
    return false;
  }
}
