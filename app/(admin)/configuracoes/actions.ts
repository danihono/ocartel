"use server";

// Server actions do pareamento de WhatsApp.
//
// ATENÇÃO: server action é ENDPOINT ACESSÍVEL. A única outra action do projeto
// (app/book/[slug]/actions.ts) é pública de propósito — qualquer um agenda. Estas NÃO
// podem ser: sem verificação, bastaria mandar o tenantId de outra barbearia para parear
// o WhatsApp dela, ou derrubar o dela. Por isso toda action aqui passa por
// `exigirQuemGerencia` antes de qualquer efeito.

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  desconectarPareamento,
  iniciarPareamento,
  lerEstadoPareamento,
  type EstadoPareamento,
} from "@/lib/canal/pareamento";

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const NAO_AUTORIZADO = "Você não tem permissão para gerenciar o WhatsApp desta barbearia.";

/**
 * Espelha no servidor a mesma regra do Firestore (`canManage` em firestore.rules):
 * o dono daquele tenant, ou um superAdmin.
 *
 * Lança em vez de devolver booleano para não haver caminho em que o chamador esqueça
 * de checar o retorno e siga adiante.
 */
async function exigirQuemGerencia(idToken: string, tenantId: string): Promise<void> {
  if (!idToken || !tenantId) throw new Error(NAO_AUTORIZADO);

  // verifyIdToken já recusa token expirado, adulterado ou de outro projeto.
  const decoded = await adminAuth.verifyIdToken(idToken).catch(() => null);
  if (!decoded) throw new Error(NAO_AUTORIZADO);

  const perfil = await adminDb.doc(`users/${decoded.uid}`).get();
  if (!perfil.exists) throw new Error(NAO_AUTORIZADO);

  if (perfil.get("role") === "superAdmin") return;
  if (perfil.get("tenantId") === tenantId) return;

  throw new Error(NAO_AUTORIZADO);
}

function comoResultado(err: unknown): Resultado {
  return { ok: false, erro: err instanceof Error ? err.message : "Não foi possível concluir." };
}

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
