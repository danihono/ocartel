"use client";

import type { CSSProperties } from "react";
import { c } from "@/lib/theme";

type Variant = "primary" | "ghost" | "pill" | "dark";

export const btnPrimary: CSSProperties = {
  border: "none",
  cursor: "pointer",
  background: "#241711",
  color: "#F4EAD8",
  padding: "11px 16px",
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

export const btnGhost: CSSProperties = {
  border: `1px solid ${c.borderInput}`,
  cursor: "pointer",
  background: c.surface,
  color: "#3E2C20",
  padding: "10px 15px",
  borderRadius: 10,
  fontSize: 13.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

export const btnPill: CSSProperties = {
  border: "none",
  cursor: "pointer",
  background: c.brassSoft,
  color: c.brassDeep,
  padding: "8px 14px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const variants: Record<Variant, CSSProperties> = {
  primary: btnPrimary,
  ghost: btnGhost,
  pill: btnPill,
  dark: { ...btnGhost, background: "transparent", color: c.darkText, border: `1px solid ${c.darkLine}` },
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "primary", style, ...rest }: Props) {
  return <button {...rest} style={{ ...variants[variant], ...(rest.disabled ? { opacity: 0.5, cursor: "not-allowed" } : null), ...style }} />;
}
