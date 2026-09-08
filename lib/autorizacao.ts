// Quem pode o quê, do lado do SERVIDOR.
//
// ATENÇÃO: server action é ENDPOINT ACESSÍVEL. Sem verificação, bastaria mandar o
// tenantId de outra barbearia para parear o WhatsApp dela, ler as conversas dela ou
// derrubar a conexão dela. Toda action passa por aqui antes de qualquer efeito.
//
// Fica num módulo comum, e não dentro de um arquivo de actions, porque um arquivo
// `"use server"` só pode exportar função de action — duas telas precisando da mesma
// checagem acabariam com duas cópias dela, e uma regra de segurança duplicada é uma regra
// que um dia vai divergir.

import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const NAO_AUTORIZADO = "Você não tem permissão para gerenciar o WhatsApp desta barbearia.";
export const NAO_AUTORIZADO_SUPER = "Esta operação é restrita ao super admin.";
const GENERICO = "Não foi possível concluir. Tente novamente.";

export interface Resultado {
  ok: boolean;
  erro?: string;
}

/** Erro que PODE ser mostrado ao usuário (mensagem escrita para ele, sem detalhe interno). */
export class ErroVisivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroVisivel";
  }
}

/**
 * Confere o token e devolve o perfil de quem chamou.
 *
 * `checkRevoked: true` não é detalhe: sem ele, um token já emitido continua sendo aceito
 * por até uma hora depois de a conta ser bloqueada, excluída ou ter as permissões
 * trocadas — justamente a janela em que revogar o acesso mais importa.
 */
async function perfilDoToken(idToken: string): Promise<{ uid: string; role?: string; tenantId?: string }> {
  if (!idToken) throw new ErroVisivel(NAO_AUTORIZADO);

  // verifyIdToken já recusa token expirado, adulterado, revogado ou de outro projeto.
  const decoded = await adminAuth.verifyIdToken(idToken, true).catch(() => null);
  if (!decoded) throw new ErroVisivel(NAO_AUTORIZADO);

  const perfil = await adminDb.doc(`users/${decoded.uid}`).get();
  return {
    uid: decoded.uid,
    role: perfil.exists ? (perfil.get("role") as string | undefined) : undefined,
    tenantId: perfil.exists ? (perfil.get("tenantId") as string | undefined) : undefined,
  };
}

/** Só confere a identidade — para o onboarding, em que o usuário ainda não tem perfil. */
export async function exigirUsuario(idToken: string): Promise<{ uid: string; email: string }> {
  if (!idToken) throw new ErroVisivel(NAO_AUTORIZADO);
  const decoded = await adminAuth.verifyIdToken(idToken, true).catch(() => null);
  if (!decoded) throw new ErroVisivel(NAO_AUTORIZADO);
  return { uid: decoded.uid, email: decoded.email ?? "" };
}

/**
 * Espelha no servidor a mesma regra do Firestore (`canManage` em firestore.rules):
 * o ADMIN daquele tenant, ou um superAdmin. O papel `barbeiro` não gerencia.
 *
 * Lança em vez de devolver booleano para não haver caminho em que o chamador esqueça de
 * checar o retorno e siga adiante.
 */
export async function exigirQuemGerencia(idToken: string, tenantId: string): Promise<void> {
  if (!tenantId) throw new ErroVisivel(NAO_AUTORIZADO);
  const perfil = await perfilDoToken(idToken);

  if (perfil.role === "superAdmin") return;
  if (perfil.role === "admin" && perfil.tenantId === tenantId) return;

  throw new ErroVisivel(NAO_AUTORIZADO);
}

/** Só o superAdmin (console do O Cartel). */
export async function exigirSuperAdmin(idToken: string): Promise<string> {
  const perfil = await perfilDoToken(idToken);
  if (perfil.role !== "superAdmin") throw new ErroVisivel(NAO_AUTORIZADO_SUPER);
  return perfil.uid;
}

/**
 * Converte a exceção de uma action no formato que a tela sabe exibir.
 *
 * Só `ErroVisivel` chega ao navegador com o texto original. Qualquer outra exceção vira
 * mensagem genérica: um erro cru do Firestore ou do Admin SDK descreve caminho de
 * coleção, projeto e estado interno para quem estiver do outro lado.
 */
export function comoResultado(err: unknown): Resultado {
  if (err instanceof ErroVisivel) return { ok: false, erro: err.message };
  console.error("[action] erro inesperado:", err);
  return { ok: false, erro: GENERICO };
}
