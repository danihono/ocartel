// Quem pode mexer no WhatsApp de uma barbearia.
//
// ATENÇÃO: server action é ENDPOINT ACESSÍVEL. Sem verificação, bastaria mandar o
// tenantId de outra barbearia para parear o WhatsApp dela, ler as conversas dela ou
// derrubar a conexão dela. Toda action de WhatsApp passa por aqui antes de qualquer
// efeito.
//
// Fica num módulo comum, e não dentro de um arquivo de actions, porque um arquivo
// `"use server"` só pode exportar função de action — duas telas precisando da mesma
// checagem acabariam com duas cópias dela, e uma regra de segurança duplicada é uma regra
// que um dia vai divergir.

import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const NAO_AUTORIZADO = "Você não tem permissão para gerenciar o WhatsApp desta barbearia.";

export interface Resultado {
  ok: boolean;
  erro?: string;
}

/**
 * Espelha no servidor a mesma regra do Firestore (`canManage` em firestore.rules):
 * o dono daquele tenant, ou um superAdmin.
 *
 * Lança em vez de devolver booleano para não haver caminho em que o chamador esqueça de
 * checar o retorno e siga adiante.
 */
export async function exigirQuemGerencia(idToken: string, tenantId: string): Promise<void> {
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

/** Converte a exceção de uma action no formato que a tela sabe exibir. */
export function comoResultado(err: unknown): Resultado {
  return { ok: false, erro: err instanceof Error ? err.message : "Não foi possível concluir." };
}
