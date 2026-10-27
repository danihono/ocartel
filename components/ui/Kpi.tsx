import type { ReactNode } from "react";
import { Card } from "./Card";

/**
 * Tile de KPI. `hero` = o cartão floresta "barber pole" (um por tela, o número que
 * importa). `foot` recebe o visual de rodapé: sparkline, mini-barras, medidor.
 */
export function Kpi({
  label,
  value,
  sub,
  delta,
  hero = false,
  foot,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { text: string; tone: "up" | "down" | "flat" };
  hero?: boolean;
  foot?: ReactNode;
}) {
  return (
    <Card hero={hero} lift={!hero} pad="18px 20px" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 138 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="oc-label">{label}</span>
        {delta ? <Delta {...delta} onHero={hero} /> : null}
      </div>
      <div className="num" style={{ fontSize: hero ? 40 : 30, fontWeight: 500, letterSpacing: "-0.05em", lineHeight: 1, color: hero ? "var(--oc-on-forest)" : "var(--oc-ink)" }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: hero ? "var(--oc-on-forest-dim)" : "var(--oc-muted)" }}>{sub}</div> : null}
      {foot ? <div style={{ marginTop: "auto" }}>{foot}</div> : null}
    </Card>
  );
}

export function Delta({ text, tone, onHero = false }: { text: string; tone: "up" | "down" | "flat"; onHero?: boolean }) {
  const cores = onHero
    ? { up: ["var(--oc-neon)", "rgba(183,255,24,.14)"], down: ["#FFB4C0", "rgba(255,180,192,.14)"], flat: ["var(--oc-on-forest-dim)", "rgba(255,255,255,.08)"] }
    : { up: ["var(--oc-green-ink)", "var(--oc-green-tint)"], down: ["var(--oc-red-ink)", "var(--oc-red-tint)"], flat: ["var(--oc-sub)", "var(--oc-raised)"] };
  const [fg, bg] = cores[tone];
  return (
    <span className="num" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 500, borderRadius: 999, padding: "2px 8px", color: fg, background: bg, whiteSpace: "nowrap" }}>
      {tone === "up" ? "▲ " : tone === "down" ? "▼ " : ""}
      {text}
    </span>
  );
}

/** Medidor fino (trilha + preenchimento). */
export function Meter({ pct, onHero = false }: { pct: number; onHero?: boolean }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: onHero ? "rgba(255,255,255,.12)" : "var(--oc-raised)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", borderRadius: 999, background: onHero ? "var(--oc-neon)" : "var(--oc-accent)", transition: "width .5s var(--oc-ease)" }} />
    </div>
  );
}

/** Mini-barras: só a última (a atual) leva a cor do acento. */
export function MiniBars({ values, height = 40 }: { values: number[]; height?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height }}>
      {values.map((v, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(8, (v / max) * 100)}%`,
            borderRadius: 4,
            background: i === values.length - 1 ? "var(--oc-accent)" : "var(--oc-raised)",
          }}
        />
      ))}
    </div>
  );
}
