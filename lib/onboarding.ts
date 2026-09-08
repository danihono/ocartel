// Criação de barbearia — SÓ no servidor (Admin SDK).
//
// Isto morava no navegador (`lib/firebase/bootstrap.ts`) e era a falha mais grave do
// sistema: quem cria o doc `users/{uid}` escolhe o `tenantId` dele, e o navegador
// escolhendo o próprio vínculo significa que qualquer conta recém-criada podia se declarar
// admin da barbearia de outra pessoa. As regras não têm como consertar isso sozinhas — a
// escolha do vínculo é a decisão, e ela passou para cá.
//
// Nunca importe deste arquivo em componente de cliente: ele carrega firebase-admin.

import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { ErroVisivel } from "@/lib/autorizacao";
import { slug as slugify } from "@/lib/selectors";
import { HOJE_ISO } from "@/lib/date";
import {
  agendaBarbeiros,
  agendaBlocos,
  bookingBarbeiros,
  BARBEARIA,
  clientes as seedClientes,
  planosCliente as seedPlanos,
  servicos as seedServicos,
} from "@/lib/mock-data";
import type { PlanoSaaS } from "@/lib/types";

export const PLANOS_VALIDOS: PlanoSaaS[] = ["Básico", "Pro"];

function monograma(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Texto de formulário, aparado e limitado. Impede campo gigante virar doc gigante. */
export function texto(valor: unknown, max: number, padrao = ""): string {
  const s = String(valor ?? "").trim().replace(/\s+/g, " ");
  return (s || padrao).slice(0, max);
}

/**
 * Reserva ATOMICAMENTE slugs/{slug} -> tenantId (cria o doc dentro de uma transação,
 * eliminando a corrida check-then-set). Tenta o slug base; em caso de colisão, sufixa com
 * pedaços do tenantId até conseguir.
 */
async function reservarSlug(base: string, tenantId: string): Promise<string> {
  const raiz = base || "barbearia";
  const candidatos = [
    raiz,
    `${raiz}-${tenantId.slice(0, 4).toLowerCase()}`,
    `${raiz}-${tenantId.slice(0, 8).toLowerCase()}`,
  ];
  for (const cand of candidatos) {
    const ok = await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.doc(`slugs/${cand}`);
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, { tenantId, createdAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (ok) return cand;
  }
  // Último recurso: slug derivado do tenantId (único por construção).
  const unico = `barbearia-${tenantId.slice(0, 12).toLowerCase()}`;
  await adminDb.doc(`slugs/${unico}`).set({ tenantId, createdAt: FieldValue.serverTimestamp() });
  return unico;
}

export interface NovaBarbearia {
  uid: string;
  email: string;
  nome: string; // nome do dono
  barbeariaNome: string;
  telefone: string;
  plano: PlanoSaaS;
}

/**
 * Onboarding: cria o tenant, reserva o slug, grava o perfil `admin` do dono e semeia a
 * config inicial. A barbearia começa VAZIA — serviços, barbeiros, planos e clientes são
 * cadastrados pelo próprio admin.
 *
 * Recusa quem já tem perfil: sem isso, uma conta existente chamaria a action de novo para
 * trocar de barbearia — exatamente o buraco que estamos fechando.
 */
export async function criarBarbeariaDoDono(dados: NovaBarbearia): Promise<{ tenantId: string; slug: string }> {
  const perfilRef = adminDb.doc(`users/${dados.uid}`);
  if ((await perfilRef.get()).exists) {
    throw new ErroVisivel("Esta conta já tem uma barbearia.");
  }

  const barbeariaNome = texto(dados.barbeariaNome, 80, "Minha Barbearia");
  const nomeDono = texto(dados.nome, 80, "Administrador");
  const telefone = texto(dados.telefone, 30);
  const plano: PlanoSaaS = PLANOS_VALIDOS.includes(dados.plano) ? dados.plano : "Básico";

  const tenantRef = adminDb.collection("tenants").doc();
  const tenantId = tenantRef.id;
  const slug = await reservarSlug(slugify(barbeariaNome), tenantId);

  // Um batch só: o Admin SDK não passa pelas regras, então não existe o problema de
  // ordenação que obrigava o bootstrap do navegador a commitar em duas etapas.
  const batch = adminDb.batch();

  batch.set(tenantRef, {
    nome: barbeariaNome,
    slug,
    cidade: "",
    monograma: monograma(barbeariaNome),
    plano,
    status: "trial",
    mrr: plano === "Pro" ? "R$ 249" : "R$ 129",
    agendamentosMes: "0",
    ownerUid: dados.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  // O papel é decidido AQUI, no servidor. `superAdmin` nunca é auto-concedido.
  batch.set(perfilRef, {
    role: "admin",
    tenantId,
    nome: nomeDono,
    email: dados.email,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(adminDb.doc(`tenants/${tenantId}/config/main`), {
    nome: barbeariaNome,
    endereco: "",
    telefone,
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  });

  // Tiers da assinatura SaaS do O Cartel (estrutural — não é dado de negócio da barbearia).
  batch.set(adminDb.doc(`tenants/${tenantId}/planosTiers/basico`), {
    id: "basico",
    nome: "Básico",
    preco: 129,
    descricao: "1 unidade · até 3 barbeiros",
  });
  batch.set(adminDb.doc(`tenants/${tenantId}/planosTiers/pro`), {
    id: "pro",
    nome: "Pro",
    preco: 249,
    descricao: "Multi-unidade · ilimitado",
  });

  await batch.commit();

  // Custom claims: deixam o papel viajar no próprio token. Hoje as regras leem
  // `users/{uid}`; a claim é o caminho para elas pararem de precisar desse `get()`.
  await adminAuth.setCustomUserClaims(dados.uid, { role: "admin", tenantId }).catch(() => {});

  return { tenantId, slug };
}

/**
 * Barbearia de DEMONSTRAÇÃO para o superAdmin inspecionar as telas de tenant. NÃO grava
 * `users/{uid}`: o superAdmin não vira admin dela, apenas "entra" por impersonação. Já vem
 * populada (catálogo + clientes + agenda de hoje) para as telas não ficarem vazias.
 */
export async function criarBarbeariaDemo(params: { ownerUid: string; nome?: string }): Promise<{ tenantId: string; slug: string }> {
  const nome = texto(params.nome, 80, "Barbearia Demo");
  const tenantRef = adminDb.collection("tenants").doc();
  const tenantId = tenantRef.id;
  const slug = await reservarSlug(slugify(nome), tenantId);

  const batch = adminDb.batch();

  batch.set(tenantRef, {
    nome,
    slug,
    cidade: "São Paulo · SP",
    monograma: monograma(nome),
    plano: "Pro",
    status: "ativo",
    mrr: "R$ 249",
    agendamentosMes: "0",
    ownerUid: params.ownerUid,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(adminDb.doc(`tenants/${tenantId}/config/main`), {
    nome,
    endereco: BARBEARIA.endereco,
    telefone: "(11) 3060-1200",
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  });

  seedServicos.forEach((s) => {
    batch.set(adminDb.doc(`tenants/${tenantId}/servicos/${s.id}`), {
      nome: s.nome,
      duracaoMin: s.duracaoMin,
      preco: s.preco,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  // Barbeiros (id = slug do nome, para casar com os agendamentos abaixo).
  const barbeiroIds = agendaBarbeiros.map((b) => slugify(b.nome));
  agendaBarbeiros.forEach((b, i) => {
    const bk = bookingBarbeiros.find((x) => x.nome === b.nome);
    batch.set(adminDb.doc(`tenants/${tenantId}/barbeiros/${barbeiroIds[i]}`), {
      nome: b.nome,
      iniciais: b.iniciais,
      cor: b.cor,
      ...(bk?.rating ? { rating: bk.rating } : {}),
      ...(bk?.especialidade ? { especialidade: bk.especialidade } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  seedClientes.forEach((cli) => {
    const { id, ...rest } = cli;
    batch.set(adminDb.doc(`tenants/${tenantId}/clientes/${id}`), { ...rest, createdAt: FieldValue.serverTimestamp() });
  });

  agendaBlocos.forEach((blocos, idx) => {
    const barbeiroId = barbeiroIds[idx];
    blocos.forEach((bl) => {
      const nomeServico = bl.servico.split(" · ")[0].trim();
      batch.set(adminDb.collection(`tenants/${tenantId}/agendamentos`).doc(), {
        date: HOJE_ISO,
        barbeiroId,
        clienteNome: bl.cliente,
        servico: nomeServico,
        servicoId: seedServicos.find((s) => s.nome === nomeServico)?.id ?? null,
        inicio: bl.inicio,
        duracaoMin: bl.duracaoMin,
        status: bl.status,
        origem: "admin",
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  });

  batch.set(adminDb.doc(`tenants/${tenantId}/planosTiers/basico`), { id: "basico", nome: "Básico", preco: 129, descricao: "1 unidade · até 3 barbeiros" });
  batch.set(adminDb.doc(`tenants/${tenantId}/planosTiers/pro`), { id: "pro", nome: "Pro", preco: 249, descricao: "Multi-unidade · ilimitado" });

  seedPlanos.forEach((p) => {
    batch.set(adminDb.doc(`tenants/${tenantId}/planos/${p.id}`), {
      nome: p.nome,
      valor: p.valor,
      // Vencimento não é do plano: cada cliente tem o seu (Cliente.diaVencimento).
      ativo: p.ativo ?? true,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  return { tenantId, slug };
}
