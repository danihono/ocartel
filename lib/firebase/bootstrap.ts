// Bootstrap de um novo tenant no onboarding: cria o doc do tenant, reserva o
// slug público, cria o perfil do usuário (role "admin") e semeia o catálogo
// inicial (serviços, barbeiros, config, planos) — tudo num writeBatch atômico.

import { collection, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./config";
import { slug as slugify } from "@/lib/selectors";
import { agendaBarbeiros, bookingBarbeiros, BARBEARIA, servicos as seedServicos } from "@/lib/mock-data";
import type { PlanoSaaS } from "@/lib/types";

function monograma(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Garante um slug único reservando slugs/{slug} -> tenantId. */
async function reservarSlug(base: string, tenantId: string): Promise<string> {
  const candidato = base || "barbearia";
  const existe = await getDoc(doc(db, "slugs", candidato));
  if (!existe.exists()) return candidato;
  return `${candidato}-${tenantId.slice(0, 4).toLowerCase()}`;
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

  // Reserva do slug público.
  identidade.set(doc(db, "slugs", slug), { tenantId, createdAt: serverTimestamp() });

  // Perfil do usuário (role admin — superAdmin nunca é auto-concedido).
  identidade.set(doc(db, "users", params.uid), {
    role: "admin",
    tenantId,
    nome: params.nome,
    email: params.email,
    createdAt: serverTimestamp(),
  });

  await identidade.commit();

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

  await catalogo.commit();
  return { tenantId, slug };
}
