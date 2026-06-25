// Bootstrap de um novo tenant no onboarding: cria o doc do tenant, reserva o
// slug público, cria o perfil do usuário (role "admin") e semeia o catálogo
// inicial (serviços, barbeiros, config, planos) — tudo num writeBatch atômico.

import { collection, doc, runTransaction, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./config";
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

function monograma(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Reserva ATOMICAMENTE slugs/{slug} -> tenantId (cria o doc dentro de uma
 * transação, eliminando a corrida check-then-set). Tenta o slug base; em caso de
 * colisão, sufixa com pedaços do tenantId até conseguir. O doc do slug já é
 * criado aqui — por isso NÃO deve ser recriado nos batches dos chamadores.
 */
async function reservarSlug(base: string, tenantId: string): Promise<string> {
  const raiz = base || "barbearia";
  const candidatos = [raiz, `${raiz}-${tenantId.slice(0, 4).toLowerCase()}`, `${raiz}-${tenantId.slice(0, 8).toLowerCase()}`];
  for (const cand of candidatos) {
    const ok = await runTransaction(db, async (tx) => {
      const ref = doc(db, "slugs", cand);
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, { tenantId, createdAt: serverTimestamp() });
      return true;
    });
    if (ok) return cand;
  }
  // Último recurso: slug derivado do tenantId (único por construção).
  const unico = `barbearia-${tenantId.slice(0, 12).toLowerCase()}`;
  await setDoc(doc(db, "slugs", unico), { tenantId, createdAt: serverTimestamp() });
  return unico;
}

export interface BootstrapParams {
  uid: string;
  email: string;
  nome: string; // nome do dono
  barbeariaNome: string;
  telefone: string;
  plano: PlanoSaaS;
}

export async function bootstrapTenant(params: BootstrapParams): Promise<{ tenantId: string; slug: string }> {
  const tenantRef = doc(collection(db, "tenants"));
  const tenantId = tenantRef.id;
  const slug = await reservarSlug(slugify(params.barbeariaNome), tenantId);

  // Commit 1 — identidade. Precisa vir ANTES do catálogo: as regras das
  // subcoleções chamam owns()/get(users/{uid}), que só passa a existir depois
  // deste commit (num batch, as regras avaliam contra o estado pré-batch).
  const identidade = writeBatch(db);

  // Doc do tenant (público — sem segredos).
  identidade.set(tenantRef, {
    nome: params.barbeariaNome,
    slug,
    cidade: "",
    monograma: monograma(params.barbeariaNome),
    plano: params.plano,
    status: "trial",
    mrr: params.plano === "Pro" ? "R$ 249" : "R$ 129",
    agendamentosMes: "0",
    ownerUid: params.uid,
    createdAt: serverTimestamp(),
  });

  // Perfil do usuário (role admin — superAdmin nunca é auto-concedido).
  identidade.set(doc(db, "users", params.uid), {
    role: "admin",
    tenantId,
    nome: params.nome,
    email: params.email,
    createdAt: serverTimestamp(),
  });

  await identidade.commit();
  // (o slug já foi reservado atomicamente em reservarSlug, antes deste commit)

  // Commit 2 — catálogo inicial (agora owns(tenantId) já é verdadeiro).
  const catalogo = writeBatch(db);

  // Config da barbearia.
  catalogo.set(doc(db, "tenants", tenantId, "config", "main"), {
    nome: params.barbeariaNome,
    endereco: BARBEARIA.endereco,
    telefone: params.telefone,
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  });

  // Serviços iniciais.
  seedServicos.forEach((s) => {
    catalogo.set(doc(collection(db, "tenants", tenantId, "servicos")), {
      nome: s.nome,
      duracaoMin: s.duracaoMin,
      preco: s.preco,
      createdAt: serverTimestamp(),
    });
  });

  // Barbeiros iniciais (mescla cor/iniciais com rating/especialidade do booking).
  agendaBarbeiros.forEach((b) => {
    const bk = bookingBarbeiros.find((x) => x.nome === b.nome);
    catalogo.set(doc(collection(db, "tenants", tenantId, "barbeiros")), {
      nome: b.nome,
      iniciais: b.iniciais,
      cor: b.cor,
      ...(bk?.rating ? { rating: bk.rating } : {}),
      ...(bk?.especialidade ? { especialidade: bk.especialidade } : {}),
      createdAt: serverTimestamp(),
    });
  });

  // Planos de assinatura (tiers).
  catalogo.set(doc(db, "tenants", tenantId, "planosTiers", "basico"), {
    id: "basico",
    nome: "Básico",
    preco: 129,
    descricao: "1 unidade · até 3 barbeiros",
  });
  catalogo.set(doc(db, "tenants", tenantId, "planosTiers", "pro"), {
    id: "pro",
    nome: "Pro",
    preco: 249,
    descricao: "Multi-unidade · ilimitado",
  });

  // Planos de assinatura do cliente (mensalidade) — id estável = id do seed.
  seedPlanos.forEach((p) => {
    catalogo.set(doc(db, "tenants", tenantId, "planos", p.id), {
      nome: p.nome,
      valor: p.valor,
      diaVencimento: p.diaVencimento ?? 5,
      ativo: p.ativo ?? true,
      createdAt: serverTimestamp(),
    });
  });

  await catalogo.commit();
  return { tenantId, slug };
}

/**
 * Cria uma barbearia de DEMONSTRAÇÃO para o superAdmin inspecionar (todas as
 * telas de tenant: dashboard, agenda, clientes, pagamentos, etc.). Diferente do
 * onboarding, NÃO grava users/{uid} — o superAdmin não vira admin dela; ele
 * apenas "entra" via impersonação (enterTenant). Já vem populada (catálogo +
 * clientes + agenda de hoje) para as telas não ficarem vazias.
 *
 * Roda num único writeBatch: para o superAdmin as regras já liberam tudo
 * (canManage = isSuper) antes do batch, então não precisa do split em 2 commits.
 */
export async function seedDemoTenant(params: { ownerUid: string; nome?: string }): Promise<{ tenantId: string; slug: string }> {
  const nome = (params.nome ?? "Barbearia Demo").trim() || "Barbearia Demo";
  const tenantRef = doc(collection(db, "tenants"));
  const tenantId = tenantRef.id;
  const slug = await reservarSlug(slugify(nome), tenantId);

  const batch = writeBatch(db);

  // Doc do tenant (ownerUid = super: exigido pela regra de create de /tenants).
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
    createdAt: serverTimestamp(),
  });
  // (slug já reservado atomicamente em reservarSlug)

  // Config.
  batch.set(doc(db, "tenants", tenantId, "config", "main"), {
    nome,
    endereco: BARBEARIA.endereco,
    telefone: "(11) 3060-1200",
    horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] },
  });

  // Serviços (id estável = id do mock).
  seedServicos.forEach((s) => {
    batch.set(doc(db, "tenants", tenantId, "servicos", s.id), {
      nome: s.nome,
      duracaoMin: s.duracaoMin,
      preco: s.preco,
      createdAt: serverTimestamp(),
    });
  });

  // Barbeiros (id = slug do nome, para casar com os agendamentos abaixo).
  const barbeiroIds = agendaBarbeiros.map((b) => slugify(b.nome));
  agendaBarbeiros.forEach((b, i) => {
    const bk = bookingBarbeiros.find((x) => x.nome === b.nome);
    batch.set(doc(db, "tenants", tenantId, "barbeiros", barbeiroIds[i]), {
      nome: b.nome,
      iniciais: b.iniciais,
      cor: b.cor,
      ...(bk?.rating ? { rating: bk.rating } : {}),
      ...(bk?.especialidade ? { especialidade: bk.especialidade } : {}),
      createdAt: serverTimestamp(),
    });
  });

  // Clientes.
  seedClientes.forEach((cli) => {
    const { id, ...rest } = cli;
    batch.set(doc(db, "tenants", tenantId, "clientes", id), { ...rest, createdAt: serverTimestamp() });
  });

  // Agenda de hoje (deriva dos blocos do mock; barbeiroId casa com os ids acima).
  agendaBlocos.forEach((blocos, idx) => {
    const barbeiroId = barbeiroIds[idx];
    blocos.forEach((bl) => {
      const nomeServico = bl.servico.split(" · ")[0].trim();
      batch.set(doc(collection(db, "tenants", tenantId, "agendamentos")), {
        date: HOJE_ISO,
        barbeiroId,
        clienteNome: bl.cliente,
        servico: nomeServico,
        servicoId: seedServicos.find((s) => s.nome === nomeServico)?.id ?? null,
        inicio: bl.inicio,
        duracaoMin: bl.duracaoMin,
        status: bl.status,
        origem: "admin",
        createdAt: serverTimestamp(),
      });
    });
  });

  // Planos de assinatura (tiers SaaS).
  batch.set(doc(db, "tenants", tenantId, "planosTiers", "basico"), { id: "basico", nome: "Básico", preco: 129, descricao: "1 unidade · até 3 barbeiros" });
  batch.set(doc(db, "tenants", tenantId, "planosTiers", "pro"), { id: "pro", nome: "Pro", preco: 249, descricao: "Multi-unidade · ilimitado" });

  // Planos de assinatura do cliente (mensalidade).
  seedPlanos.forEach((p) => {
    batch.set(doc(db, "tenants", tenantId, "planos", p.id), {
      nome: p.nome,
      valor: p.valor,
      diaVencimento: p.diaVencimento ?? 5,
      ativo: p.ativo ?? true,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { tenantId, slug };
}
