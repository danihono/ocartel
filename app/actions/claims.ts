"use server";

// Sincroniza os custom claims do usuário logado com o doc `users/{uid}`.
//
// Quem manda é SEMPRE o Firestore: o cliente não escolhe o próprio papel — ele
// só apresenta um ID token, e o servidor lê o perfil correspondente e espelha
// nos claims. Por isso a action recebe o token (verificado aqui) em vez de um
// uid: sem isso qualquer um poderia pedir sincronização em nome de outro.

import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { claimsDesatualizados, claimsDoPerfil } from "@/lib/claims";

export interface SincronizarResult {
  /** true quando os claims foram (re)gravados — o cliente precisa renovar o token. */
  atualizado: boolean;
  erro?: string;
}

export async function sincronizarClaims(idToken: string): Promise<SincronizarResult> {
  if (!idToken || typeof idToken !== "string") return { atualizado: false, erro: "Token ausente." };

  let uid: string;
  let tokenAtual: Record<string, unknown>;
  try {
    const decodificado = await adminAuth.verifyIdToken(idToken);
    uid = decodificado.uid;
    tokenAtual = decodificado as unknown as Record<string, unknown>;
  } catch {
    return { atualizado: false, erro: "Sessão inválida." };
  }

  const snap = await adminDb.collection("users").doc(uid).get();
  const alvo = claimsDoPerfil(snap.exists ? (snap.data() as Record<string, unknown>) : null);
  // Sem perfil (ou papel desconhecido) não há o que espelhar. Acontece na janela
  // entre criar a conta e o onboarding gravar users/{uid} — não é erro.
  if (!alvo) return { atualizado: false };

  // Já bate: evita uma escrita no Auth e, principalmente, evita devolver
  // `atualizado: true` e fazer o cliente renovar o token à toa em todo login.
  if (!claimsDesatualizados(tokenAtual, alvo)) return { atualizado: false };

  await adminAuth.setCustomUserClaims(uid, alvo);
  return { atualizado: true };
}
