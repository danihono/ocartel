"use server";

// Onboarding — a criação da barbearia, do lado do servidor.
//
// O navegador cria a CONTA (Firebase Auth) e manda o id token para cá. Quem decide o
// vínculo conta ↔ barbearia, e o papel dela, é este arquivo. Ver lib/onboarding.ts.

import { comoResultado, exigirUsuario, type Resultado } from "@/lib/autorizacao";
import { criarBarbeariaDoDono } from "@/lib/onboarding";
import type { PlanoSaaS } from "@/lib/types";

export interface DadosOnboarding {
  nome: string;
  barbeariaNome: string;
  telefone: string;
  plano: PlanoSaaS;
}

export async function acaoCriarBarbearia(
  idToken: string,
  dados: DadosOnboarding,
): Promise<Resultado & { tenantId?: string; slug?: string }> {
  try {
    // O e-mail vem do TOKEN, não do formulário: é o único que já foi verificado.
    const { uid, email } = await exigirUsuario(idToken);
    const r = await criarBarbeariaDoDono({
      uid,
      email,
      nome: dados.nome,
      barbeariaNome: dados.barbeariaNome,
      telefone: dados.telefone,
      plano: dados.plano,
    });
    return { ok: true, ...r };
  } catch (err) {
    return comoResultado(err);
  }
}
