"use server";

// Server actions do WhatsApp: o pareamento por QR (daemon) e a conexão pela API oficial.
//
// A verificação de quem pode mexer mora em lib/autorizacao.ts, compartilhada com as
// actions da tela de WhatsApp — ver o comentário de lá.

import {
  comoResultado,
  exigirQuemGerencia,
  type Resultado,
} from "@/lib/autorizacao";
import {
  desconectarPareamento,
  iniciarPareamento,
  lerEstadoPareamento,
  type EstadoPareamento,
} from "@/lib/canal/pareamento";
import { conectarNumeroOficial, type PedidoConexao, type ResultadoConexao } from "@/lib/whatsapp/conectar";

export async function acaoIniciarPareamento(idToken: string, tenantId: string): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    return await iniciarPareamento(tenantId);
  } catch (err) {
    return comoResultado(err);
  }
}

export async function acaoConsultarPareamento(
  idToken: string,
  tenantId: string,
): Promise<EstadoPareamento | Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    return await lerEstadoPareamento(tenantId);
  } catch (err) {
    return comoResultado(err);
  }
}

export async function acaoDesconectarPareamento(idToken: string, tenantId: string): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    return await desconectarPareamento(tenantId);
  } catch (err) {
    return comoResultado(err);
  }
}

/**
 * Conecta o número da barbearia à API oficial com o que a janela da Meta devolveu. Ver
 * lib/whatsapp/conectar.ts — o código da Meta vale 30 segundos, então não há fila aqui.
 */
export async function acaoConectarWhatsAppOficial(
  idToken: string,
  tenantId: string,
  pedido: PedidoConexao,
): Promise<ResultadoConexao> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    return await conectarNumeroOficial(tenantId, pedido);
  } catch (err) {
    const r = comoResultado(err);
    return { ok: false, erro: r.erro ?? "Não foi possível conectar." };
  }
}
