"use server";

// Server actions do acesso dos barbeiros (Configurações → Equipe).
//
// Criar conta no Firebase Auth e gravar `users/{uid}` com papel `barbeiro` só o Admin SDK
// faz: as regras deixam o navegador criar apenas o PRÓPRIO perfil, e só como `admin`. A
// guarda é a mesma de toda action que mexe na barbearia (`exigirQuemGerencia`), que
// recusa barbeiro — um barbeiro não dá acesso a ninguém.

import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { conflitoAcessoBarbeiro, emailValido, normalizaEmail, type AcessoBarbeiro, type PerfilExistente } from "@/lib/equipe";

function codigoDoErro(e: unknown): string {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
}

const equipeRef = (tenantId: string) => adminDb.doc(`tenants/${tenantId}/private/equipe`);

/**
 * Cria (ou refaz) o acesso de um barbeiro e devolve o link para ele definir a senha.
 *
 * Chamar de novo com o mesmo e-mail é o "reenviar link": a conta é reaproveitada e só um
 * link novo sai. Se o barbeiro já tinha acesso com OUTRO e-mail, o antigo é desligado —
 * um barbeiro tem um acesso só.
 */
export async function acaoDarAcessoBarbeiro(
  idToken: string,
  tenantId: string,
  barbeiroId: string,
  email: string,
): Promise<Resultado & { link?: string; email?: string }> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    const emailLimpo = normalizaEmail(email);
    if (!emailValido(emailLimpo)) return { ok: false, erro: "E-mail inválido." };

    const barbSnap = await adminDb.doc(`tenants/${tenantId}/barbeiros/${barbeiroId}`).get();
    if (!barbeiroId || !barbSnap.exists) return { ok: false, erro: "Barbeiro não encontrado na equipe." };
    const nome = String(barbSnap.get("nome") ?? "Barbeiro");

    let uid: string;
    try {
      const existente = await adminAuth.getUserByEmail(emailLimpo);
      uid = existente.uid;
      // Acesso removido antes fica desativado; dar de novo religa a conta.
      if (existente.disabled) await adminAuth.updateUser(uid, { disabled: false });
    } catch (e) {
      if (codigoDoErro(e) !== "auth/user-not-found") throw e;
      uid = (await adminAuth.createUser({ email: emailLimpo, displayName: nome })).uid;
    }

    const perfilRef = adminDb.doc(`users/${uid}`);
    const perfil = await perfilRef.get();
    const conflito = conflitoAcessoBarbeiro(perfil.exists ? (perfil.data() as PerfilExistente) : null, tenantId, barbeiroId);
    if (conflito) return { ok: false, erro: conflito };

    // Acesso anterior deste barbeiro com outro e-mail: desliga antes de ligar o novo.
    const equipe = await equipeRef(tenantId).get();
    const anterior = equipe.get(`acessos.${barbeiroId}`) as AcessoBarbeiro | undefined;
    if (anterior && anterior.uid !== uid) await desligarConta(anterior.uid, tenantId);

    const acesso: AcessoBarbeiro = { uid, email: emailLimpo, criadoEm: new Date().toISOString() };
    const batch = adminDb.batch();
    batch.set(perfilRef, { role: "barbeiro", tenantId, barbeiroId, nome, email: emailLimpo, createdAt: FieldValue.serverTimestamp() });
    batch.set(equipeRef(tenantId), { acessos: { [barbeiroId]: acesso } }, { merge: true });
    await batch.commit();

    const link = await adminAuth.generatePasswordResetLink(emailLimpo);
    return { ok: true, link, email: emailLimpo };
  } catch (err) {
    return comoResultado(err);
  }
}

/** Tira o acesso: a conta é desativada e a sessão aberta cai. */
export async function acaoRemoverAcessoBarbeiro(idToken: string, tenantId: string, barbeiroId: string): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    const equipe = await equipeRef(tenantId).get();
    const acesso = equipe.get(`acessos.${barbeiroId}`) as AcessoBarbeiro | undefined;
    if (!acesso) return { ok: false, erro: "Este barbeiro não tem acesso." };

    await desligarConta(acesso.uid, tenantId);
    await equipeRef(tenantId).update({ [`acessos.${barbeiroId}`]: FieldValue.delete() });
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}

/**
 * Desativa a conta e apaga o perfil — mas só se o perfil for mesmo um barbeiro DESTA
 * barbearia. O uid vem do doc da equipe; conferir o perfil impede que um vínculo velho
 * ou adulterado derrube a conta de outra pessoa.
 */
async function desligarConta(uid: string, tenantId: string): Promise<void> {
  const perfilRef = adminDb.doc(`users/${uid}`);
  const perfil = await perfilRef.get();
  if (perfil.exists && (perfil.get("role") !== "barbeiro" || perfil.get("tenantId") !== tenantId)) return;
  if (perfil.exists) await perfilRef.delete();
  try {
    await adminAuth.updateUser(uid, { disabled: true });
    await adminAuth.revokeRefreshTokens(uid);
  } catch (e) {
    if (codigoDoErro(e) !== "auth/user-not-found") throw e;
  }
}
