"use client";

import { useMemo, useRef, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { selectAgendaPorBarbeiro, selectAtendimentosHoje } from "@/lib/selectors";
import { blocoMeta, horaDesde, minutosDesde, PX_PER_MIN, STATUS_LABEL } from "@/lib/status";
import { intervalosSobrepoem } from "@/lib/agenda";
import { useRelogio } from "@/lib/useRelogio";
import type { Agendamento } from "@/lib/types";
import {
  addDias,
  addMeses,
  diasDaSemana,
  diasDoMes,
  isoParaLabelLongo,
  labelSemana,
  mesLabel,
} from "@/lib/date";
import { AgendamentoPanel } from "@/components/admin/AgendamentoPanel";
import { CardSugestao } from "@/components/admin/CardSugestao";
import { BloquearHorarioModal } from "@/components/admin/BloquearHorarioModal";
import { NovoAgendamentoModal, type NovoAgendamentoDefaults } from "@/components/admin/NovoAgendamentoModal";
import { AgendamentoRecorrenteModal } from "@/components/admin/AgendamentoRecorrenteModal";

const DIAS_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SNAP_MIN = 15; // granularidade do arraste / resize / clique-no-vazio (alinha às linhas de 15 min)
const MIN_DUR_MIN = 15; // duração mínima ao redimensionar
const STEP_PX = SNAP_MIN * PX_PER_MIN; // 1 passo de snap em pixels

// Rótulo e cor saem das fontes únicas (STATUS_LABEL / blocoMeta) — antes eram
// literais duplicados aqui, e o swatch de "Agendado" nem batia com o bloco.
const legenda = (["agendado", "confirmado", "atendimento", "noshow", "bloqueio"] as const).map((s) => ({
  label: STATUS_LABEL[s],
  cor: blocoMeta[s].bar,
}));

// Altura de uma hora e de meia hora na grade (PX_PER_MIN = 44/30 → 88px e 44px).
const H_HORA = 60 * PX_PER_MIN;
const H_MEIA = 30 * PX_PER_MIN;

/**
 * Fundo de uma coluna de barbeiro.
 *
 * Dois pesos de linha, e só dois: a HORA CHEIA marcada e a meia hora leve. Antes eram 30 e
 * 15 min com o mesmo tipo de traço e nada distinguindo a hora — sem ponto de apoio, a grade
 * lia como papel milimetrado. A subdivisão de 15 min saiu junto; o arraste continua
 * encaixando de 15 em 15 (SNAP_MIN), ele só não precisa da linha desenhada para isso.
 *
 * A hora vem PRIMEIRO na lista porque em y=87 as duas caem no mesmo pixel, e em CSS o
 * primeiro gradiente é o de cima.
 *
 * `faixa` alterna um tom quase imperceptível entre as colunas: com três ou quatro barbeiros
 * lado a lado, é o que impede o olho de trocar de coluna ao descer a grade.
 */
function gridBg(colH: number, indice: number): React.CSSProperties {
  return {
    position: "relative",
    height: colH,
    backgroundImage: [
      `repeating-linear-gradient(to bottom,transparent 0,transparent ${H_HORA - 1}px,${c.border} ${H_HORA - 1}px,${c.border} ${H_HORA}px)`,
      `repeating-linear-gradient(to bottom,transparent 0,transparent ${H_MEIA - 1}px,${c.borderSoft} ${H_MEIA - 1}px,${c.borderSoft} ${H_MEIA}px)`,
    ].join(","),
    backgroundColor: indice % 2 === 0 ? "rgba(237,241,243,.40)" : undefined,
    borderLeft: indice === 0 ? "none" : `1px solid ${c.borderSoft}`,
    cursor: "copy",
  };
}

/**
 * O fantasma de uma sugestão na grade do dia.
 *
 * Tracejado e translúcido porque o horário NÃO está reservado: enquanto ninguém
 * confirmar, qualquer pessoa pode marcar por cima. Ele mostra onde a proposta cairia — os
 * botões de confirmar ficam no card acima do calendário, onde há espaço para eles.
 */
function BlocoSugestao({
  inicio,
  dur,
  cliente,
  base,
}: {
  inicio: string;
  dur: number;
  cliente: string;
  base: string;
}) {
  return (
    <div
      title={`Sugestão do atendente: ${cliente} às ${inicio}`}
      style={{
        position: "absolute",
        left: 6,
        right: 6,
        top: minutosDesde(inicio, base) * PX_PER_MIN,
        height: dur * PX_PER_MIN - 4,
        border: `1.5px dashed ${c.brass}`,
        background: "rgba(14,163,122,0.10)",
        borderRadius: 8,
        padding: "4px 8px",
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 2,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: c.brassDeep, letterSpacing: 0.4 }}>SUGESTÃO</div>
      <div style={{ fontSize: 11.5, color: c.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {cliente}
      </div>
    </div>
  );
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
      className="oc-bloco"
      style={{
        position: "absolute",
        left: 5,
        right: 5,
        top,
        height,
        background: m.bg,
        // `border: none` + `borderLeft` juntos disparam aviso do React (mistura
        // de shorthand com longhand no rerender) — declara lado a lado.
        borderTop: "none",
        borderRight: "none",
        borderBottom: "none",
        borderLeft: `3px solid ${m.bar}`,
        borderRadius: 8,
        padding: "7px 9px",
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
      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, color: m.title, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {horaPreview} · {cliente}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: m.sub, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{servico}</div>
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

// Camadas do sticky da grade do dia. Os blocos usam zIndex 1 (5 durante o
// arraste), então deslizam POR BAIXO do cabeçalho e da régua — que é o certo.
const Z_REGUA = 6;
const Z_HEADER = 12;
const Z_CANTO = 14;

const celulaHeader: React.CSSProperties = {
  height: 58,
  position: "sticky",
  top: 0,
  zIndex: Z_HEADER,
  background: c.surface, // sem fundo o conteúdo apareceria por baixo
};
const celulaCanto: React.CSSProperties = { ...celulaHeader, left: 0, zIndex: Z_CANTO };
const reguaHoras: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: Z_REGUA,
  background: c.surface,
};
/** Cabeçalho fixo das visões Semana/Mês (mesma ideia, sem coluna fixa). */
const headerFixo: React.CSSProperties = { position: "sticky", top: 0, zIndex: Z_HEADER, background: c.surface };

export function TelaAgenda() {
  const { state, dispatch, actions } = useStore();
  const toast = useToast();
  const { hoje, agora } = useRelogio();

  // Data / visão / busca vivem no store: trocar de aba no menu e voltar não
  // remonta a tela do zero. `dateISO: null` = hoje, resolvido a cada render —
  // sem frame com a data-semente e sem data velha depois da meia-noite.
  const tela = state.ui.telas.agenda;
  const dateISO = tela.dateISO ?? hoje;
  const view = tela.view;
  const busca = tela.busca;
  const setTela = (patch: Partial<typeof tela>) => dispatch({ type: "SET_TELA", tela: "agenda", patch });
  const setDateISO = (iso: string) => setTela({ dateISO: iso });
  const setView = (v: View) => setTela({ view: v });
  const setBusca = (q: string) => setTela({ busca: q });

  // Sugestões do atendente automático para ESTE dia. Não são agendamentos: não ocupam
  // horário nem entram nas contas do dia — aparecem como proposta, esperando confirmação.
  const sugestoesDoDia = useMemo(
    () => state.sugestoes.filter((sg) => sg.date === dateISO),
    [state.sugestoes, dateISO],
  );

  const [agSel, setAgSel] = useState<string | null>(null);
  const [bloquear, setBloquear] = useState(false);
  const [recorrenteOpen, setRecorrenteOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoDefaults, setNovoDefaults] = useState<NovoAgendamentoDefaults>({});

  // Janela da grade derivada do horário de funcionamento do tenant (não mais fixa 09–19).
  const abre = state.config.horario.abre || "09:00";
  const fecha = state.config.horario.fecha || "19:00";
  const janelaMin = Math.max(60, minutosDesde(fecha, abre));
  const colH = janelaMin * PX_PER_MIN;
  // Só as horas cheias. Com 09:30/10:30 no meio, a régua competia com ela mesma e o olho
  // não achava a hora — que é a única coisa que se procura ali.
  const gutterMarks = useMemo(
    () => Array.from({ length: Math.floor(janelaMin / 60) + 1 }, (_, i) => i * 60),
    [janelaMin],
  );

  // Visão barbeiro: restringe a agenda a um único barbeiro (fallback: o 1º).
  const visaoBarbeiro = state.ui.visao === "barbeiro";
  const barbId = visaoBarbeiro
    ? (state.barbeiros.some((b) => b.id === state.ui.barbeiroVisaoId) ? state.ui.barbeiroVisaoId : state.barbeiros[0]?.id ?? null)
    : null;
  const barbeiroVisaoNome = barbId ? state.barbeiros.find((b) => b.id === barbId)?.nome ?? null : null;

  // Memoizado: a busca digita letra a letra e re-renderiza a tela inteira.
  const todasColunas = useMemo(() => selectAgendaPorBarbeiro(state, dateISO), [state, dateISO]);
  const colunas = useMemo(
    () => (barbId ? todasColunas.filter((col) => col.barbeiro.id === barbId) : todasColunas),
    [todasColunas, barbId],
  );
  const ehHoje = dateISO === hoje;
  const nowTop = minutosDesde(agora, abre) * PX_PER_MIN;

  // Busca (visão Dia): isola as colunas com cliente correspondente e atenua os demais cards.
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const buscaAtiva = view === "dia" && busca.trim().length > 0;
  const buscaNorm = norm(busca.trim());
  const matchCliente = (nome: string) => norm(nome).includes(buscaNorm);
  const colunasDia = buscaAtiva ? colunas.filter((col) => col.blocos.some((b) => matchCliente(b.cliente))) : colunas;
  // Dia realmente vazio — não confundir com "a busca não achou nada", que já tem aviso próprio.
  const diaVazio = !buscaAtiva && colunasDia.length > 0 && colunasDia.every((col) => col.blocos.length === 0);

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
          <button className="oc-btn oc-btn-ghost" style={btnNav} onClick={() => passo(-1)}>‹</button>
          <div style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600, color: c.inkTitle, minWidth: 190, textAlign: "center" }}>
            {tituloCentral}
          </div>
          <button className="oc-btn oc-btn-ghost" style={btnNav} onClick={() => passo(1)}>›</button>
          <button
            onClick={() => setTela({ dateISO: null })}
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
          onClick={() => setRecorrenteOpen(true)}
          style={{ border: `1px solid ${c.borderInput}`, background: c.surface, cursor: "pointer", color: c.inkTitle, padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600 }}
        >
          + Agendamento recorrente
        </button>
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

      {/* Sugestões do atendente automático — só aparece quando há alguma no dia */}
      {sugestoesDoDia.length ? (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {sugestoesDoDia.map((sg) => (
            <div key={sg.id} style={{ minWidth: 250, flex: "none" }}>
              <CardSugestao sugestao={sg} compacto />
            </div>
          ))}
        </div>
      ) : null}

      {/* Calendário */}
      <div style={{ position: "relative", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, overflow: "auto", flex: 1, boxShadow: shadow.card }}>
        {view === "dia" ? (
          buscaAtiva && colunasDia.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: c.ink3, fontSize: 13 }}>
              Nenhum agendamento para “{busca.trim()}”.
            </div>
          ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: `64px repeat(${colunasDia.length},1fr)`, minWidth: 740 }}>
            {/* header row — fica grudado no topo enquanto o dia rola (e o canto,
                também na esquerda, por cima da régua de horas) */}
            <div style={{ ...celulaCanto, borderBottom: `1px solid ${c.border}`, borderRight: `1px solid ${c.borderSoft}` }} />
            {colunasDia.map(({ barbeiro }, i) => (
              <div
                key={barbeiro.id}
                style={{
                  ...celulaHeader,
                  borderBottom: `1px solid ${c.border}`,
                  borderLeft: i === 0 ? "none" : `1px solid ${c.borderSoft}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "0 16px",
                }}
              >
                <div style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", background: barbeiro.cor, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700 }}>
                  {barbeiro.iniciais}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{barbeiro.nome}</div>
                  {/* "hoje" só quando a data na tela É hoje — antes dizia "3 hoje" olhando
                      para a agenda de semana que vem, o que não queria dizer nada. */}
                  {(() => {
                    const n = selectAtendimentosHoje(state, barbeiro.id, dateISO);
                    return (
                      <div style={{ fontSize: 11, color: n === 0 ? c.ink4 : c.ink3, marginTop: 1, whiteSpace: "nowrap" }}>
                        {n === 0 ? "nenhum atendimento" : `${n} atendimento${n === 1 ? "" : "s"}${ehHoje ? " hoje" : ""}`}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}

            {/* gutter — fixo à esquerda: com muitos barbeiros a grade rola na horizontal */}
            <div style={{ ...reguaHoras, height: colH, borderRight: `1px solid ${c.borderSoft}` }}>
              {/* O rótulo fica logo ABAIXO da sua linha, não centrado nela: centrado, o
                  primeiro (a hora de abertura) ficava metade cortado pelo cabeçalho grudado. */}
              {gutterMarks.map((min) => (
                <div
                  key={min}
                  style={{
                    position: "absolute",
                    top: min * PX_PER_MIN + 3,
                    right: 10,
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: c.ink3,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: ".2px",
                  }}
                >
                  {horaDesde(min, abre)}
                </div>
              ))}
              {ehHoje && nowTop >= 0 && nowTop <= colH ? (
                <div
                  style={{
                    position: "absolute",
                    top: nowTop,
                    right: 6,
                    transform: "translateY(-50%)",
                    zIndex: 7,
                    background: c.red,
                    color: "#FFFFFF",
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: "3px 6px",
                    borderRadius: 5,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {agora}
                </div>
              ) : null}
            </div>

            {/* barber columns */}
            {colunasDia.map(({ barbeiro, blocos }, i) => (
              <div key={barbeiro.id} style={gridBg(colH, i)} onClick={(e) => criarNoHorario(e, barbeiro.id)}>
                {ehHoje && nowTop >= 0 && nowTop <= colH ? (
                  <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 1.5, background: c.red, zIndex: 3 }}>
                    <div style={{ position: "absolute", left: -3, top: -2.25, width: 6, height: 6, borderRadius: "50%", background: c.red }} />
                  </div>
                ) : null}
                {blocos.map((b) => (
                  <Bloco key={b.id} id={b.id} inicio={b.inicio} dur={b.duracaoMin} cliente={b.cliente} servico={b.servico} status={b.status} base={abre} colH={colH} atenuado={buscaAtiva && !matchCliente(b.cliente)} onClick={setAgSel} onMove={moverAgendamento} onResize={redimensionar} />
                ))}
                {sugestoesDoDia
                  .filter((sg) => sg.barbeiroId === barbeiro.id)
                  .map((sg) => (
                    <BlocoSugestao key={sg.id} inicio={sg.inicio} dur={sg.duracaoMin} cliente={sg.clienteNome} base={abre} />
                  ))}
              </div>
            ))}
          </div>
          {/* Dia sem nada marcado. A grade nua não é resposta: ela não diz se o dia está
              vazio, se ainda está carregando ou se o filtro escondeu tudo. `pointerEvents:
              none` deixa o clique passar para a coluna por baixo — criar agendamento
              clicando num horário continua funcionando com o aviso na tela. A altura é
              fixa (e não `inset: 0`) porque o container ROLA: centrado nos 880px da grade,
              o aviso nasceria fora da área visível. */}
          {diaVazio ? (
            <div style={{ position: "absolute", top: 62, left: 64, right: 0, height: 330, display: "grid", placeItems: "center", pointerEvents: "none", padding: 24, zIndex: 4 }}>
              <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, boxShadow: shadow.pop, padding: "22px 26px", textAlign: "center", maxWidth: 330 }}>
                <div style={{ width: 38, height: 38, margin: "0 auto 11px", borderRadius: 10, background: c.brassTint, display: "grid", placeItems: "center" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={c.brassDeep} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: c.inkTitle }}>Nenhum agendamento neste dia</div>
                <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 4 }}>Clique em um horário na coluna do barbeiro para marcar.</div>
              </div>
            </div>
          ) : null}
          </>
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
      <AgendamentoRecorrenteModal open={recorrenteOpen} onClose={() => setRecorrenteOpen(false)} defaults={{ dateISO, barbeiroId: barbId ?? undefined }} />
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
            <div style={{ ...headerFixo, height: 50, borderBottom: `1px solid ${c.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: iso === hoje ? c.brassSoft : c.surface }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${c.border}`, ...headerFixo }}>
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
