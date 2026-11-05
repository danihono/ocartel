import type { CSSProperties } from "react";
import { Navalha, Pente, Pincel, Tesoura } from "./Desenhos";
import type { IconeServico } from "@/lib/painel";

/** O desenho de um serviço (corte, barba, combo, química, acabamento). */
export function DesenhoServico({ icone, size = 18, style }: { icone: IconeServico; size?: number; style?: CSSProperties }) {
  switch (icone) {
    case "navalha":
      return <Navalha size={size * 0.62} stroke={1.9} style={style} />;
    case "pincel":
      return <Pincel size={size} style={style} />;
    case "pente":
      return <Pente size={size * 0.6} stroke={1.9} style={style} />;
    case "combo":
      return (
        <span style={{ position: "relative", display: "inline-block", width: size * 1.15, height: size, ...style }}>
          <Tesoura size={size * 0.85} style={{ position: "absolute", left: 0, top: 0 }} />
          <Navalha size={size * 0.42} stroke={2.1} style={{ position: "absolute", right: 0, bottom: 0 }} />
        </span>
      );
    default:
      return <Tesoura size={size} style={style} />;
  }
}

/**
 * Fileira de desenhos: cada um vale `unidade`. O último, se sobrar fração, aparece apagado
 * — é o "meio ícone" dos infográficos.
 */
export function Pictograma({ valor, unidade, icone, cor, size = 17 }: { valor: number; unidade: number; icone: IconeServico; cor: string; size?: number }) {
  const inteiros = Math.floor(valor / unidade);
  const resto = valor / unidade - inteiros;
  const itens = Array.from({ length: inteiros + (resto > 0.001 ? 1 : 0) }, (_, i) => (i < inteiros ? 1 : resto));
  return (
    <div aria-hidden style={{ display: "flex", flexWrap: "wrap", gap: 5, color: cor, minHeight: size }}>
      {itens.map((f, i) => (
        <span key={i} style={{ opacity: f === 1 ? 1 : 0.28 + f * 0.4, display: "inline-flex" }}>
          <DesenhoServico icone={icone} size={size} />
        </span>
      ))}
    </div>
  );
}
