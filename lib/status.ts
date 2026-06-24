import { c } from "./theme";
import type { AgendamentoStatus, ClienteTag, TenantStatus } from "./types";

export const statusMeta: Record<
  Exclude<AgendamentoStatus, "concluido" | "cancelado" | "bloqueio">,
  { label: string; fg: string; bg: string }
> = {
  agendado: { label: "Agendado", fg: "#0A5560", bg: "#E6F6F8" },
  confirmado: { label: "Confirmado", fg: c.greenText, bg: c.greenBg },
  atendimento: { label: "Em atendimento", fg: c.amberText, bg: c.amberBg },
  noshow: { label: "No-show", fg: c.redText, bg: c.redBg },
};

// Calendar block palettes (background + left bar + text colors)
export const blocoMeta: Record<
  AgendamentoStatus,
  { bg: string; bar: string; title: string; sub: string }
> = {
  confirmado: { bg: "#E3F5EE", bar: "#0EA37A", title: "#0C5C46", sub: "#3F7A6A" },
  agendado: { bg: "#E6F6F8", bar: "#0FB6C8", title: "#0A5560", sub: "#3E7480" },
  atendimento: { bg: "#FBF1DC", bar: "#E0A21A", title: "#7A5610", sub: "#9A6E0E" },
  noshow: { bg: "#FDEAEA", bar: "#E5484D", title: "#A8333A", sub: "#C0353A" },
  bloqueio: { bg: "repeating-linear-gradient(45deg,#E7ECEE,#E7ECEE 7px,#DCE3E6 7px,#DCE3E6 14px)", bar: "#9AA7A4", title: "#51605D", sub: "#74827F" },
  concluido: { bg: "#EDF1F3", bar: "#5B6B69", title: "#2C3A37", sub: "#6B7A77" },
  cancelado: { bg: "#EFF2F3", bar: "#9AA7A4", title: "#5B6B69", sub: "#82908D" },
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
  ativo: { label: "Ativo", fg: c.darkGreen, bg: "rgba(52,214,166,.18)" },
  trial: { label: "Trial", fg: c.darkAmber, bg: "rgba(231,192,120,.18)" },
  atrasado: { label: "Atrasado", fg: c.darkRed, bg: "rgba(240,151,138,.20)" },
};

// "09:00" -> minutes since 09:00, used to position calendar blocks (30min = 44px)
export const PX_PER_MIN = 44 / 30;
export function minutosDesde9(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h - 9) * 60 + m;
}
