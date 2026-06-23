import { c, font } from "@/lib/theme";

/** Monogram seal — the "OC" club mark. */
export function Seal({
  size = 40,
  label = "OC",
  color = c.brass,
  fontSize,
}: {
  size?: number;
  label?: string;
  color?: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.cinzel,
        fontWeight: 700,
        fontSize: fontSize ?? Math.round(size * 0.33),
        color,
        flex: "none",
      }}
    >
      {label}
    </div>
  );
}

/** Avatar with initials. */
export function Avatar({
  initials,
  size = 38,
  bg = "#EFE4D2",
  color = c.brown2,
  fontSize,
}: {
  initials: string;
  size?: number;
  bg?: string;
  color?: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: fontSize ?? Math.round(size * 0.34),
        fontWeight: 700,
        flex: "none",
      }}
    >
      {initials}
    </div>
  );
}
