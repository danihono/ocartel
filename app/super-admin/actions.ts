"use server";

// Ações do console do O Cartel. Só o superAdmin — conferido pelo id token, no servidor.

import { comoResultado, exigirSuperAdmin, type Resultado } from "@/lib/autorizacao";
import { criarBarbeariaDemo } from "@/lib/onboarding";

export async function acaoCriarBarbeariaDemo(
  idToken: string,
  nome?: string,
): Promise<Resultado & { tenantId?: string; slug?: string }> {
  try {
    const uid = await exigirSuperAdmin(idToken);
    const r = await criarBarbeariaDemo({ ownerUid: uid, nome });
    return { ok: true, ...r };
  } catch (err) {
    return comoResultado(err);
  }
}
