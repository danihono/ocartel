"use client";

import { useEffect, useMemo, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Icon } from "@/components/ui/Icon";
import { LineChart } from "@/components/ui/LineChart";
import { ExportarBotao } from "@/components/ui/ExportarBotao";
import { useToast } from "@/components/ui/Toast";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useHoje } from "@/lib/useRelogio";
import { formatBRL } from "@/lib/selectors";
import { isoParaDiaMes } from "@/lib/date";
import { baixarPlanilha, dataBR, nomeArquivo, type FormatoExportacao } from "@/lib/exportar";
import {
  PRESETS,
  montarRelatorio,
  periodoDoPreset,
  variacao,
  type DadosRelatorio,
  type LinhaRanking,
  type Periodo,
  type PresetPeriodo,
  type Relatorio,
} from "@/lib/relatorios";
import { acaoDadosRelatorio } from "@/app/(admin)/relatorios/actions";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Selo de variação contra o período anterior. */
function delta(atual: number, anterior: number, invertido = false) {
  const v = variacao(atual, anterior);
  if (v === null) return undefined;
  return { text: `${Math.abs(v)}%`, tone: v > 0 ? ("up" as const) : v < 0 ? ("down" as const) : ("flat" as const), invertido };
}

export function TelaRelatorios() {
  const { state } = useStore();
  const { user, tenantId } = useAuth();
  const toast = useToast();
  const hoje = useHoje();

  const [preset, setPreset] = useState<PresetPeriodo>("mes");
  const [custom, setCustom] = useState<Periodo>(() => periodoDoPreset("30d", hoje));
  const periodo = preset === "personalizado" ? custom : periodoDoPreset(preset, hoje);

  const [dados, setDados] = useState<{ chave: string; d: Omit<DadosRelatorio, "barbeiros"> } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = `${periodo.inicio}|${periodo.fim}`;

  useEffect(() => {
    if (!user || !tenantId || periodo.inicio > periodo.fim) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      try {
        const r = await acaoDadosRelatorio(await user.getIdToken(), tenantId, periodo.inicio, periodo.fim);
        if (!vivo) return;
        if (!r.ok || !r.agendamentos || !r.transacoes || !r.novosClientes) {
          setErro(r.erro ?? "Não foi possível carregar o relatório.");
          return;
        }
        setDados({ chave, d: { agendamentos: r.agendamentos, transacoes: r.transacoes, novosClientes: r.novosClientes } });
      } catch {
        if (vivo) setErro("Não foi possível carregar o relatório.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // `chave` resume o período; o objeto `periodo` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, user, tenantId]);

  const rel = useMemo<Relatorio | null>(
    () => (dados ? montarRelatorio({ ...dados.d, barbeiros: state.barbeiros }, { inicio: dados.chave.split("|")[0], fim: dados.chave.split("|")[1] }) : null),
    [dados, state.barbeiros],
  );

  async function exportar(f: FormatoExportacao) {
    if (!rel) return;
    const a = rel.atual;
    const b = rel.comparacao;
    const resumo = [
      ["Receita (R$)", a.receita, b.receita],
      ["Receita de mensalidades (R$)", a.receitaMensalidades, b.receitaMensalidades],
      ["Pagamentos", a.pagamentos, b.pagamentos],
      ["Atendimentos", a.atendimentos, b.atendimentos],
      ["Ticket médio (R$)", a.ticketMedio, b.ticketMedio],
      ["Faltas", a.faltas, b.faltas],
      ["Taxa de faltas (%)", a.taxaFaltas, b.taxaFaltas],
      ["Cancelamentos", a.cancelados, b.cancelados],
      ["Clientes novos", a.novosClientes, b.novosClientes],
    ].map(([m, x, y]) => ({
      Métrica: m,
      [`${dataBR(rel.periodo.inicio)} a ${dataBR(rel.periodo.fim)}`]: x,
      [`${dataBR(rel.anterior.inicio)} a ${dataBR(rel.anterior.fim)}`]: y,
    }));
    const rank = (ls: LinhaRanking[], col: string) => ls.map((l) => ({ [col]: l.nome, Quantidade: l.qtd, "Receita (R$)": l.receita }));
    const abas = [
      { nome: "Resumo", linhas: resumo },
      { nome: "Por serviço", linhas: rank(rel.porServico, "Serviço") },
      { nome: "Por barbeiro", linhas: rel.porBarbeiro.map((l) => ({ Barbeiro: l.nome, Atendimentos: l.qtd, "Receita (R$)": l.receita })) },
      { nome: "Formas de pagamento", linhas: rank(rel.porForma, "Forma") },
      { nome: "Receita por dia", linhas: rel.serie.map((s) => ({ Dia: dataBR(s.dia), "Receita (R$)": s.receita })) },
    ];
    await baixarPlanilha(nomeArquivo("relatorio", `${rel.periodo.inicio}_${rel.periodo.fim}`, f), f === "csv" ? abas.slice(0, 1) : abas, f);
    if (f === "csv") toast("CSV leva só o resumo — no Excel vão todas as abas.", "info");
  }

  return (
    <div className="oc-stagger" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Período */}
      <div className="oc-no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="oc-seg oc-scroll-x" role="group" aria-label="Período" style={{ maxWidth: "100%" }}>
          {PRESETS.map((p) => (
            <button key={p.value} type="button" aria-pressed={preset === p.value} onClick={() => setPreset(p.value)}>
              {p.label}
            </button>
          ))}
          <button type="button" aria-pressed={preset === "personalizado"} onClick={() => setPreset("personalizado")}>
            Personalizado
          </button>
        </div>
        {preset === "personalizado" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="date"
              className="oc-input"
              value={custom.inicio}
              max={custom.fim}
              onChange={(e) => e.target.value && setCustom((p) => ({ ...p, inicio: e.target.value }))}
              style={dataInput}
              aria-label="Início"
            />
            <span style={{ color: c.ink3, fontSize: 13 }}>até</span>
            <input
              type="date"
              className="oc-input"
              value={custom.fim}
              min={custom.inicio}
              max={hoje}
              onChange={(e) => e.target.value && setCustom((p) => ({ ...p, fim: e.target.value }))}
              style={dataInput}
              aria-label="Fim"
            />
          </div>
        ) : null}
        <span style={{ flex: 1 }} />
        <ExportarBotao onExportar={exportar} disabled={!rel} />
        <button type="button" className="oc-btn oc-btn-ghost oc-btn-sm" onClick={() => window.print()} disabled={!rel}>
          <Icon name="download" size={15} /> Imprimir / PDF
        </button>
      </div>

      {rel ? (
        <div style={{ fontSize: 12.5, color: c.ink3, marginTop: -6, display: "flex", alignItems: "center", gap: 8 }}>
          {carregando ? <span className="oc-chip" style={{ background: c.surfaceAlt, color: c.ink2 }}>Atualizando…</span> : null}
          <span>
            {dataBR(rel.periodo.inicio)} a {dataBR(rel.periodo.fim)} · comparado com {dataBR(rel.anterior.inicio)} a {dataBR(rel.anterior.fim)}
          </span>
        </div>
      ) : null}

      {erro ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.redBg, borderRadius: 14, padding: "13px 16px", color: c.redText, fontSize: 13.5 }}>
          <Icon name="alerta" size={18} /> {erro}
        </div>
      ) : null}

      {!rel ? (
        <Card style={{ textAlign: "center", padding: 48, color: c.ink3, fontSize: 13.5 }}>{carregando ? "Calculando o relatório…" : erro ? "—" : "Escolha um período."}</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="oc-kpis">
            <Kpi
              hero
              label="Receita no período"
              value={formatBRL(rel.atual.receita)}
              sub={`${rel.atual.pagamentos} pagamentos · ${formatBRL(rel.atual.receitaMensalidades)} de mensalidades`}
              delta={delta(rel.atual.receita, rel.comparacao.receita)}
              foot={rel.serie.length > 1 ? <LineChart data={rel.serie.map((s) => s.receita)} height={48} stroke={c.neon} gridLines={[]} glow showLastDot={false} /> : undefined}
            />
            <Kpi label="Atendimentos" value={rel.atual.atendimentos} sub={`antes: ${rel.comparacao.atendimentos}`} delta={delta(rel.atual.atendimentos, rel.comparacao.atendimentos)} />
            <Kpi label="Ticket médio" value={formatBRL(rel.atual.ticketMedio)} sub={`antes: ${formatBRL(rel.comparacao.ticketMedio)}`} delta={delta(rel.atual.ticketMedio, rel.comparacao.ticketMedio)} />
            <Kpi
              label="Faltas"
              value={`${rel.atual.taxaFaltas}%`}
              sub={`${rel.atual.faltas} não compareceram · ${rel.atual.cancelados} cancelaram`}
              delta={delta(rel.atual.taxaFaltas, rel.comparacao.taxaFaltas, true)}
            />
          </div>

          {/* Receita por dia + números de apoio */}
          <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 18 }}>
            <Card>
              <CardTitle sub="O que entrou no caixa, dia a dia">Receita por dia</CardTitle>
              <div style={{ marginTop: 18 }}>
                <LineChart data={rel.serie.map((s) => s.receita)} showLastDot={false} />
              </div>
              <div className="num" style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: c.ink4 }}>
                {marcos(rel.serie.map((s) => s.dia)).map((d) => (
                  <span key={d}>{isoParaDiaMes(d)}</span>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle sub="No período">Movimento</CardTitle>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
                <Linha rotulo="Clientes novos" valor={String(rel.atual.novosClientes)} antes={rel.comparacao.novosClientes} atual={rel.atual.novosClientes} />
                <Linha rotulo="Mensalidades" valor={formatBRL(rel.atual.receitaMensalidades)} antes={rel.comparacao.receitaMensalidades} atual={rel.atual.receitaMensalidades} />
                <Linha rotulo="Cancelamentos" valor={String(rel.atual.cancelados)} antes={rel.comparacao.cancelados} atual={rel.atual.cancelados} ruimSubir />
                <Linha rotulo="Não compareceram" valor={String(rel.atual.faltas)} antes={rel.comparacao.faltas} atual={rel.atual.faltas} ruimSubir />
              </div>
            </Card>
          </div>

          {/* Rankings */}
          <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 }}>
            <Ranking titulo="Por serviço" sub="Receita por item cobrado" linhas={rel.porServico} rotuloQtd="vendas" />
            <Ranking titulo="Por barbeiro" sub="Receita e atendimentos" linhas={rel.porBarbeiro} rotuloQtd="atend." />
            <Ranking titulo="Formas de pagamento" sub="Como os clientes pagam" linhas={rel.porForma} rotuloQtd="pag." />
          </div>

          {/* Mapa de calor */}
          <Card>
            <CardTitle sub="Quantos horários foram marcados em cada dia e hora — onde a casa enche e onde sobra cadeira">Horários de pico</CardTitle>
            <Calor rel={rel} />
          </Card>
        </>
      )}
    </div>
  );
}

const dataInput: React.CSSProperties = {
  border: `1px solid ${c.border}`,
  background: c.surface,
  color: c.ink,
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 13,
  fontFamily: font.sans,
  outline: "none",
};

/** Até 5 rótulos de data espalhados ao longo do eixo. */
function marcos(dias: string[]): string[] {
  if (dias.length <= 5) return dias;
  return [0, 0.25, 0.5, 0.75, 1].map((f) => dias[Math.round(f * (dias.length - 1))]);
}

function Linha({ rotulo, valor, atual, antes, ruimSubir = false }: { rotulo: string; valor: string; atual: number; antes: number; ruimSubir?: boolean }) {
  const v = variacao(atual, antes);
  const bom = v === null || v === 0 ? null : ruimSubir ? v < 0 : v > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ flex: 1, fontSize: 13, color: c.ink2 }}>{rotulo}</span>
      <span className="num" style={{ fontSize: 14, color: c.ink }}>{valor}</span>
      {v !== null && v !== 0 ? (
        <span className="num" style={{ fontSize: 10.5, borderRadius: 999, padding: "2px 7px", color: bom ? c.greenText : c.redText, background: bom ? c.greenBg : c.redBg }}>
          {v > 0 ? "▲" : "▼"} {Math.abs(v)}%
        </span>
      ) : null}
    </div>
  );
}

function Ranking({ titulo, sub, linhas, rotuloQtd }: { titulo: string; sub: string; linhas: LinhaRanking[]; rotuloQtd: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.receita));
  const total = linhas.reduce((s, l) => s + l.receita, 0);
  return (
    <Card>
      <CardTitle sub={sub}>{titulo}</CardTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 18 }}>
        {linhas.length === 0 ? <div style={{ fontSize: 13, color: c.ink3, padding: "12px 0", textAlign: "center" }}>Nada no período.</div> : null}
        {linhas.slice(0, 8).map((l, i) => (
          <div key={l.nome}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13, marginBottom: 7 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 500, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</span>
              <span style={{ fontSize: 11.5, color: c.ink3, whiteSpace: "nowrap" }}>
                {l.qtd} {rotuloQtd}
              </span>
              <span className="num" style={{ color: c.ink, whiteSpace: "nowrap" }}>{formatBRL(l.receita)}</span>
            </div>
            <div style={{ height: 8, background: c.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(l.receita / max) * 100}%`, height: "100%", borderRadius: 999, background: c.accent, opacity: 1 - Math.min(i, 5) * 0.14 }} />
            </div>
          </div>
        ))}
        {linhas.length ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: c.ink3, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 12 }}>
            <span>Total</span>
            <span className="num" style={{ color: c.ink }}>{formatBRL(total)}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Mapa de calor dia × hora, num tom só (o acento), do vazio ao cheio. */
function Calor({ rel }: { rel: Relatorio }) {
  const max = Math.max(1, ...rel.calor.flat());
  return (
    <div className="oc-scroll-x" style={{ marginTop: 18, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `44px repeat(${rel.horas.length}, minmax(26px, 1fr))`, gap: 4, minWidth: 560 }}>
        <span />
        {rel.horas.map((h) => (
          <span key={h} className="num" style={{ fontSize: 10.5, color: c.ink4, textAlign: "center" }}>
            {String(h).padStart(2, "0")}h
          </span>
        ))}
        {rel.calor.map((linha, d) => (
          <div key={DIAS[d]} style={{ display: "contents" }}>
            <span style={{ fontSize: 11.5, color: c.ink3, alignSelf: "center" }}>{DIAS[d]}</span>
            {linha.map((n, i) => (
              <span
                key={i}
                title={`${DIAS[d]} ${String(rel.horas[i]).padStart(2, "0")}h · ${n} horário${n === 1 ? "" : "s"}`}
                style={{
                  height: 26,
                  borderRadius: 6,
                  background: n ? c.accent : c.surfaceAlt,
                  opacity: n ? 0.18 + 0.82 * (n / max) : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, fontSize: 11.5, color: c.ink3 }}>
        <span>menos</span>
        {[0.18, 0.4, 0.62, 0.84, 1].map((o) => (
          <span key={o} style={{ width: 16, height: 10, borderRadius: 3, background: c.accent, opacity: o }} />
        ))}
        <span>mais</span>
      </div>
    </div>
  );
}
