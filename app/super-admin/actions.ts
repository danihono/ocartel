"use server";

// Server actions do console SaaS: criar uma barbearia sem dono e, depois, entregar a
// administração dela a alguém.
//
// É o caminho para montar uma barbearia ANTES de quem vai administrá-la entrar: o super
// admin cria, entra no painel (impersonação), cadastra serviços, equipe e clientes, e só
// então define o administrador pelo e-mail. O onboarding de /login não serve para isso —
// lá quem se cadastra já nasce dono, e uma barbearia não troca de dono.
//
// Rodam com o Admin SDK porque as regras do Firestore não deixam o navegador fazer
// nenhuma das duas coisas, e de propósito: `/tenants` só nasce `pendente` e com o próprio
// usuário como dono, e o perfil `users/{uid}` de outra pessoa não se escreve pelo cliente.

import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirSuperAdmin, type Resultado } from "@/lib/autorizacao";
import { slug as slugify } from "@/lib/selectors";
import { candidatosSlug, HORARIO_PADRAO, monograma, PLANOS_TIERS, slugDeReserva } from "@/lib/tenant-util";

/** Mesma reserva atômica de `reservarSlug` (bootstrap.ts), do lado do servidor. */
async function reservarSlug(base: string, tenantId: string): Promise<string> {
  for (const cand of candidatosSlug(base, tenantId)) {
    const ok = await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.doc(`slugs/${cand}`);
      if ((await tx.get(ref)).exists) return false;
      tx.create(ref, { tenantId, createdAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (ok) return cand;
  }
  const unico = slugDeReserva(tenantId);
  await adminDb.doc(`slugs/${unico}`).set({ tenantId, createdAt: FieldValue.serverTimestamp() });
  return unico;
}

/**
 * Cria uma barbearia de verdade, VAZIA (sem os dados de exemplo da demo) e já `ativo`:
 * quem aprova é quem está criando. O dono provisório é o próprio super admin, só para o
 * campo não ficar vazio; `aguardandoAdministrador` é o que diz que ninguém a administra
 * ainda.
 */
export async function acaoCriarBarbearia(
  idToken: string,
  nome: string,
): Promise<Resultado & { tenantId?: string }> {
  try {
    const quem = await exigirSuperAdmin(idToken);
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return { ok: false, erro: "Informe o nome da barbearia." };

    const tenantRef = adminDb.collection("tenants").doc();
    const tenantId = tenantRef.id;
    const slug = await reservarSlug(slugify(nomeLimpo), tenantId);

    const batch = adminDb.batch();
    batch.set(tenantRef, {
      nome: nomeLimpo,
      slug,
      cidade: "",
      monograma: monograma(nomeLimpo),
      plano: "Básico",
      status: "ativo",
      mrr: "—",
      agendamentosMes: "0",
      ownerUid: quem.uid,
      aguardandoAdministrador: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(tenantRef.collection("config").doc("main"), {
      nome: nomeLimpo,
      endereco: "",
      telefone: "",
      horario: HORARIO_PADRAO,
    });
    for (const tier of PLANOS_TIERS) {
      batch.set(tenantRef.collection("planosTiers").doc(tier.id), { ...tier });
    }
    await batch.commit();

    return { ok: true, tenantId };
  } catch (err) {
    return comoResultado(err);
  }
}

function codigoDoErro(e: unknown): string {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
}

/**
 * Entrega a administração da barbearia a um e-mail. Se a pessoa ainda não tem conta, a
 * conta é criada SEM senha; o que volta é um link para ela mesma definir a senha (o super
 * admin manda pelo WhatsApp). Assim ninguém além dela conhece a senha.
 *
 * Recusa quem já administra OUTRA barbearia: um perfil aponta para um tenant só, então
 * aceitar seria tirar a pessoa da barbearia dela sem aviso.
 */
export async function acaoDefinirAdministrador(
  idToken: string,
  tenantId: string,
  nome: string,
  email: string,
): Promise<Resultado & { link?: string }> {
  try {
    await exigirSuperAdmin(idToken);
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim().toLowerCase();
    if (!nomeLimpo) return { ok: false, erro: "Informe o nome do administrador." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) return { ok: false, erro: "E-mail inválido." };

    const tenantRef = adminDb.doc(`tenants/${tenantId}`);
    if (!tenantId || !(await tenantRef.get()).exists) return { ok: false, erro: "Barbearia não encontrada." };

    let uid: string;
    try {
      uid = (await adminAuth.getUserByEmail(emailLimpo)).uid;
    } catch (e) {
      if (codigoDoErro(e) !== "auth/user-not-found") throw e;
      uid = (await adminAuth.createUser({ email: emailLimpo, displayName: nomeLimpo })).uid;
    }

    const perfilRef = adminDb.doc(`users/${uid}`);
    const perfil = await perfilRef.get();
    if (perfil.exists) {
      if (perfil.get("role") === "superAdmin") {
        return { ok: false, erro: "Este e-mail é de um super admin. Use outro e-mail." };
      }
      const outro = String(perfil.get("tenantId") ?? "");
      if (outro && outro !== tenantId) {
        return { ok: false, erro: "Este e-mail já administra outra barbearia." };
      }
    }

    const batch = adminDb.batch();
    batch.set(perfilRef, { role: "admin", tenantId, nome: nomeLimpo, email: emailLimpo, createdAt: FieldValue.serverTimestamp() });
    batch.update(tenantRef, { ownerUid: uid, aguardandoAdministrador: FieldValue.delete() });
    await batch.commit();

    const link = await adminAuth.generatePasswordResetLink(emailLimpo);
    return { ok: true, link };
  } catch (err) {
    return comoResultado(err);
  }
}
