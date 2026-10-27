import { c } from "./theme";
import type { AgendamentoStatus, ClienteTag, TenantStatus } from "./types";

// Rótulo humano de cada status — FONTE ÚNICA. A chave gravada no Firestore
// continua sendo `noshow`; só o texto mudou para "Não compareceu".
export const STATUS_LABEL: Record<AgendamentoStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  atendimento: "Em atendimento",
  concluido: "Concluído",
  noshow: "Não compareceu",
  cancelado: "Cancelado",
  bloqueio: "Bloqueio",
};

export const statusMeta: Record<
  Exclude<AgendamentoStatus, "concluido" | "cancelado" | "bloqueio">,
  { label: string; fg: string; bg: string }
> = {
  agendado: { label: STATUS_LABEL.agendado, fg: c.blueText, bg: c.blueBg },
  confirmado: { label: STATUS_LABEL.confirmado, fg: c.greenText, bg: c.greenBg },
  atendimento: { label: STATUS_LABEL.atendimento, fg: c.amberText, bg: c.amberBg },
  noshow: { label: STATUS_LABEL.noshow, fg: c.redText, bg: c.redBg },
};

// Paleta dos blocos da agenda (fundo + barra lateral + textos). Tudo em variável:
// segue o tema claro/escuro.
export const blocoMeta: Record<
  AgendamentoStatus,
  { bg: string; bar: string; title: string; sub: string }
> = {
  confirmado: { bg: c.greenBg, bar: c.green, title: c.greenText, sub: c.ink2 },
  agendado: { bg: c.blueBg, bar: c.blue, title: c.blueText, sub: c.ink2 },
  atendimento: { bg: c.amberBg, bar: c.amber, title: c.amberText, sub: c.ink2 },
  noshow: { bg: c.redBg, bar: c.red, title: c.redText, sub: c.ink2 },
  bloqueio: {
    bg: `repeating-linear-gradient(45deg, ${c.surfaceAlt}, ${c.surfaceAlt} 7px, ${c.borderSoft} 7px, ${c.borderSoft} 14px)`,
    bar: c.ink4,
    title: c.ink2,
    sub: c.ink3,
  },
  concluido: { bg: c.surfaceAlt, bar: c.ink3, title: c.ink, sub: c.ink3 },
  cancelado: { bg: c.surfaceAlt, bar: c.ink4, title: c.ink3, sub: c.ink4 },
};

export function tagMeta(tag: ClienteTag): { fg: string; bg: string } | null {
  if (!tag) return null;
  const map: Record<Exclude<ClienteTag, "">, { fg: string; bg: string }> = {
    VIP: { fg: c.brassDeep, bg: c.brassSoft },
    Novo: { fg: c.blueText, bg: c.blueBg },
    Inadimplente: { fg: c.redText, bg: c.redBg },
  };
  return map[tag];
}

export const tenantStatusMeta: Record<TenantStatus, { label: string; fg: string; bg: string }> = {
  pendente: { label: "Aguardando aprovação", fg: c.amberText, bg: c.amberBg },
  ativo: { label: "Ativo", fg: c.greenText, bg: c.greenBg },
  trial: { label: "Trial", fg: c.blueText, bg: c.blueBg },
  atrasado: { label: "Atrasado", fg: c.redText, bg: c.redBg },
};

// 30min = 44px na grade da agenda.
export const PX_PER_MIN = 44 / 30;

function _min(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutos de `hhmm` desde a hora-base `base` (ex.: abertura da barbearia). */
export function minutosDesde(hhmm: string, base: string): number {
  return _min(hhmm) - _min(base);
}

/** Inverso de minutosDesde: minutos desde `base` -> "HH:MM". Usado no drag/resize/criação. */
export function horaDesde(min: number, base: string): string {
  const total = _min(base) + min;
  const h = Math.floor(total / 60);
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Wrappers ancorados em 09:00 (compat — base padrão da grade legada).
export const minutosDesde9 = (hhmm: string): number => minutosDesde(hhmm, "09:00");
export const horaDesde9 = (min: number): string => horaDesde(min, "09:00");
