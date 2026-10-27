import { useId } from "react";
import { c } from "@/lib/theme";

/**
 * Gráfico de área/linha em SVG inline, sem dependência. A área é um degradê da
 * própria cor do traço até transparente. As cores entram por `style` (e não por
 * atributo) para aceitar `var(--…)` do tema.
 */
export function LineChart({
  data,
  stroke = c.accent,
  gridColor = c.borderSoft,
  gridLines = [60, 120, 180],
  height = 188,
  showLastDot = true,
  glow = false,
}: {
  data: number[];
  stroke?: string;
  gridColor?: string;
  gridLines?: number[];
  height?: number;
  showLastDot?: boolean;
  /** Halo no traço: usado sobre o herói floresta. */
  glow?: boolean;
}) {
  const gid = useId().replace(/:/g, "");
  const W = 560;
  const H = 200;
  const pad = 16;

  // Série vazia ou com 1 ponto não desenha linha (evita NaN em (v-min)/span e i/(len-1)).
  // Desenha uma linha plana no meio como placeholder.
  if (data.length < 2) {
    const yMid = H / 2;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
        {gridLines.map((y) => (
          <line key={y} x1={0} y1={y} x2={W} y2={y} style={{ stroke: gridColor }} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} y1={yMid} x2={W} y2={yMid} style={{ stroke }} strokeWidth={1.5} strokeDasharray="4 5" opacity={0.5} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });

  // Curva suave (cúbica com tangente horizontal no meio de cada trecho).
  const line = pts
    .map(([x, y], i) => {
      if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
      const [px, py] = pts[i - 1];
      const mx = (px + x) / 2;
      return `C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <div style={{ position: "relative", height }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block", overflow: "visible" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`lc-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: stroke, stopOpacity: glow ? 0.32 : 0.22 }} />
            <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {gridLines.map((y) => (
          <line key={y} x1={0} y1={y} x2={W} y2={y} style={{ stroke: gridColor }} strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#lc-${gid})`} />
        <path
          d={line}
          fill="none"
          style={{ stroke, filter: glow ? "drop-shadow(0 0 6px rgba(183,255,24,.55))" : undefined }}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* O ponto fica fora do SVG esticado (preserveAspectRatio="none") para não virar elipse. */}
      {showLastDot ? (
        <span
          style={{
            position: "absolute",
            left: `${(last[0] / W) * 100}%`,
            top: `${(last[1] / H) * 100}%`,
            width: 10,
            height: 10,
            marginLeft: -5,
            marginTop: -5,
            borderRadius: "50%",
            background: stroke,
            boxShadow: `0 0 0 4px ${glow ? "rgba(183,255,24,.22)" : c.accentTint}`,
          }}
        />
      ) : null}
    </div>
  );
}
