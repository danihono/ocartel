"use server";

// Server actions do pareamento de WhatsApp.
//
// A verificação de quem pode mexer mora em lib/canal/autorizacao.ts, compartilhada com as
// actions da tela de WhatsApp — ver o comentário de lá.

import {
  comoResultado,
  exigirQuemGerencia,
  type Resultado,
} from "@/lib/canal/autorizacao";
import {
  desconectarPareamento,
  iniciarPareamento,
  lerEstadoPareamento,
  type EstadoPareamento,
} from "@/lib/canal/pareamento";

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
