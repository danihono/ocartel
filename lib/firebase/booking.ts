// Leitura pública do catálogo de uma barbearia pela URL /book/[slug].
// Usa o SDK do cliente — as regras liberam leitura pública de
// slugs/{slug}, tenants/{id}, servicos e barbeiros.

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./config";
import type { Barbeiro, Servico } from "@/lib/types";

export interface BookingCatalog {
  tenantId: string;
  nome: string;
  endereco: string;
  abre: string;
  fecha: string;
  servicos: Servico[];
  barbeiros: Barbeiro[];
}

export async function carregarCatalogoPorSlug(slug: string): Promise<BookingCatalog | null> {
  const slugSnap = await getDoc(doc(db, "slugs", slug));
  if (!slugSnap.exists()) return null;
  const tenantId = slugSnap.data().tenantId as string;

  const [tenantSnap, configSnap, servicosSnap, barbeirosSnap] = await Promise.all([
    getDoc(doc(db, "tenants", tenantId)),
    getDoc(doc(db, "tenants", tenantId, "config", "main")),
    getDocs(collection(db, "tenants", tenantId, "servicos")),
    getDocs(collection(db, "tenants", tenantId, "barbeiros")),
  ]);
  if (!tenantSnap.exists()) return null;

  const cfg = configSnap.exists() ? configSnap.data() : null;
  const horario = (cfg?.horario ?? {}) as { abre?: string; fecha?: string };

  return {
    tenantId,
    nome: (cfg?.nome as string) ?? (tenantSnap.data().nome as string) ?? "Barbearia",
    endereco: (cfg?.endereco as string) ?? "",
    abre: horario.abre ?? "09:00",
    fecha: horario.fecha ?? "19:00",
    servicos: servicosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as Servico[],
    barbeiros: barbeirosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as Barbeiro[],
  };
}
