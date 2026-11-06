"use client";

import { useId, useRef, useState } from "react";
import { c } from "@/lib/theme";
import { formatBRL } from "@/lib/selectors";
import { isoParaDiaMes, isoParaLabel } from "@/lib/date";
import type { DiaMovimento } from "@/lib/painel";
import { Tesoura } from "./Desenhos";

export type ModoMovimento = "cortes" | "receita";

const W = 560;
const H = 200;
const PAD = 22;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Gráfico do movimento por dia (cortes concluídos ou receita). A tesoura marca o último
 * dia, o melhor dia do período ganha uma etiqueta, e passar o dedo/mouse mostra o dia com
 * os dois números juntos — cortes E dinheiro, que é o que importa numa barbearia.
 */
export function GraficoMovimento({ serie, modo, height = 210 }: { serie: DiaMovimento[]; modo: ModoMovimento; height?: number }) {
  const gid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const valores = serie.map((d) => (modo === "cortes" ? d.cortes : d.receita));
  const max = Math.max(...valores, 0);
  const vazio = max === 0;
  const n = serie.length;

  // Cortes começam do zero (contagem); a curva sobe a partir da base.
  const pts = valores.map((v, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    const y = H - PAD - (max ? (v / max) * (H - PAD * 2) : (H - PAD * 2) / 2);
    return [x, y] as const;
  });
  const linha = pts
    .map(([x, y], i) => {
      if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      return `C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${linha} L${W} ${H} L0 ${H} Z`;

  const ult = n - 1;
  const melhor = vazio ? -1 : valores.indexOf(max);
  const pctX = (i: number) => (pts[i][0] / W) * 100;
  const pctY = (i: number) => (pts[i][1] / H) * 100;
  const fmt = (v: number) => (modo === "cortes" ? plural(v, "corte", "cortes") : formatBRL(v));

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || n < 2) return;
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHover(Math.round(f * (n - 1)));
  }

  const marcos = n <= 5 ? serie.map((_, i) => i) : [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1)));
  const total = valores.reduce((s, v) => s + v, 0);

  return (
    <div>
      <div
        ref={ref}
        className="oc-grafico"
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={vazio ? "Sem movimento no período" : `${fmt(total)} no período; melhor dia ${isoParaDiaMes(serie[melhor].dia)} com ${fmt(max)}`}
        style={{ position: "relative", height, touchAction: "pan-y", cursor: vazio ? "default" : "crosshair" }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", overflow: "visible" }}>
          <defs>
            <linearGradient id={`mv-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: c.accent, stopOpacity: 0.24 }} />
              <stop offset="100%" style={{ stopColor: c.accent, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={0} x2={W} y1={PAD + f * (H - PAD * 2)} y2={PAD + f * (H - PAD * 2)} style={{ stroke: c.borderSoft }} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          ))}
          {vazio ? (
            <line x1={0} x2={W} y1={H / 2} y2={H / 2} style={{ stroke: c.ink4 }} strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
          ) : (
            <>
              <path d={area} fill={`url(#mv-${gid})`} />
              <path d={linha} fill="none" style={{ stroke: c.accent }} strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>

        {vazio ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 999, padding: "8px 14px 8px 10px", color: c.ink3, fontSize: 12.5 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: c.forest, color: c.neon, display: "grid", placeItems: "center" }}>
                <Tesoura size={15} stroke={2} />
              </span>
              {modo === "cortes" ? "Os cortes concluídos aparecem aqui." : "O que entrar no caixa aparece aqui."}
            </div>
          </div>
        ) : (
          <>
            {/* melhor dia */}
            {melhor !== ult && hover === null ? (
              <div
                style={{
                  position: "absolute",
                  left: `${Math.max(12, Math.min(88, pctX(melhor)))}%`,
                  top: `${pctY(melhor)}%`,
                  transform: "translate(-50%, calc(-100% - 12px))",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  background: c.surface,
                  border: `1px solid ${c.accentLine}`,
                  color: c.ink,
                  borderRadius: 999,
                  padding: "3px 10px 3px 6px",
                  fontSize: 11,
                  fontWeight: 600,
                  boxShadow: "var(--oc-shadow-sm)",
                  pointerEvents: "none",
                }}
              >
                <span style={{ color: c.accent, display: "inline-flex" }}>
                  <Tesoura size={13} stroke={2.1} />
                </span>
                melhor dia · {fmt(max)}
              </div>
            ) : null}

            {/* tesoura no último dia */}
            <span
              aria-hidden
              className="oc-tesoura-fim"
              style={{
                position: "absolute",
                left: `${pctX(ult)}%`,
                top: `${pctY(ult)}%`,
                width: 26,
                height: 26,
                marginLeft: -13,
                marginTop: -13,
                borderRadius: "50%",
                background: c.forest,
                color: c.neon,
                display: "grid",
                placeItems: "center",
                boxShadow: `0 0 0 4px ${c.accentTint}`,
                pointerEvents: "none",
              }}
            >
              <Tesoura size={14} stroke={2.1} />
            </span>

            {/* hover */}
            {hover !== null ? (
              <>
                <span style={{ position: "absolute", top: 0, bottom: 0, left: `${pctX(hover)}%`, width: 1, background: c.border, pointerEvents: "none" }} />
                <span
                  style={{
                    position: "absolute",
                    left: `${pctX(hover)}%`,
                    top: `${pctY(hover)}%`,
                    width: 10,
                    height: 10,
                    margin: "-5px 0 0 -5px",
                    borderRadius: "50%",
                    background: c.surface,
                    border: `2.5px solid ${c.accent}`,
                    pointerEvents: "none",
                  }}
                />
                <div
                  className="oc-pop"
                  style={{
                    position: "absolute",
                    left: `${Math.max(10, Math.min(90, pctX(hover)))}%`,
                    top: 0,
                    transform: "translateX(-50%)",
                    background: c.forest,
                    color: c.darkText,
                    borderRadius: 14,
                    padding: "8px 12px",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    boxShadow: "var(--oc-shadow-pop)",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{isoParaLabel(serie[hover].dia)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: c.neon }}>
                    <Tesoura size={12} stroke={2.1} />
                    <span className="num">{plural(serie[hover].cortes, "corte", "cortes")}</span>
                  </div>
                  <div className="num" style={{ marginTop: 2, color: c.darkMuted }}>{formatBRL(serie[hover].receita)} recebidos</div>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="num" style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: c.ink4 }}>
        {marcos.map((i, k) => (
          <span key={`${i}-${k}`}>{isoParaDiaMes(serie[i].dia)}</span>
        ))}
      </div>
    </div>
  );
}
