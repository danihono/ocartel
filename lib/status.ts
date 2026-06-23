import { c } from "./theme";
import type { AgendamentoStatus, ClienteTag, TenantStatus } from "./types";

export const statusMeta: Record<
  Exclude<AgendamentoStatus, "concluido" | "cancelado" | "bloqueio">,
  { label: string; fg: string; bg: string }
> = {
  agendado: { label: "Agendado", fg: "#7A6B59", bg: "#F1E9DA" },
  confirmado: { label: "Confirmado", fg: c.greenText, bg: c.greenBg },
  atendimento: { label: "Em atendimento", fg: c.amberText, bg: c.amberBg },
  noshow: { label: "No-show", fg: c.redText, bg: c.redBg },
};

// Calendar block palettes (background + left bar + text colors)
export const blocoMeta: Record<
  AgendamentoStatus,
  { bg: string; bar: string; title: string; sub: string }
> = {
  confirmado: { bg: "#ECF1E7", bar: "#5E7A52", title: "#3a4a32", sub: "#5f6b54" },
  agendado: { bg: "#F4EEE2", bar: c.brass, title: "#5a4427", sub: "#8a7656" },
  atendimento: { bg: "#F7EEDC", bar: "#B07D2B", title: "#6b4a16", sub: "#8a6c33" },
  noshow: { bg: "#F5E8E4", bar: "#A35C4F", title: "#6e362d", sub: "#9a6b62" },
  bloqueio: { bg: "repeating-linear-gradient(45deg,#EAE3D8,#EAE3D8 7px,#E2DACB 7px,#E2DACB 14px)", bar: "#9A8C7D", title: "#5c5247", sub: "#857a6c" },
  concluido: { bg: "#EFE7DD", bar: c.leather, title: "#3a2c24", sub: "#8a7a68" },
  cancelado: { bg: "#EFEAE2", bar: "#9A8C7D", title: "#7a6b59", sub: "#9a8b79" },
};

export function tagMeta(tag: ClienteTag): { fg: string; bg: string } | null {
  if (!tag) return null;
  const map: Record<Exclude<ClienteTag, "">, { fg: string; bg: string }> = {
    VIP: { fg: c.amberText, bg: c.amberBg },
    Novo: { fg: c.greenText, bg: c.greenBg },
    Inadimplente: { fg: c.redText, bg: c.redBg },
  };
  return map[tag];
}

export const tenantStatusMeta: Record<TenantStatus, { label: string; fg: string; bg: string }> = {
  ativo: { label: "Ativo", fg: c.darkGreen, bg: "rgba(94,122,82,.22)" },
  trial: { label: "Trial", fg: c.darkAmber, bg: "rgba(201,168,106,.18)" },
  atrasado: { label: "Atrasado", fg: c.darkRed, bg: "rgba(163,92,79,.22)" },
};

// "09:00" -> minutes since 09:00, used to position calendar blocks (30min = 44px)
export const PX_PER_MIN = 44 / 30;
export function minutosDesde9(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h - 9) * 60 + m;
}
