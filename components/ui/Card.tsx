import type { CSSProperties, ReactNode } from "react";

/** Cartão branco com borda fina e sombra larga e baixa. `hero` = floresta "barber pole". */
export function Card({
  children,
  style,
  pad = "20px 22px",
  hero = false,
  lift = false,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: string;
  hero?: boolean;
  lift?: boolean;
  className?: string;
}) {
  const cls = [hero ? "oc-card-hero" : "oc-card", lift && "oc-lift", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ padding: pad, ...style }}>
      {children}
    </div>
  );
}

export function CardTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const titulo = (
    <div style={{ minWidth: 0 }}>
      <h2 className="oc-h2">{children}</h2>
      {sub ? <div className="oc-h2-sub">{sub}</div> : null}
    </div>
  );
  if (!right) return titulo;
  return (
    <div className="oc-card-head">
      {titulo}
      {right}
    </div>
  );
}
