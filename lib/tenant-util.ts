// Peças puras da criação de uma barbearia, usadas tanto pelo onboarding no navegador
// (lib/firebase/bootstrap.ts) quanto pela criação no console do super admin (Admin SDK,
// app/super-admin/actions.ts). Ficam aqui para os dois caminhos gerarem o mesmo
// monograma e disputarem os mesmos slugs — duas cópias acabariam divergindo.

/** Iniciais que aparecem no selo da barbearia: "Cartel Barbearia" → "CB". */
export function monograma(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OC";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Slugs a tentar, em ordem, para o /book/[slug] da barbearia: o base e, em caso de
 * colisão, o base sufixado com pedaços do tenantId.
 */
export function candidatosSlug(base: string, tenantId: string): string[] {
  const raiz = base || "barbearia";
  return [raiz, `${raiz}-${tenantId.slice(0, 4).toLowerCase()}`, `${raiz}-${tenantId.slice(0, 8).toLowerCase()}`];
}

/** Último recurso quando todos os candidatos estão tomados: único por construção. */
export function slugDeReserva(tenantId: string): string {
  return `barbearia-${tenantId.slice(0, 12).toLowerCase()}`;
}

/** Horário padrão de uma barbearia nova (segunda a sábado). */
export const HORARIO_PADRAO = { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] };

/** Tiers da assinatura SaaS do O Cartel — estrutural, gravado em toda barbearia nova. */
export const PLANOS_TIERS = [
  { id: "basico", nome: "Básico", preco: 129, descricao: "1 unidade · até 3 barbeiros" },
  { id: "pro", nome: "Pro", preco: 249, descricao: "Multi-unidade · ilimitado" },
] as const;
