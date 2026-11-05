import { c } from "@/lib/theme";
import { Cadeira } from "./Desenhos";
import type { Barbeiro } from "@/lib/types";

const MAX = 5;

/** Uma cadeira por barbeiro, cheia até a ocupação dele hoje. */
export function CadeirasOcupacao({ itens }: { itens: { barbeiro: Barbeiro; pct: number }[] }) {
  if (!itens.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: c.ink4 }}>
        <Cadeira size={34} tracejada />
        <span style={{ fontSize: 11.5 }}>Cadastre a equipe para ver as cadeiras.</span>
      </div>
    );
  }
  const visiveis = itens.slice(0, MAX);
  return (
    <div role="img" aria-label={itens.map((i) => `${i.barbeiro.nome}: ${i.pct}%`).join(", ")} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      {visiveis.map(({ barbeiro, pct }) => (
        // A cadeira é o gráfico: enche de baixo para cima com a ocupação do barbeiro.
        <div key={barbeiro.id} title={`${barbeiro.nome} · ${pct}% ocupado hoje`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
          <span style={{ color: pct ? c.ink2 : c.ink4 }}>
            <Cadeira size={visiveis.length > 3 ? 34 : 42} cheia={pct / 100} corCheia={c.accent} />
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: c.ink3, letterSpacing: "0.02em" }}>{barbeiro.iniciais}</span>
        </div>
      ))}
      {itens.length > MAX ? <span style={{ fontSize: 11, color: c.ink3, alignSelf: "center" }}>+{itens.length - MAX}</span> : null}
    </div>
  );
}
