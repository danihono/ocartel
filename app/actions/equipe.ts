"use server";

// Cria (e redefine a senha de) contas de acesso para os barbeiros da equipe.
//
// Por que server action: o papel `barbeiro` não pode nascer pelo auto-cadastro —
// as regras só deixam alguém criar a si mesmo como `admin` (senão qualquer um se
// declararia barbeiro de qualquer barbearia). Aqui o Admin SDK grava o perfil,
// depois de o servidor confirmar quem está pedindo.
//
// Regra de ouro deste arquivo: o `tenantId` NUNCA vem do cliente. Ele é lido do
// perfil de quem assinou o ID token. Sem isso, um admin da barbearia A poderia
// criar barbeiros dentro da barbearia B.

import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { claimsDoPerfil } from "@/lib/claims";

export interface CriarAcessoInput {
  /** ID token de quem está pedindo (admin da barbearia ou superAdmin). */
  idToken: string;
  /** Doc em tenants/{t}/barbeiros que a conta vai representar. */
  barbeiroId: string;
  email: string;
  senha: string;
  /** Só usado quando quem pede é superAdmin (que não tem barbearia própria). */
  tenantId?: string;
}

export interface AcessoResult {
  ok: boolean;
  erro?: string;
}

const SENHA_MINIMA = 6;

/** Quem está pedindo, resolvido no servidor a partir do token. */
async function autorizar(idToken: string, tenantIdInformado?: string) {
  if (!idToken) return { erro: "Sessão expirada. Entre novamente." as const };

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return { erro: "Sessão expirada. Entre novamente." as const };
  }

  const perfil = (await adminDb.collection("users").doc(uid).get()).data();
  const papel = perfil?.role;
  if (papel !== "admin" && papel !== "superAdmin") {
    return { erro: "Só a administração da barbearia pode criar acessos." as const };
  }

  // superAdmin não tem barbearia própria — ele informa em qual está atuando.
  // Para o admin, o tenant vem do perfil e o que o cliente mandou é ignorado.
  const tenantId = papel === "superAdmin" ? (tenantIdInformado ?? "") : String(perfil?.tenantId ?? "");
  if (!tenantId) return { erro: "Barbearia não identificada." as const };

  if (papel !== "superAdmin") {
    const tenant = (await adminDb.collection("tenants").doc(tenantId).get()).data();
    if (tenant?.status === "suspenso") {
      return { erro: "Barbearia suspensa — regularize a assinatura para criar acessos." as const };
    }
  }

  return { tenantId };
}

export async function criarAcessoBarbeiro(input: CriarAcessoInput): Promise<AcessoResult> {
  const email = (input.email ?? "").trim().toLowerCase();
  const senha = input.senha ?? "";

  if (!email) return { ok: false, erro: "Informe o e-mail do barbeiro." };
  if (senha.length < SENHA_MINIMA) return { ok: false, erro: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.` };

  const auth = await autorizar(input.idToken, input.tenantId);
  if ("erro" in auth) return { ok: false, erro: auth.erro };
  const { tenantId } = auth;

  const barbeiroRef = adminDb.collection("tenants").doc(tenantId).collection("barbeiros").doc(input.barbeiroId);
  const barbeiro = (await barbeiroRef.get()).data();
  if (!barbeiro) return { ok: false, erro: "Barbeiro não encontrado nesta barbearia." };
  if (barbeiro.acessoUid) return { ok: false, erro: "Esse barbeiro já tem acesso. Use “redefinir senha”." };

  let uid: string;
  try {
    uid = (await adminAuth.createUser({ email, password: senha, displayName: barbeiro.nome })).uid;
  } catch (e) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "auth/email-already-exists") return { ok: false, erro: "Já existe uma conta com esse e-mail." };
    if (code === "auth/invalid-email") return { ok: false, erro: "E-mail inválido." };
    return { ok: false, erro: "Não foi possível criar o acesso." };
  }

  const perfil = { role: "barbeiro", tenantId, barbeiroId: input.barbeiroId, nome: barbeiro.nome, email };
  try {
    await adminDb.collection("users").doc(uid).set(perfil);
    await adminAuth.setCustomUserClaims(uid, claimsDoPerfil(perfil) ?? { role: "barbeiro", tenantId });
    await barbeiroRef.update({ acessoUid: uid, acessoEmail: email });
  } catch {
    // Rollback: sem o perfil, a conta logaria e ficaria presa numa tela sem
    // barbearia. Melhor não deixar esse fantasma no Auth.
    await adminAuth.deleteUser(uid).catch(() => {});
    return { ok: false, erro: "Não foi possível concluir o acesso. Tente novamente." };
  }

  return { ok: true };
}

export interface RevogarAcessoInput {
  idToken: string;
  barbeiroId: string;
  tenantId?: string;
}

/**
 * Derruba o login de um barbeiro. Chamado antes de excluir o barbeiro do
 * cadastro: sem isso a conta continuaria válida, com claims apontando para a
 * barbearia, e um ex-funcionário seguiria lendo a base de clientes.
 */
export async function revogarAcessoBarbeiro(input: RevogarAcessoInput): Promise<AcessoResult> {
  const auth = await autorizar(input.idToken, input.tenantId);
  if ("erro" in auth) return { ok: false, erro: auth.erro };

  const barbeiroRef = adminDb.collection("tenants").doc(auth.tenantId).collection("barbeiros").doc(input.barbeiroId);
  const barbeiro = (await barbeiroRef.get()).data();
  const uid = barbeiro?.acessoUid ? String(barbeiro.acessoUid) : "";
  // Sem acesso não há nada a revogar — e isso não é erro para quem chama.
  if (!uid) return { ok: true };

  try {
    await adminDb.collection("users").doc(uid).delete();
    // Apagar do Auth invalida o token na hora; revokeRefreshTokens não bastaria,
    // porque o ID token corrente seguiria valendo até expirar.
    await adminAuth.deleteUser(uid).catch(() => {});
    await barbeiroRef.update({ acessoUid: FieldValue.delete(), acessoEmail: FieldValue.delete() });
  } catch {
    return { ok: false, erro: "Não foi possível revogar o acesso." };
  }
  return { ok: true };
}

export interface RedefinirSenhaInput {
  idToken: string;
  barbeiroId: string;
  senha: string;
  tenantId?: string;
}

export async function redefinirSenhaBarbeiro(input: RedefinirSenhaInput): Promise<AcessoResult> {
  const senha = input.senha ?? "";
  if (senha.length < SENHA_MINIMA) return { ok: false, erro: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.` };

  const auth = await autorizar(input.idToken, input.tenantId);
  if ("erro" in auth) return { ok: false, erro: auth.erro };

  const barbeiroRef = adminDb.collection("tenants").doc(auth.tenantId).collection("barbeiros").doc(input.barbeiroId);
  const barbeiro = (await barbeiroRef.get()).data();
  // Confere o vínculo pelo doc do PRÓPRIO tenant: é o que impede um admin de
  // trocar a senha de uma conta que não pertence à barbearia dele.
  if (!barbeiro?.acessoUid) return { ok: false, erro: "Esse barbeiro ainda não tem acesso." };

  try {
    await adminAuth.updateUser(String(barbeiro.acessoUid), { password: senha });
  } catch {
    return { ok: false, erro: "Não foi possível redefinir a senha." };
  }
  return { ok: true };
}
