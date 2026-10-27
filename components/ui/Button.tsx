"use client";

import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

// Botões em pílula. O visual mora em app/globals.css (.oc-btn-*); aqui só a escolha
// da variante e o estado "salvando".
//   primary → floresta com ícone neon (no escuro: neon com texto floresta)
//   ghost   → superfície com borda fina
//   pill    → ação suave no tint do acento
//   neon    → CTA neon (páginas públicas e login)
//   danger  → ação destrutiva
//   dark    → apelido de ghost (o tema agora é global)
type Variant = "primary" | "ghost" | "pill" | "neon" | "danger" | "dark";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconName;
  children?: ReactNode;
};

export function Button({ variant = "primary", size = "md", block, icon, className, loading = false, disabled, children, ...rest }: Props) {
  const v = variant === "dark" ? "ghost" : variant;
  const cls = ["oc-btn", `oc-btn-${v}`, size === "sm" && "oc-btn-sm", block && "oc-btn-block", className].filter(Boolean).join(" ");
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading ? "true" : undefined} className={cls}>
      {icon && !loading ? <Icon name={icon} size={size === "sm" ? 15 : 16} stroke={2} /> : null}
      {loading ? "Salvando…" : children}
    </button>
  );
}
