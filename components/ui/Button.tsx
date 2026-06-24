"use client";

import type { CSSProperties } from "react";
import { c } from "@/lib/theme";

type Variant = "primary" | "ghost" | "pill" | "dark";

export const btnPrimary: CSSProperties = {
  border: "none",
  cursor: "pointer",
  background: c.primaryBtnBg,
  color: c.primaryBtnText,
  padding: "11px 16px",
  borderRadius: 12,
  fontSize: 13.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
  boxShadow: "0 4px 14px rgba(14,163,122,.22)",
};

export const btnGhost: CSSProperties = {
  border: `1px solid ${c.borderInput}`,
  cursor: "pointer",
  background: c.surface,
  color: c.ink,
  padding: "10px 15px",
  borderRadius: 12,
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

export function Button({ variant = "primary", style, className, ...rest }: Props) {
  const cls = `oc-btn oc-btn-${variant}${className ? ` ${className}` : ""}`;
  return <button {...rest} className={cls} style={{ ...variants[variant], ...(rest.disabled ? { opacity: 0.5, cursor: "not-allowed" } : null), ...style }} />;
}
