import { c } from "@/lib/theme";
import { formatBRL } from "@/lib/selectors";

const INICIAL = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Um pente cujos dentes são os dias: o tamanho de cada dente é o ticket médio daquele
 * dia; o dente de hoje leva o acento. Dia sem atendimento fica como um toco.
 */
export function PenteDentes({ dias }: { dias: { dia: string; ticket: number }[] }) {
  const max = Math.max(1, ...dias.map((d) => d.ticket));
  const rotulo = dias.map((d) => `${d.dia}: ${formatBRL(d.ticket)}`).join("; ");
  return (
    <div role="img" aria-label={`Ticket médio por dia — ${rotulo}`}>
      <div style={{ height: 7, borderRadius: 999, background: c.ink, opacity: 0.88, margin: "0 -3px" }} />
      <div style={{ display: "flex", gap: 5, height: 34, alignItems: "flex-start" }}>
        {dias.map((d, i) => {
          const hoje = i === dias.length - 1;
          return (
            <span
              key={d.dia}
              title={`${d.dia} · ${formatBRL(d.ticket)}`}
              style={{
                flex: 1,
                height: `${Math.max(10, (d.ticket / max) * 100)}%`,
                borderRadius: "0 0 999px 999px",
                background: hoje ? c.accent : d.ticket ? c.ink4 : c.surfaceAlt,
                opacity: hoje ? 1 : d.ticket ? 0.55 : 1,
                transition: "height .5s var(--oc-ease)",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
        {dias.map((d, i) => (
          <span key={d.dia} style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: i === dias.length - 1 ? 700 : 500, color: i === dias.length - 1 ? c.accent : c.ink4 }}>
            {INICIAL[new Date(`${d.dia}T12:00:00Z`).getUTCDay()]}
          </span>
        ))}
      </div>
    </div>
  );
}
