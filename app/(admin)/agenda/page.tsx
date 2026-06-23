"use client";

import { useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { selectAgendaPorBarbeiro, selectAtendimentosHoje } from "@/lib/selectors";
import { blocoMeta, minutosDesde9, PX_PER_MIN } from "@/lib/status";
import {
  HOJE_ISO,
  AGORA_HHMM,
  addDias,
  addMeses,
  diasDaSemana,
  diasDoMes,
  isoParaLabelLongo,
  labelSemana,
  mesLabel,
} from "@/lib/date";
import { AgendamentoModal } from "@/components/admin/AgendamentoModal";
import { BloquearHorarioModal } from "@/components/admin/BloquearHorarioModal";
import { NovoAgendamentoModal, type NovoAgendamentoDefaults } from "@/components/admin/NovoAgendamentoModal";

const COL_H = 880;
const HOURS = Array.from({ length: 11 }, (_, i) => 9 + i); // 09..19
const DIAS_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const legenda = [
  { label: "Agendado", cor: c.brass },
  { label: "Confirmado", cor: "#5E7A52" },
  { label: "Em atendimento", cor: "#B07D2B" },
  { label: "No-show", cor: "#A35C4F" },
  { label: "Bloqueio", cor: "#9A8C7D" },
];

function gridBg(): React.CSSProperties {
  return {
    position: "relative",
    height: COL_H,
    backgroundImage:
      "repeating-linear-gradient(to bottom,transparent 0,transparent 87px,#F2E9DA 87px,#F2E9DA 88px)",
    cursor: "copy",
  };
}

function Bloco({
  id,
  inicio,
  dur,
  cliente,
  servico,
  status,
  onClick,
}: {
  id: string;
  inicio: string;
  dur: number;
  cliente: string;
  servico: string;
  status: keyof typeof blocoMeta;
  onClick: (id: string) => void;
}) {
  const m = blocoMeta[status];
  const top = minutosDesde9(inicio) * PX_PER_MIN;
  const height = dur * PX_PER_MIN - 4;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(id);
      }}
      style={{
        position: "absolute",
        left: 6,
        right: 6,
        top,
        height,
        background: m.bg,
        borderLeft: `3px solid ${m.bar}`,
        border: "none",
        borderRadius: 7,
        padding: "8px 10px",
        overflow: "hidden",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: m.title }}>
        {inicio} · {cliente}
      </div>
      <div style={{ fontSize: 11, color: m.sub, marginTop: 2 }}>{servico}</div>
    </button>
  );
}

const btnNav: React.CSSProperties = {
  width: 32,
  height: 32,
  border: `1px solid ${c.borderInput}`,
  background: c.surface,
  borderRadius: 9,
  cursor: "pointer",
  color: "#6B5C4B",
  fontSize: 15,
};

type View = "dia" | "semana" | "mes";

export default function AgendaPage() {
  const { state } = useStore();
  const [dateISO, setDateISO] = useState(HOJE_ISO);
  const [view, setView] = useState<View>("dia");
  const [agSel, setAgSel] = useState<string | null>(null);
  const [bloquear, setBloquear] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoDefaults, setNovoDefaults] = useState<NovoAgendamentoDefaults>({});

  const colunas = selectAgendaPorBarbeiro(state, dateISO);
  const ehHoje = dateISO === HOJE_ISO;
  const nowTop = minutosDesde9(AGORA_HHMM) * PX_PER_MIN;

  function passo(delta: number) {
    if (view === "dia") setDateISO(addDias(dateISO, delta));
    else if (view === "semana") setDateISO(addDias(dateISO, delta * 7));
    else setDateISO(addMeses(dateISO, delta));
  }

  const tituloCentral = view === "dia" ? isoParaLabelLongo(dateISO) : view === "semana" ? labelSemana(dateISO) : mesLabel(dateISO);

  function criarNoHorario(e: React.MouseEvent<HTMLDivElement>, barbeiroId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMin = Math.max(0, Math.min(600, Math.round(y / PX_PER_MIN / 15) * 15));
    const h = 9 + Math.floor(totalMin / 60);
    const m = totalMin % 60;
    setNovoDefaults({ dateISO, barbeiroId, inicio: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` });
    setNovoOpen(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", maxWidth: 1180 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={btnNav} onClick={() => passo(-1)}>‹</button>
          <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600, color: "#241B12", minWidth: 190, textAlign: "center" }}>
            {tituloCentral}
          </div>
          <button style={btnNav} onClick={() => passo(1)}>›</button>
          <button
            onClick={() => setDateISO(HOJE_ISO)}
            style={{ border: "none", fontSize: 12, fontWeight: 700, color: c.brassDeep, background: c.brassSoft, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}
          >
            Hoje
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "#EFE6D7", borderRadius: 9, padding: 3 }}>
          {([
            ["Dia", "dia"],
            ["Semana", "semana"],
            ["Mês", "mes"],
          ] as const).map(([label, v]) => {
            const on = v === view;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  border: "none",
                  fontSize: 12.5,
                  fontWeight: on ? 700 : 600,
                  color: on ? "#3E2C20" : c.ink3,
                  padding: "7px 14px",
                  borderRadius: 7,
                  background: on ? c.surface : "transparent",
                  boxShadow: on ? shadow.pop : "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setBloquear(true)}
          style={{ border: `1px solid ${c.borderInput}`, background: c.surface, cursor: "pointer", color: "#3E2C20", padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600 }}
        >
          + Bloquear horário
        </button>
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {legenda.map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#7A6B59", fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: l.cor }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Calendário */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, overflow: "auto", flex: 1, boxShadow: shadow.card }}>
        {view === "dia" ? (
          <div style={{ display: "grid", gridTemplateColumns: "64px repeat(3,1fr)", minWidth: 740 }}>
            {/* header row */}
            <div style={{ height: 58, borderBottom: `1px solid ${c.border}`, borderRight: `1px solid ${c.borderSoft}` }} />
            {colunas.map(({ barbeiro }, i) => (
              <div
                key={barbeiro.id}
                style={{
                  height: 58,
                  borderBottom: `1px solid ${c.border}`,
                  borderLeft: i === 0 ? "none" : `1px solid ${c.borderSoft}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "0 16px",
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: barbeiro.cor, color: "#E8DAC0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {barbeiro.iniciais}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#241B12" }}>{barbeiro.nome}</div>
                  <div style={{ fontSize: 10.5, color: c.ink3 }}>{selectAtendimentosHoje(state, barbeiro.id, dateISO)} hoje</div>
                </div>
              </div>
            ))}

            {/* gutter */}
            <div style={{ position: "relative", height: COL_H, borderRight: `1px solid ${c.borderSoft}` }}>
              {HOURS.map((h, i) => (
                <div key={h} style={{ position: "absolute", top: i === 0 ? -7 : i * 88 - 7, right: 10, fontSize: 11, color: c.ink4, fontWeight: i === 0 ? 500 : 400 }}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
              {ehHoje ? (
                <>
                  <div style={{ position: "absolute", top: nowTop - 7, right: 8, fontSize: 10, color: c.red, fontWeight: 700, background: c.surface, padding: "1px 0" }}>
                    {AGORA_HHMM}
                  </div>
                  <div style={{ position: "absolute", top: nowTop - 4, right: -4, width: 8, height: 8, borderRadius: "50%", background: c.red, zIndex: 4 }} />
                </>
              ) : null}
            </div>

            {/* barber columns */}
            {colunas.map(({ barbeiro, blocos }) => (
              <div key={barbeiro.id} style={gridBg()} onClick={(e) => criarNoHorario(e, barbeiro.id)}>
                {ehHoje ? <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: c.red, zIndex: 3 }} /> : null}
                {blocos.map((b) => (
                  <Bloco key={b.id} id={b.id} inicio={b.inicio} dur={b.duracaoMin} cliente={b.cliente} servico={b.servico} status={b.status} onClick={setAgSel} />
                ))}
              </div>
            ))}
          </div>
        ) : view === "semana" ? (
          <SemanaView dateISO={dateISO} state={state} onSelect={setAgSel} />
        ) : (
          <MesView dateISO={dateISO} state={state} onPick={(iso) => { setDateISO(iso); setView("dia"); }} />
        )}
      </div>

      <AgendamentoModal open={agSel !== null} onClose={() => setAgSel(null)} agendamentoId={agSel} />
      <BloquearHorarioModal open={bloquear} onClose={() => setBloquear(false)} defaults={{ dateISO }} />
      <NovoAgendamentoModal open={novoOpen} onClose={() => setNovoOpen(false)} defaults={novoDefaults} />
    </div>
  );
}

// ---- Semana: 7 colunas, chips por horário (todos os barbeiros) ----
function SemanaView({ dateISO, state, onSelect }: { dateISO: string; state: ReturnType<typeof useStore>["state"]; onSelect: (id: string) => void }) {
  const dias = diasDaSemana(dateISO);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", minWidth: 820 }}>
      {dias.map((iso, i) => {
        const ags = state.agendamentos
          .filter((a) => a.date === iso)
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        return (
          <div key={iso} style={{ borderLeft: i === 0 ? "none" : `1px solid ${c.borderSoft}`, minHeight: 520 }}>
            <div style={{ height: 50, borderBottom: `1px solid ${c.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: iso === HOJE_ISO ? c.brassSoft : "transparent" }}>
              <span style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>{DIAS_CURTO[i]}</span>
              <span style={{ fontFamily: font.serif, fontSize: 15, fontWeight: 700, color: "#3E2C20" }}>{iso.slice(8)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: 7 }}>
              {ags.length === 0 ? <div style={{ fontSize: 11, color: c.ink4, textAlign: "center", marginTop: 12 }}>—</div> : null}
              {ags.map((a) => {
                const m = blocoMeta[a.status];
                const barbeiro = state.barbeiros.find((b) => b.id === a.barbeiroId);
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    style={{ textAlign: "left", border: "none", borderLeft: `3px solid ${m.bar}`, background: m.bg, borderRadius: 6, padding: "6px 8px", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: m.title }}>{a.inicio} · {a.clienteNome}</div>
                    <div style={{ fontSize: 10, color: m.sub, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.servico} · {barbeiro?.iniciais ?? ""}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Mês: grade 6×7 com contagem por dia ----
function MesView({ dateISO, state, onPick }: { dateISO: string; state: ReturnType<typeof useStore>["state"]; onPick: (iso: string) => void }) {
  const celulas = diasDoMes(dateISO);
  return (
    <div style={{ minWidth: 740 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${c.border}` }}>
        {DIAS_CURTO.map((d) => (
          <div key={d} style={{ padding: "11px 0", textAlign: "center", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {celulas.map((cel) => {
          const total = state.agendamentos.filter((a) => a.date === cel.iso && a.status !== "bloqueio").length;
          const isHoje = cel.iso === HOJE_ISO;
          return (
            <button
              key={cel.iso}
              onClick={() => onPick(cel.iso)}
              style={{
                minHeight: 96,
                border: "none",
                borderTop: `1px solid ${c.borderSoft}`,
                borderLeft: `1px solid ${c.borderSoft}`,
                background: cel.foraDoMes ? "#FBF7EF" : c.surface,
                cursor: "pointer",
                textAlign: "left",
                padding: 9,
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              <span
                style={{
                  alignSelf: "flex-start",
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: cel.foraDoMes ? c.ink4 : "#3E2C20",
                  border: isHoje ? `1.5px solid ${c.brass}` : "1.5px solid transparent",
                }}
              >
                {cel.dia}
              </span>
              {total > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: c.brassDeep, background: c.brassSoft, borderRadius: 999, padding: "2px 9px" }}>
                  {total} agend.
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
