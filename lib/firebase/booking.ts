// Leitura pública do catálogo de uma barbearia pela URL /book/[slug].
//
// Usa o SDK do cliente. O que é público (firestore.rules) é o mínimo da vitrine: `get` em
// slugs/{slug} e em config/main, e a listagem de servicos e barbeiros. O DOC DO TENANT não
// entra aqui de propósito — ele carrega ownerUid, plano, status e MRR, que não são da
// vitrine. O nome da barbearia vem de `config/main`, onde ele também está.

import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./config";
import type { Barbeiro, Servico } from "@/lib/types";

export interface BookingCatalog {
  tenantId: string;
  nome: string;
  endereco: string;
  abre: string;
  fecha: string;
  /** 7 posições Seg..Dom; dia false = barbearia fechada (não ofertar). */
  diasAtivos: boolean[];
  servicos: Servico[];
  barbeiros: Barbeiro[];
}

export async function carregarCatalogoPorSlug(slug: string): Promise<BookingCatalog | null> {
  const slugSnap = await getDoc(doc(db, "slugs", slug));
  if (!slugSnap.exists()) return null;
  const tenantId = slugSnap.data().tenantId as string;

  const [configSnap, servicosSnap, barbeirosSnap] = await Promise.all([
    getDoc(doc(db, "tenants", tenantId, "config", "main")),
    getDocs(collection(db, "tenants", tenantId, "servicos")),
    getDocs(collection(db, "tenants", tenantId, "barbeiros")),
  ]);
  if (!configSnap.exists()) return null;

  const cfg = configSnap.data();
  const horario = (cfg?.horario ?? {}) as { abre?: string; fecha?: string; diasAtivos?: boolean[] };

  return {
    tenantId,
    nome: (cfg?.nome as string) ?? "Barbearia",
    endereco: (cfg?.endereco as string) ?? "",
    abre: horario.abre ?? "09:00",
    fecha: horario.fecha ?? "19:00",
    diasAtivos: Array.isArray(horario.diasAtivos) && horario.diasAtivos.length === 7
      ? horario.diasAtivos
      : [true, true, true, true, true, true, true],
    servicos: servicosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as Servico[],
    barbeiros: barbeirosSnap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as Barbeiro[],
  };
}
