"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { selectAgendaPorBarbeiro, selectAtendimentosHoje } from "@/lib/selectors";
import { blocoMeta, horaDesde, minutosDesde, PX_PER_MIN } from "@/lib/status";
import { intervalosSobrepoem } from "@/lib/agenda";
import { useRelogio } from "@/lib/useRelogio";
import type { Agendamento } from "@/lib/types";
import {
  addDias,
  addMeses,
  diasDaSemana,
  diasDoMes,
  hojeLocalISO,
  isoParaLabelLongo,
  labelSemana,
  mesLabel,
} from "@/lib/date";
import { AgendamentoPanel } from "@/components/admin/AgendamentoPanel";
import { BloquearHorarioModal } from "@/components/admin/BloquearHorarioModal";
import { NovoAgendamentoModal, type NovoAgendamentoDefaults } from "@/components/admin/NovoAgendamentoModal";

const DIAS_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SNAP_MIN = 15; // granularidade do arraste / resize / clique-no-vazio (alinha às linhas de 15 min)
const MIN_DUR_MIN = 15; // duração mínima ao redimensionar
const STEP_PX = SNAP_MIN * PX_PER_MIN; // 1 passo de snap em pixels

const legenda = [
  { label: "Agendado", cor: c.brass },
  { label: "Confirmado", cor: "#0EA37A" },
  { label: "Em atendimento", cor: "#E0A21A" },
  { label: "No-show", cor: "#E5484D" },
  { label: "Bloqueio", cor: "#9AA7A4" },
];

function gridBg(colH: number): React.CSSProperties {
  return {
    position: "relative",
    height: colH,
    backgroundImage: [
      // 30 min: linha mais marcada, alinhada aos rótulos (pintada por cima)
      `repeating-linear-gradient(to bottom,transparent 0,transparent 43px,${c.border} 43px,${c.border} 44px)`,
      // 15 min: subdivisão mais leve
      `repeating-linear-gradient(to bottom,transparent 0,transparent 21px,${c.surfaceAlt} 21px,${c.surfaceAlt} 22px)`,
    ].join(","),
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
  base,
  colH,
  atenuado = false,
  onClick,
  onMove,
  onResize,
}: {
  id: string;
  inicio: string;
  dur: number;
  cliente: string;
  servico: string;
  status: keyof typeof blocoMeta;
  base: string;
  colH: number;
  atenuado?: boolean;
  onClick: (id: string) => void;
  onMove: (id: string, novoInicio: string) => void;
  onResize: (id: string, novaDur: number) => void;
}) {
  const m = blocoMeta[status];
  const fixo = status === "bloqueio"; // bloqueios não arrastam nem redimensionam
  const baseTop = minutosDesde(inicio, base) * PX_PER_MIN;
  const baseH = dur * PX_PER_MIN;

  // Gesto em curso (ref, p/ não re-renderizar a cada pointermove) + preview visual.
  const gesture = useRef<{
    kind: "move" | "resize";
    startY: number;
    startTop: number;
    startH: number;
    lastTop: number;
    lastH: number;
    moved: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<{ top: number; h: number } | null>(null);

  const top = preview ? preview.top : baseTop;
  const height = (preview ? preview.h : baseH) - 4;
  const arrastando = preview !== null;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (fixo) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const kind = rect.bottom - e.clientY <= 12 ? "resize" : "move"; // borda inferior = resize
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { kind, startY: e.clientY, startTop: baseTop, startH: baseH, lastTop: baseTop, lastH: baseH, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    if (Math.abs(dy) > 3) g.moved = true;
    if (g.kind === "move") {
      let t = Math.round((g.startTop + dy) / STEP_PX) * STEP_PX;
      t = Math.max(0, Math.min(colH - g.startH, t)); // dentro do expediente
      g.lastTop = t;
      setPreview({ top: t, h: g.startH });
    } else {
      let h = Math.round((g.startH + dy) / STEP_PX) * STEP_PX;
      h = Math.max(MIN_DUR_MIN * PX_PER_MIN, Math.min(colH - g.startTop, h));
      g.lastH = h;
      setPreview({ top: g.startTop, h });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    gesture.current = null;
    setPreview(null);
    if (!g.moved) {
      onClick(id); // não arrastou de fato → trata como clique (abre detalhe)
      return;
    }
    if (g.kind === "move") {
      onMove(id, horaDesde(Math.round(g.lastTop / PX_PER_MIN / SNAP_MIN) * SNAP_MIN, base));
    } else {
      onResize(id, Math.max(MIN_DUR_MIN, Math.round(g.lastH / PX_PER_MIN / SNAP_MIN) * SNAP_MIN));
    }
  }

  const horaPreview = preview ? horaDesde(Math.round(preview.top / PX_PER_MIN / SNAP_MIN) * SNAP_MIN, base) : inicio;

  return (
    <div
      role="button"
      onClick={(e) => e.stopPropagation()} // impede o clique de criar agendamento no vazio
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
        cursor: fixo ? "pointer" : arrastando ? "grabbing" : "grab",
        font: "inherit",
        touchAction: "none", // drag por toque não rola a página
        userSelect: "none",
        zIndex: arrastando ? 5 : 1,
        boxShadow: arrastando ? shadow.pop : "none",
        opacity: arrastando ? 0.93 : atenuado ? 0.32 : 1,
        transition: "opacity .12s ease-out",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: m.title }}>
        {horaPreview} · {cliente}
      </div>
      <div style={{ fontSize: 11, color: m.sub, marginTop: 2 }}>{servico}</div>
      {!fixo ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 22, height: 3, borderRadius: 2, background: m.bar, opacity: 0.45 }} />
        </div>
      ) : null}
    </div>
  );
}

const btnNav: React.CSSProperties = {
  width: 32,
  height: 32,
  border: `1px solid ${c.borderInput}`,
  background: c.surface,
  borderRadius: 9,
  cursor: "pointer",
  color: c.inkLabel,
  fontSize: 15,
};

type View = "dia" | "semana" | "mes";

export default function AgendaPage() {
  const { state, dispatch, actions } = useStore();
  const toast = useToast();
  const { hoje, agora } = useRelogio();
  const [dateISO, setDateISO] = useState(hoje);
  const [view, setView] = useState<View>("dia");
  const [agSel, setAgSel] = useState<string | null>(null);
  const [bloquear, setBloquear] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoDefaults, setNovoDefaults] = useState<NovoAgendamentoDefaults>({});
  const [busca, setBusca] = useState("");

  // Pós-mount, salta para a data real do sistema (o 1º render usa a semente p/ SSR).
  useEffect(() => {
    setDateISO(hojeLocalISO());
  }, []);

  // Janela da grade derivada do horário de funcionamento do tenant (não mais fixa 09–19).
  const abre = state.config.horario.abre || "09:00";
  const fecha = state.config.horario.fecha || "19:00";
  const janelaMin = Math.max(60, minutosDesde(fecha, abre));
  const colH = janelaMin * PX_PER_MIN;
  const gutterMarks = useMemo(
    () => Array.from({ length: Math.floor(janelaMin / 30) + 1 }, (_, i) => i * 30),
    [janelaMin],
  );

  // Visão barbeiro: restringe a agenda a um único barbeiro (fallback: o 1º).
  const visaoBarbeiro = state.ui.visao === "barbeiro";
  const barbId = visaoBarbeiro
    ? (state.barbeiros.some((b) => b.id === state.ui.barbeiroVisaoId) ? state.ui.barbeiroVisaoId : state.barbeiros[0]?.id ?? null)
    : null;
  const barbeiroVisaoNome = barbId ? state.barbeiros.find((b) => b.id === barbId)?.nome ?? null : null;

  const todasColunas = selectAgendaPorBarbeiro(state, dateISO);
  const colunas = barbId ? todasColunas.filter((col) => col.barbeiro.id === barbId) : todasColunas;
  const ehHoje = dateISO === hoje;
  const nowTop = minutosDesde(agora, abre) * PX_PER_MIN;

  // Busca (visão Dia): isola as colunas com cliente correspondente e atenua os demais cards.
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const buscaAtiva = view === "dia" && busca.trim().length > 0;
  const buscaNorm = norm(busca.trim());
  const matchCliente = (nome: string) => norm(nome).includes(buscaNorm);
  const colunasDia = buscaAtiva ? colunas.filter((col) => col.blocos.some((b) => matchCliente(b.cliente))) : colunas;

  function passo(delta: number) {
    if (view === "dia") setDateISO(addDias(dateISO, delta));
    else if (view === "semana") setDateISO(addDias(dateISO, delta * 7));
    else setDateISO(addMeses(dateISO, delta));
  }

  const tituloCentral = view === "dia" ? isoParaLabelLongo(dateISO) : view === "semana" ? labelSemana(dateISO) : mesLabel(dateISO);

  function criarNoHorario(e: React.MouseEvent<HTMLDivElement>, barbeiroId: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMin = Math.max(0, Math.min(janelaMin, Math.round(y / PX_PER_MIN / SNAP_MIN) * SNAP_MIN));
    setNovoDefaults({ dateISO, barbeiroId, inicio: horaDesde(totalMin, abre) });
    setNovoOpen(true);
  }

  // Drag/resize: aplica a mudança com optimistic UI + rollback e avisa (sem bloquear) se houver conflito.
  async function aplicarMudanca(id: string, patch: Partial<Agendamento>, okMsg: string) {
    const anterior = state.agendamentos;
    const alvo = anterior.find((a) => a.id === id);
    if (!alvo) return;
    const novo = { ...alvo, ...patch };
    // Optimistic update.
    dispatch({ type: "SET_DATA", patch: { agendamentos: anterior.map((a) => (a.id === id ? novo : a)) } });
    const conflito = anterior.find(
      (o) =>
        o.id !== id &&
        o.barbeiroId === novo.barbeiroId &&
        o.date === novo.date &&
        o.status !== "cancelado" &&
        intervalosSobrepoem(novo.inicio, novo.duracaoMin, o.inicio, o.duracaoMin),
    );
    try {
      await actions.agendamentos.update(id, patch);
      if (conflito) toast(`Atenção: sobreposição com ${conflito.clienteNome}.`, "error");
      else toast(okMsg);
    } catch {
      dispatch({ type: "SET_DATA", patch: { agendamentos: anterior } }); // rollback
      toast("Não foi possível salvar a alteração.", "error");
    }
  }

  const moverAgendamento = (id: string, novoInicio: string) => aplicarMudanca(id, { inicio: novoInicio }, "Horário atualizado.");
  const redimensionar = (id: string, novaDur: number) => aplicarMudanca(id, { duracaoMin: novaDur }, "Duração atualizada.");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", maxWidth: 1600 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={btnNav} onClick={() => passo(-1)}>‹</button>
          <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600, color: c.inkTitle, minWidth: 190, textAlign: "center" }}>
            {tituloCentral}
          </div>
          <button style={btnNav} onClick={() => passo(1)}>›</button>
          <button
            onClick={() => setDateISO(hoje)}
            style={{ border: "none", fontSize: 12, fontWeight: 700, color: c.brassDeep, background: c.brassSoft, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}
          >
            Hoje
          </button>
        </div>
        {visaoBarbeiro && barbeiroVisaoNome ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: c.brassDeep, background: c.brassSoft, borderRadius: 999, padding: "6px 12px" }}>
            Agenda de {barbeiroVisaoNome}
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        {view === "dia" ? (
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="oc-input"
              style={{ width: 190, background: c.surface, border: `1px solid ${c.borderInput}`, borderRadius: 9, padding: "8px 30px 8px 12px", fontSize: 13, color: c.inkTitle, outline: "none" }}
            />
            {busca ? (
              <button
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                style={{ position: "absolute", right: 8, border: "none", background: "transparent", cursor: "pointer", color: c.ink3, fontSize: 14, lineHeight: 1, padding: 2 }}
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: "flex", background: c.surfaceAlt, borderRadius: 9, padding: 3 }}>
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
                  color: on ? c.inkTitle : c.ink3,
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
          style={{ border: `1px solid ${c.borderInput}`, background: c.surface, cursor: "pointer", color: c.inkTitle, padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600 }}
        >
          + Bloquear horário
        </button>
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {legenda.map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.ink2, fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: l.cor }} />
            {l.label}
          </span>
        ))}
      </div>

      {/* Calendário */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, overflow: "auto", flex: 1, boxShadow: shadow.card }}>
        {view === "dia" ? (
          buscaAtiva && colunasDia.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: c.ink3, fontSize: 13 }}>
              Nenhum agendamento para “{busca.trim()}”.
            </div>
          ) : (
          <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${colunasDia.length},1fr)`, minWidth: 740 }}>
            {/* header row */}
            <div style={{ height: 58, borderBottom: `1px solid ${c.border}`, borderRight: `1px solid ${c.borderSoft}` }} />
            {colunasDia.map(({ barbeiro }, i) => (
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
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: barbeiro.cor, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {barbeiro.iniciais}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>{barbeiro.nome}</div>
                  <div style={{ fontSize: 10.5, color: c.ink3 }}>{selectAtendimentosHoje(state, barbeiro.id, dateISO)} hoje</div>
                </div>
              </div>
            ))}

            {/* gutter */}
            <div style={{ position: "relative", height: colH, borderRight: `1px solid ${c.borderSoft}` }}>
              {gutterMarks.map((min) => (
                <div key={min} style={{ position: "absolute", top: min * PX_PER_MIN - 7, right: 10, fontSize: 11, color: c.ink4, fontWeight: min % 60 === 0 ? 500 : 400 }}>
                  {horaDesde(min, abre)}
                </div>
              ))}
              {ehHoje && nowTop >= 0 && nowTop <= colH ? (
                <>
                  <div style={{ position: "absolute", top: nowTop - 7, right: 8, fontSize: 10, color: c.red, fontWeight: 700, background: c.surface, padding: "1px 0" }}>
                    {agora}
                  </div>
                  <div style={{ position: "absolute", top: nowTop - 4, right: -4, width: 8, height: 8, borderRadius: "50%", background: c.red, zIndex: 4 }} />
                </>
              ) : null}
            </div>

            {/* barber columns */}
            {colunasDia.map(({ barbeiro, blocos }) => (
              <div key={barbeiro.id} style={gridBg(colH)} onClick={(e) => criarNoHorario(e, barbeiro.id)}>
                {ehHoje && nowTop >= 0 && nowTop <= colH ? <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 2, background: c.red, zIndex: 3 }} /> : null}
                {blocos.map((b) => (
                  <Bloco key={b.id} id={b.id} inicio={b.inicio} dur={b.duracaoMin} cliente={b.cliente} servico={b.servico} status={b.status} base={abre} colH={colH} atenuado={buscaAtiva && !matchCliente(b.cliente)} onClick={setAgSel} onMove={moverAgendamento} onResize={redimensionar} />
                ))}
              </div>
            ))}
          </div>
          )
        ) : view === "semana" ? (
          <SemanaView dateISO={dateISO} hoje={hoje} state={state} onSelect={setAgSel} barbeiroId={barbId} />
        ) : (
          <MesView dateISO={dateISO} hoje={hoje} state={state} onPick={(iso) => { setDateISO(iso); setView("dia"); }} barbeiroId={barbId} />
        )}
      </div>

      <AgendamentoPanel open={agSel !== null} onClose={() => setAgSel(null)} agendamentoId={agSel} />
      <BloquearHorarioModal open={bloquear} onClose={() => setBloquear(false)} defaults={{ dateISO }} />
      <NovoAgendamentoModal open={novoOpen} onClose={() => setNovoOpen(false)} defaults={novoDefaults} />
    </div>
  );
}

// ---- Semana: 7 colunas, chips por horário (todos os barbeiros) ----
function SemanaView({ dateISO, hoje, state, onSelect, barbeiroId }: { dateISO: string; hoje: string; state: ReturnType<typeof useStore>["state"]; onSelect: (id: string) => void; barbeiroId: string | null }) {
  const dias = diasDaSemana(dateISO);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", minWidth: 820 }}>
      {dias.map((iso, i) => {
        const ags = state.agendamentos
          .filter((a) => a.date === iso && (!barbeiroId || a.barbeiroId === barbeiroId))
          .sort((a, b) => a.inicio.localeCompare(b.inicio));
        return (
          <div key={iso} style={{ borderLeft: i === 0 ? "none" : `1px solid ${c.borderSoft}`, minHeight: 520 }}>
            <div style={{ height: 50, borderBottom: `1px solid ${c.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: iso === hoje ? c.brassSoft : "transparent" }}>
              <span style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>{DIAS_CURTO[i]}</span>
              <span style={{ fontFamily: font.serif, fontSize: 15, fontWeight: 700, color: c.inkTitle }}>{iso.slice(8)}</span>
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
function MesView({ dateISO, hoje, state, onPick, barbeiroId }: { dateISO: string; hoje: string; state: ReturnType<typeof useStore>["state"]; onPick: (iso: string) => void; barbeiroId: string | null }) {
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
          const total = state.agendamentos.filter((a) => a.date === cel.iso && a.status !== "bloqueio" && (!barbeiroId || a.barbeiroId === barbeiroId)).length;
          const isHoje = cel.iso === hoje;
          return (
            <button
              key={cel.iso}
              onClick={() => onPick(cel.iso)}
              style={{
                minHeight: 96,
                border: "none",
                borderTop: `1px solid ${c.borderSoft}`,
                borderLeft: `1px solid ${c.borderSoft}`,
                background: cel.foraDoMes ? c.surface : c.surface,
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
                  color: cel.foraDoMes ? c.ink4 : c.inkTitle,
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
