import { useId, type CSSProperties } from "react";

// Desenhos de barbearia usados DENTRO dos gráficos do painel (não são ícones de interface:
// para isso há components/ui/Icon.tsx). Traço em `currentColor`, então a cor vem do
// contexto e acompanha o tema.

interface Props {
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
  /** Com título, o desenho é anunciado; sem, é decorativo. */
  title?: string;
}

function Svg({ size = 24, stroke = 1.8, style, className, title, viewBox, children, ratio = 1 }: Props & { viewBox: string; children: React.ReactNode; ratio?: number }) {
  return (
    <svg
      width={size * ratio}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
      style={{ display: "block", flex: "none", overflow: "visible", ...style }}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Tesoura de barbeiro: argolas, apoio do dedo e lâminas cruzando no eixo. */
export function Tesoura(p: Props) {
  return (
    <Svg {...p} viewBox="0 0 24 24">
      <circle cx="6" cy="6.5" r="3" />
      <circle cx="6" cy="17.5" r="3" />
      <path d="M8.5 8.2 21 17.4" />
      <path d="M8.5 15.8 21 6.6" />
      <path d="M3.4 8.6 1.6 10.4" />
      <circle cx="13.6" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Navalha aberta: cabo levemente curvo, eixo e lâmina larga com o fio para baixo. */
export function Navalha(p: Props) {
  return (
    <Svg {...p} viewBox="0 0 32 16" ratio={2}>
      <path d="M2.6 13.3c4-1.5 8.2-2.2 12.9-2.1" />
      <path d="M2.6 13.3c.2.9 1 1.3 1.9 1 3.6-1.1 7.2-1.6 11.2-1.5" />
      <path d="M15.6 10.4 27.4 2.6c1.2-.8 2.9.3 2.4 1.7-.3.8-.8 1.4-1.5 1.9L18 13.4c-.9.6-2 .4-2.5-.4" />
      <path d="M20 9.6 28.4 4" strokeWidth={0.9} />
      <circle cx="15.9" cy="11.9" r="0.95" />
    </Svg>
  );
}

/** Pente: lombada e dentes (os da ponta mais finos). */
export function Pente(p: Props & { dentes?: number }) {
  const n = p.dentes ?? 9;
  return (
    <Svg {...p} viewBox="0 0 28 14" ratio={2}>
      <rect x="1.5" y="1.5" width="25" height="4" rx="2" />
      {Array.from({ length: n }, (_, i) => {
        const x = 3.2 + (i * 21.6) / (n - 1);
        return <path key={i} d={`M${x.toFixed(2)} 5.5V${i < n / 2 ? 12.5 : 11}`} />;
      })}
    </Svg>
  );
}

/** Pincel de barbear (para química, luzes, pigmentação): cerdas em leque e cabo. */
export function Pincel(p: Props) {
  return (
    <Svg {...p} viewBox="0 0 24 24">
      <path d="M6.2 11.5C5 7.8 7.6 3 12 3s7 4.8 5.8 8.5Z" />
      <path d="M9 6.5c.7-1.2 1.8-1.9 3-1.9M12 11.5V6.8" />
      <path d="M8.6 11.5h6.8l-.8 2.2H9.4Z" />
      <path d="M10 13.7 9.4 20a1.2 1.2 0 0 0 1.2 1.3h2.8a1.2 1.2 0 0 0 1.2-1.3L14 13.7" />
    </Svg>
  );
}

/** Poste de barbearia em pé: bolinha, tampa, tubo de vidro com as listras e base. */
export function Poste(p: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <Svg {...p} viewBox="0 0 20 48" ratio={20 / 48}>
      <defs>
        <clipPath id={`poste-${id}`}>
          <rect x="5" y="9" width="10" height="29" rx="1.5" />
        </clipPath>
      </defs>
      <circle cx="10" cy="3.2" r="2" />
      <path d="M4 7.2c0-1 .8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8V9H4Z" />
      <rect x="5" y="9" width="10" height="29" rx="1.5" />
      <g clipPath={`url(#poste-${id})`}>
        {[-2, 4, 10, 16, 22, 28, 34].map((y) => (
          <path key={y} d={`M4 ${y + 9}L16 ${y + 1}`} />
        ))}
      </g>
      <path d="M4 38h12v1.8c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8Z" />
      <path d="M8 41.6v2.6M12 41.6v2.6M6 44.6h8" />
    </Svg>
  );
}

/**
 * Cadeira de barbeiro. `cheia` (0..1) enche a cadeira de baixo para cima com a cor de
 * `corCheia` — é o "gráfico" da ocupação. `tracejada` desenha só o contorno pontilhado
 * (cadeira que ainda não existe: equipe não cadastrada).
 */
export function Cadeira({ cheia = 0, corCheia = "currentColor", tracejada = false, ...p }: Props & { cheia?: number; corCheia?: string; tracejada?: boolean }) {
  const id = useId().replace(/:/g, "");
  const nivel = Math.max(0, Math.min(1, cheia));
  const traco = tracejada ? "2.4 2.4" : undefined;
  // De perfil: encosto alto com apoio de cabeça, assento, braço, apoio de pé e a coluna
  // hidráulica. Encosto + assento são o que enche.
  const encosto = "M8.8 8.5h6.4a1.5 1.5 0 0 1 1.5 1.4l.8 10.6H8.2l-.9-10.4a1.5 1.5 0 0 1 1.5-1.6Z";
  const assento = "M7.5 20.5h21a2 2 0 0 1 2 2v1.2a2 2 0 0 1-2 2h-21a2 2 0 0 1-2-2v-1.2a2 2 0 0 1 2-2Z";
  const topo = 8.5;
  const base = 25.7;
  const y = base - (base - topo) * nivel;
  return (
    <Svg {...p} viewBox="0 0 40 40" stroke={p.stroke ?? 1.7}>
      <defs>
        <clipPath id={`cad-${id}`}>
          <rect x="0" y={y} width="40" height={40 - y} />
        </clipPath>
      </defs>
      {nivel > 0 ? (
        <g fill={corCheia} stroke="none" clipPath={`url(#cad-${id})`}>
          <path d={encosto} />
          <path d={assento} />
        </g>
      ) : null}
      {/* apoio de cabeça */}
      <path d="M9.4 3.2h5.4a1.4 1.4 0 0 1 1.4 1.4v1.6a1.4 1.4 0 0 1-1.4 1.4H9.4A1.4 1.4 0 0 1 8 6.2V4.6a1.4 1.4 0 0 1 1.4-1.4ZM12 7.6v.9" strokeDasharray={traco} />
      <path d={encosto} strokeDasharray={traco} />
      <path d={assento} strokeDasharray={traco} />
      {/* braço */}
      <path d="M16.4 16.2h10.3a1.6 1.6 0 0 1 0 3.2H16.6M25 19.4v1.1" strokeDasharray={traco} />
      {/* apoio de pé */}
      <path d="M28.5 25.7l3 6.3h4.2" strokeDasharray={traco} />
      {/* coluna e base */}
      <path d="M18 25.7v5.6" />
      <path d="M10.5 36.5h15" />
      <path d="M12.8 36.5c0-2.6 2.3-4.6 5.2-4.6s5.2 2 5.2 4.6" />
    </Svg>
  );
}
