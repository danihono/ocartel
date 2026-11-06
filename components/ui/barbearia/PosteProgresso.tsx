import type { CSSProperties } from "react";

/**
 * Poste de barbearia deitado, usado como barra de progresso: o tubo de vidro enche com as
 * listras girando até `pct`. Acima de 100% o tubo fica cheio e as listras aceleram.
 *
 * `tom` escolhe as cores: "escuro" para o card herói floresta (listras neon/branco),
 * "claro" para cards brancos (listras do acento).
 */
export function PosteProgresso({
  pct,
  tom = "claro",
  altura = 16,
  rotulo,
  style,
}: {
  pct: number;
  tom?: "escuro" | "claro";
  altura?: number;
  /** Texto para leitor de tela, ex.: "72% do mês passado". */
  rotulo: string;
  style?: CSSProperties;
}) {
  const cheio = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={`oc-poste oc-poste-${tom}${pct > 100 ? " is-alem" : ""}${cheio === 0 ? " is-vazio" : ""}`}
      style={{ ["--oc-poste-h" as string]: `${altura}px`, ...style }}
    >
      <span className="oc-poste-tampa" />
      <span className="oc-poste-tubo">
        <span className="oc-poste-listras" style={{ width: `${cheio}%` }} />
        <span className="oc-poste-brilho" />
      </span>
      <span className="oc-poste-tampa" />
    </div>
  );
}
