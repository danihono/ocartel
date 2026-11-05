import { c } from "@/lib/theme";
import { Navalha } from "./Desenhos";
import type { PontoRegua } from "@/lib/painel";

const corDoPonto: Record<string, { fundo: string; borda: string }> = {
  concluido: { fundo: c.accent, borda: c.accent },
  atendimento: { fundo: c.amber, borda: c.amber },
  confirmado: { fundo: c.surface, borda: c.accent },
  agendado: { fundo: c.surface, borda: c.ink4 },
  noshow: { fundo: c.red, borda: c.red },
};

/**
 * A régua do dia: da abertura ao fechamento, um ponto por atendimento (cheio = feito,
 * vazado = por vir, vermelho = faltou) e a navalha parada no "agora".
 */
export function ReguaDoDia({
  abre,
  fecha,
  pontos,
  agoraPos,
  aberto,
}: {
  abre: string;
  fecha: string;
  pontos: PontoRegua[];
  agoraPos: number;
  aberto: boolean;
}) {
  const feitos = pontos.filter((p) => p.status === "concluido").length;
  const rotulo = pontos.length
    ? `${pontos.length} horários entre ${abre} e ${fecha}, ${feitos} já atendidos`
    : `Agenda livre entre ${abre} e ${fecha}`;
  return (
    <div role="img" aria-label={rotulo} style={{ position: "relative", height: 46, paddingTop: 18 }}>
      {/* trilho, com a parte já passada do dia mais forte */}
      <div style={{ position: "relative", height: 4, borderRadius: 999, background: c.surfaceAlt }}>
        <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${agoraPos * 100}%`, borderRadius: 999, background: c.accentSoft }} />
        {pontos.map((p, i) => {
          const cor = corDoPonto[p.status] ?? corDoPonto.agendado;
          return (
            <span
              key={`${p.hora}-${i}`}
              title={`${p.hora} · ${p.cliente}`}
              style={{
                position: "absolute",
                left: `${p.pos * 100}%`,
                top: "50%",
                width: 9,
                height: 9,
                marginLeft: -4.5,
                marginTop: -4.5,
                borderRadius: "50%",
                background: cor.fundo,
                border: `1.75px solid ${cor.borda}`,
                boxShadow: `0 0 0 2px ${c.surface}`,
              }}
            />
          );
        })}
        {/* A navalha marca o agora; fora do expediente fica estacionada na ponta, quieta. */}
        <div
          className={aberto ? "oc-navalha-agora" : undefined}
          title={aberto ? "Agora" : "Fora do expediente"}
          style={{ position: "absolute", left: `${agoraPos * 100}%`, bottom: 3, transform: "translateX(-50%)", color: aberto ? c.ink : c.ink4 }}
        >
          <Navalha size={12} stroke={2} style={{ transform: "rotate(-12deg) translateY(-2px)" }} />
        </div>
      </div>
      <div className="num" style={{ display: "flex", justifyContent: "space-between", marginTop: 9, fontSize: 10, color: c.ink4 }}>
        <span>{abre}</span>
        <span>{fecha}</span>
      </div>
    </div>
  );
}
