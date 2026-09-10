"use server";

// Server actions da página do cartão. Mesmo padrão da confirmação de presença
// (app/c/[codigo]/actions.ts): rodam no servidor com o Admin SDK, que valida tudo aqui e
// ignora as regras de segurança — assim `clientes` e `transacoes` continuam privadas, sem
// nenhuma leitura pública no Firestore.
//
// O que autoriza é o token do link, comparado contra o gravado no doc privado do cartão.
//
// O QUE ESTA ROTA NÃO FAZ: receber dados de cartão. `iniciarCadastro` devolve a URL da
// página hospedada do Asaas, e é lá que o número é digitado. O Asaas não oferece
// tokenização pelo navegador, então um formulário aqui faria o cartão passar pelo nosso
// servidor e jogaria o O Cartel dentro do PCI-DSS SAQ-D. A fronteira é esta função.

import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase/admin";
import { lerCodigoCartao, textoAutorizacao, tokenConfere, VERSAO_AUTORIZACAO } from "@/lib/cartao-link";
import { cobradorDoTenant, CobradorNaoConfigurado } from "@/lib/cobrador";
import {
  lerCartao,
  lerCartaoVitrine,
  registrarAutorizacao,
  removerCartao,
  refCartaoPrivado,
} from "@/lib/cobrador/cartoes";
import { montarReferencia } from "@/lib/cobranca-ciclo";
import { diaVencimentoCliente, formatBRL, planoDoCliente, tipoCobranca } from "@/lib/selectors";
import type { Cliente, Plano, Transacao } from "@/lib/types";

const LINK_INVALIDO = "Este link não é válido. Confira a mensagem que a barbearia enviou.";
const GENERICO = "Não foi possível carregar seus dados. Tente de novo em instantes.";

export interface CartaoNaTela {
  bandeira: string;
  ultimosDigitos: string;
  cadastradoEm: string;
}

export interface DadosCartao {
  barbearia: string;
  cliente: string;
  plano: string;
  valor: number;
  diaVencimento: number;
  /** O texto exato que a pessoa precisa aceitar antes de cadastrar. */
  textoAutorizacao: string;
  cartao: CartaoNaTela | null;
  /** Mensalidade em aberto — é sobre ela que o cadastro do cartão acontece. */
  mensalidadeAberta: { valor: number; vencimentoISO: string } | null;
}

export interface CartaoResult {
  ok: boolean;
  error?: string;
  dados?: DadosCartao;
  /** Página hospedada do gateway, para o cadastro. */
  url?: string;
}

/** Resolve o código do link até o cliente, já com o token conferido. */
async function resolver(codigo: string) {
  const partes = lerCodigoCartao(codigo);
  if (!partes) return null;

  const snap = await refCartaoPrivado(partes.tenantId, partes.clienteId).get();
  const linkToken = snap.data()?.linkToken;
  if (typeof linkToken !== "string" || !tokenConfere(linkToken, partes.token)) return null;

  const clienteSnap = await adminDb.doc(`tenants/${partes.tenantId}/clientes/${partes.clienteId}`).get();
  if (!clienteSnap.exists) return null;

  return {
    tenantId: partes.tenantId,
    clienteId: partes.clienteId,
    cliente: { ...(clienteSnap.data() as object), id: partes.clienteId } as Cliente,
  };
}

/**
 * Mensalidade em aberto deste cliente.
 *
 * O cadastro do cartão é sempre amarrado a uma cobrança de verdade: a página do Asaas
 * cobra a fatura, não existe "tokenizar com R$ 0,00". Sem mensalidade em aberto a tela
 * diz isso, em vez de mandar o cliente para um formulário que não vai levar a nada.
 */
async function mensalidadeAberta(tenantId: string, clienteId: string): Promise<Transacao | null> {
  const snap = await adminDb
    .collection(`tenants/${tenantId}/transacoes`)
    .where("clienteId", "==", clienteId)
    .where("status", "in", ["pendente", "atrasado"])
    .get();

  const abertas = snap.docs
    .map((d) => ({ ...(d.data() as object), id: d.id }) as Transacao)
    .filter((t) => tipoCobranca(t) === "mensalidade" && !!t.dueDate && !t.paidAt)
    // A mais antiga primeiro: é a que está devendo há mais tempo.
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return abertas[0] ?? null;
}

async function montarDados(alvo: Awaited<ReturnType<typeof resolver>>): Promise<DadosCartao> {
  const { tenantId, clienteId, cliente } = alvo!;
  const [configSnap, planosSnap, cartao, vitrine, aberta] = await Promise.all([
    adminDb.doc(`tenants/${tenantId}/config/main`).get(),
    adminDb.collection(`tenants/${tenantId}/planos`).get(),
    lerCartao(tenantId, clienteId),
    lerCartaoVitrine(tenantId, clienteId),
    mensalidadeAberta(tenantId, clienteId),
  ]);

  const planos = planosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as Plano);
  const plano = planoDoCliente(planos, cliente);
  const barbearia = String(configSnap.data()?.nome ?? "a barbearia");
  const valor = plano?.valor ?? aberta?.amount ?? aberta?.valor ?? 0;
  const diaVencimento = diaVencimentoCliente(cliente, plano);

  return {
    barbearia,
    cliente: cliente.nome,
    plano: plano?.nome ?? aberta?.servico ?? "sua mensalidade",
    valor,
    diaVencimento,
    textoAutorizacao: textoAutorizacao(barbearia, formatBRL(valor), diaVencimento),
    // A vitrine manda no que a tela mostra: um cartão aposentado por recusas não é um
    // cartão que o cliente ainda tem — e mostrá-lo como ativo faria ele achar que está
    // tudo certo enquanto a mensalidade acumula.
    cartao:
      cartao && vitrine?.ativo !== false
        ? {
            bandeira: cartao.bandeira,
            ultimosDigitos: cartao.ultimosDigitos,
            cadastradoEm: cartao.cadastradoEm,
          }
        : null,
    mensalidadeAberta: aberta
      ? { valor: aberta.amount ?? aberta.valor, vencimentoISO: String(aberta.dueDate) }
      : null,
  };
}

export async function carregarCartao(codigo: string): Promise<CartaoResult> {
  try {
    const alvo = await resolver(codigo);
    if (!alvo) return { ok: false, error: LINK_INVALIDO };
    return { ok: true, dados: await montarDados(alvo) };
  } catch {
    return { ok: false, error: GENERICO };
  }
}

/**
 * Abre o cadastro do cartão na página hospedada do gateway.
 *
 * Sem aceite, não passa: a página do Asaas cobra AQUELA fatura e não pergunta nada sobre
 * as próximas — quem recorre é o O Cartel, então é aqui que o consentimento tem que ser
 * colhido e gravado. É essa gravação que sustenta a cobrança num chargeback.
 */
export async function iniciarCadastroCartao(codigo: string, aceite: boolean): Promise<CartaoResult> {
  try {
    const alvo = await resolver(codigo);
    if (!alvo) return { ok: false, error: LINK_INVALIDO };
    const { tenantId, clienteId, cliente } = alvo;

    if (!aceite) {
      return { ok: false, error: "Marque a autorização para cadastrar o cartão." };
    }

    const aberta = await mensalidadeAberta(tenantId, clienteId);
    if (!aberta) {
      return {
        ok: false,
        error:
          "Sua mensalidade deste mês já está paga. O cartão pode ser cadastrado na próxima " +
          "cobrança — a gente te avisa.",
      };
    }

    let gateway;
    try {
      gateway = await cobradorDoTenant(tenantId);
    } catch (err) {
      if (err instanceof CobradorNaoConfigurado) {
        return { ok: false, error: "A barbearia ainda não terminou de configurar o pagamento no cartão." };
      }
      throw err;
    }

    const asaasId =
      cliente.asaasId ||
      (await gateway.garantirCliente({
        nome: cliente.nome,
        cpf: String(cliente.cpf ?? ""),
        email: cliente.email || undefined,
        telefone: cliente.telefone || undefined,
      }));
    if (!cliente.asaasId) {
      await adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).set({ asaasId }, { merge: true });
    }

    const dados = await montarDados(alvo);
    const cabecalhos = await headers();
    // Primeiro IP da cadeia: o do cliente. O do servidor não serviria de nada — o gateway
    // quer o IP de quem autorizou.
    const ip = (cabecalhos.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";

    // O aceite é gravado ANTES de mandar para o gateway: a ordem real é aceitar aqui,
    // pagar lá, e o webhook voltar depois com o token. Gravar só no fim salvaria um
    // cartão sem prova de consentimento se o webhook atrasasse.
    await registrarAutorizacao(tenantId, clienteId, {
      texto: dados.textoAutorizacao,
      versao: VERSAO_AUTORIZACAO,
      ip,
      userAgent: cabecalhos.get("user-agent") ?? undefined,
    });

    const link = await gateway.pedirCartao({
      clienteExterno: asaasId,
      valor: aberta.amount ?? aberta.valor,
      vencimentoISO: String(aberta.dueDate),
      descricao: `${aberta.servico} · ${dados.barbearia}`,
      // A âncora do webhook: é por ela que a baixa e a captura do token acham a cobrança.
      referencia: montarReferencia(tenantId, aberta.id),
    });
    if (!link.url) return { ok: false, error: GENERICO };

    // A trava do cartão nesta mensalidade: o cliente está a caminho da página de
    // pagamento, e o ciclo não pode debitar a mesma cobrança por trás dele.
    await adminDb.doc(`tenants/${tenantId}/transacoes/${aberta.id}`).set(
      {
        cartaoCobranca: {
          provedor: "asaas",
          situacao: "enviando",
          cobrancaId: link.cobrancaId,
          tentadoEm: new Date().toISOString(),
        },
      },
      { merge: true },
    );

    return { ok: true, url: link.url };
  } catch {
    return { ok: false, error: "Não foi possível abrir o cadastro do cartão. Tente de novo." };
  }
}

/** O cliente tira o próprio cartão. Sem confirmação por e-mail, sem falar com ninguém. */
export async function removerCartaoDoCliente(codigo: string): Promise<CartaoResult> {
  try {
    const alvo = await resolver(codigo);
    if (!alvo) return { ok: false, error: LINK_INVALIDO };

    await removerCartao(alvo.tenantId, alvo.clienteId, "cliente");
    return { ok: true, dados: await montarDados(alvo) };
  } catch {
    return { ok: false, error: "Não foi possível remover o cartão. Tente de novo." };
  }
}
