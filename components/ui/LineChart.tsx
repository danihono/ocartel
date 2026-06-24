import { c } from "@/lib/theme";

/** Minimal area/line chart rendered as inline SVG. No dependencies. */
export function LineChart({
  data,
  stroke = c.accent,
  fill = "rgba(14,59,51,.12)",
  gridColor = "#F0E7D8",
  gridLines = [60, 120, 180],
  height = 188,
  showLastDot = true,
}: {
  data: number[];
  stroke?: string;
  fill?: string;
  gridColor?: string;
  gridLines?: number[];
  height?: number;
  showLastDot?: boolean;
}) {
  const W = 560;
  const H = 200;
  const pad = 16;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - pad - ((v - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      {gridLines.map((y) => (
        <line key={y} x1={0} y1={y} x2={W} y2={y} stroke={gridColor} strokeWidth={1} />
      ))}
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {showLastDot ? <circle cx={last[0]} cy={last[1]} r={4.5} fill={stroke} /> : null}
    </svg>
  );
}
