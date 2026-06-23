import type { CSSProperties, ReactNode } from "react";
import { c, shadow } from "@/lib/theme";

export function Card({
  children,
  style,
  pad = "20px 22px",
}: {
  children: ReactNode;
  style?: CSSProperties;
  pad?: string;
}) {
  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 14,
        padding: pad,
        boxShadow: shadow.card,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div>
      <span style={{ fontFamily: "var(--font-spectral), serif", fontSize: 18, fontWeight: 600, color: "#241B12" }}>
        {children}
      </span>
      {sub ? <div style={{ fontSize: 12, color: c.ink3, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
