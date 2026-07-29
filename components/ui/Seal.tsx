import type { CSSProperties } from "react";
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

/**
 * Avatar: mostra a foto quando existe e cai nas iniciais quando não.
 * `src` é opcional, então as chamadas que já existiam seguem funcionando.
 */
export function Avatar({
  initials,
  src,
  size = 38,
  bg = c.brassSoft,
  color = c.brassDeep,
  fontSize,
}: {
  initials: string;
  src?: string;
  size?: number;
  bg?: string;
  color?: string;
  fontSize?: number;
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
  };

  if (src) {
    // <img> puro, e não next/image: as URLs vêm do Storage com token de
    // download na query string, e configurar cada host no next.config para um
    // avatar de 38px não paga o próprio custo.
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ver comentário acima
      <img
        src={src}
        alt={initials}
        style={{ ...base, objectFit: "cover", background: bg }}
        // Foto que não carrega (arquivo removido, link expirado) não pode
        // deixar um quadrado quebrado no lugar do rosto.
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }

  return (
    <div style={{ ...base, background: bg, color, fontSize: fontSize ?? Math.round(size * 0.34), fontWeight: 700 }}>
      {initials}
    </div>
  );
}
