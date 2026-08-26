// Cobrador — a porta trocável entre O Cartel e o gateway de pagamento.
//
// TUDO que emite boleto passa por aqui. Nada fora desta pasta pode saber COMO a cobrança
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

export interface Cobrador {
  /**
   * Id do cliente no gateway, criando-o se ainda não existir. Idempotente por CPF: o
   * mesmo CPF nunca pode virar dois cadastros lá dentro.
   */
  garantirCliente(dados: DadosClienteCobranca): Promise<string>;
  emitirBoleto(pedido: PedidoBoleto): Promise<BoletoEmitido>;
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
