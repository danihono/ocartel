"use client";

import { ExportarBotao } from "@/components/ui/ExportarBotao";
import { abasComissoes, baixarPlanilha, nomeArquivo } from "@/lib/exportar";
import { useEffect, useMemo, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Kpi } from "@/components/ui/Kpi";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import { useHoje } from "@/lib/useRelogio";
import { useListaProgressiva } from "@/lib/useListaProgressiva";
import { addDias, isoParaDiaMes, mesLabel } from "@/lib/date";
import { formaPagamentoLabel, formatBRLCentavos } from "@/lib/selectors";
import {
  FICHAS_PADRAO,
  ITENS_FICHA,
  apurarMes,
  mesVizinho,
  montarFechamento,
  type ApuracaoMes,
  type ResumoBarbeiro,
} from "@/lib/comissao";
import type { LinhaComissao, RegraComissao } from "@/lib/types";

const COLS_BARBEIRO = "1.5fr 0.8fr 0.8fr 1fr 1fr 1fr 1.4fr";
const COLS_LINHA = "0.8fr 1.4fr 1.4fr 1fr 1fr 0.9fr";

/** true abaixo de 760px — SSR-safe (começa false, igual ao servidor, e ajusta pós-mount). */
function useIsNarrow(maxWidth = 759): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return narrow;
}

const fmtNum = (n: number, casas = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtPct = (fracao: number) => `${fmtNum(fracao * 100, 2)}%`;

/**
 * O resuminho do pote da assinatura: a conta do mês passo a passo, com os números reais,
 * para quem fecha o mês conferir de olho o que o sistema fez.
 */
function ResumoPoteCard({ apuracao, regra, mes }: { apuracao: ApuracaoMes; regra: RegraComissao; mes: string }) {
  const { pote } = apuracao;
  const fichas = regra.pote?.fichas ?? FICHAS_PADRAO;
  const comFichas = apuracao.porBarbeiro.filter((r) => r.fichas > 0).sort((a, b) => b.fichas - a.fichas);

  const passo = (rotulo: string, valor: string, sub?: string) => (
    <div style={{ flex: "1 1 150px", background: c.surfaceWarm, borderRadius: 12, padding: "11px 14px" }}>
      <div style={{ fontSize: 11, color: c.ink3, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{rotulo}</div>
      <div className="num" style={{ fontSize: 17, fontWeight: 650, color: c.inkTitle, marginTop: 4 }}>{valor}</div>
      {sub ? <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );

  return (
    <Card pad="18px 20px">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.inkTitle }}>Pote da assinatura</span>
        <span className="oc-chip num" style={{ color: c.ink2, background: c.surfaceAlt, fontWeight: 500 }}>
          {mesLabel(`${mes}-01`)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        {passo("Assinaturas recebidas", formatBRLCentavos(pote.receitaAssinaturas))}
        {passo(`${fmtNum(pote.pct, pote.pct % 1 ? 2 : 0)}% vai pro pote`, formatBRLCentavos(pote.valor))}
        {passo(
          "Fichas da equipe",
          fmtNum(pote.totalFichas),
          pote.totalFichas > 0 ? `cada ficha vale ${formatBRLCentavos(pote.valorPorFicha)}` : undefined,
        )}
      </div>

      {comFichas.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
          {comFichas.map((r) => (
            <div
              key={r.barbeiroId}
              style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${c.borderSoft}`, fontSize: 13 }}
            >
              <span style={{ fontWeight: 600, color: c.inkTitle, minWidth: 110 }}>{r.barbeiroNome}</span>
              <span className="num" style={{ color: c.ink2 }}>
                {fmtNum(r.fichas)} ÷ {fmtNum(pote.totalFichas)} fichas = {fmtPct(r.participacao)}
              </span>
              <span style={{ flex: 1 }} />
              <span className="num" style={{ color: c.ink3, fontSize: 12 }}>
                {formatBRLCentavos(pote.valor)} × {fmtPct(r.participacao)} =
              </span>
              <span className="num" style={{ fontWeight: 700, color: c.brassDeep }}>{formatBRLCentavos(r.valorPote)}</span>
            </div>
          ))}
        </div>
      ) : pote.valor > 0 ? (
        <div style={{ fontSize: 12.5, color: c.amberText, marginTop: 12, fontWeight: 600 }}>
          Nenhum atendimento coberto pelo plano foi concluído neste mês, então o pote ainda não tem pra quem ir.
        </div>
      ) : null}

      <div style={{ fontSize: 12, color: c.ink3, marginTop: 12, lineHeight: 1.55, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 10 }}>
        <strong style={{ color: c.ink2 }}>Como a conta é feita:</strong> {fmtNum(pote.pct, pote.pct % 1 ? 2 : 0)}% das
        mensalidades recebidas no mês formam o pote. Cada atendimento coberto pelo plano rende fichas:{" "}
        {ITENS_FICHA.map((i) => `${i.nome.toLowerCase()} ${fichas[i.id].cheia}`).join(", ")}. Se o cliente repete a
        mesma peça na semana (segunda a domingo), ela vale{" "}
        {ITENS_FICHA.map((i) => `${i.nome.toLowerCase()} ${fichas[i.id].repetida}`).join(", ")}. A parte de cada
        barbeiro é o pote × (fichas dele ÷ fichas da equipe). Isso soma com o percentual dos avulsos, se houver.
      </div>
    </Card>
  );
}

/** Rótulo curto do que aconteceu com a cobrança daquela linha. */
function situacaoLinha(l: LinhaComissao): { label: string; fg: string; bg: string } {
  if (l.cobertoPorPlano) return { label: "Coberto pelo plano", fg: c.brassDeep, bg: c.brassTint };
  if (l.vinculo === "sem-cobranca") return { label: "Sem cobrança", fg: c.ink3, bg: c.surfaceAlt };
  if (l.status === "pago") return { label: l.pagoNoAto ? "Pago na hora" : "Pago", fg: c.greenText, bg: c.greenBg };
  if (l.status === "atrasado") return { label: "Atrasado", fg: c.redText, bg: c.redBg };
  return { label: "Pendente", fg: c.amberText, bg: c.amberBg };
}

export function TelaComissoes() {
  const { state, dispatch, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();
  const narrow = useIsNarrow();
  const hoje = useHoje();

  const tela = state.ui.telas.comissoes;
  // `mes: null` = mês corrente resolvido pelo relógio — não envelhece na virada do mês.
  const mes = tela.mes ?? hoje.slice(0, 7);
  const barbeiroId = tela.barbeiroId;
  const setTela = (patch: Partial<typeof tela>) => dispatch({ type: "SET_TELA", tela: "comissoes", patch });

  const [fechando, setFechando] = useState<string | null>(null);

  const regra = state.regraComissao;
  const apuracao = useMemo(
    () =>
      apurarMes(
        {
          agendamentos: state.agendamentos,
          transacoes: state.transacoes,
          barbeiros: state.barbeiros,
          servicos: state.servicos,
        },
        mes,
        regra,
        state.fechamentos,
        hoje,
      ),
    [state.agendamentos, state.transacoes, state.barbeiros, state.servicos, state.fechamentos, mes, regra, hoje],
  );

  // O store só carrega agendamentos dos últimos ~180 dias (ver lib/store.tsx). Recalcular um
  // mês fora dessa janela mostraria uma comissão MENOR que a real, e é exatamente o tipo de
  // erro que ninguém percebe. Fora da janela, quem manda é o fechamento gravado.
  const foraDaJanela = mes < addDias(hoje, -180).slice(0, 7);
  const fechamentosDoMes = state.fechamentos.filter((f) => f.mes === mes);

  const selecionado = barbeiroId ? apuracao.porBarbeiro.find((r) => r.barbeiroId === barbeiroId) : undefined;
  const linhasDoBarbeiro = useMemo(
    () =>
      barbeiroId
        ? apuracao.linhas.filter((l) => l.origem === "atendimento" && l.barbeiroId === barbeiroId)
        : [],
    [apuracao.linhas, barbeiroId],
  );
  const { visiveis, restantes, mostrarMais } = useListaProgressiva(linhasDoBarbeiro, `${mes}|${barbeiroId ?? ""}`);

  const totalPago = fechamentosDoMes.filter((f) => f.pagoEm).reduce((s, f) => s + f.total, 0);
  const totalFechado = fechamentosDoMes.reduce((s, f) => s + f.total, 0);
  const mensalidades = apuracao.linhas.filter((l) => l.origem === "mensalidade");

  async function fecharMes(resumo: ResumoBarbeiro) {
    const quem = profile?.nome ?? state.auth.nome;
    const f = montarFechamento(resumo, mes, regra, quem, new Date().toISOString());
    setFechando(resumo.barbeiroId);
    try {
      await actions.comissoes.fechar(f);
      toast(`${resumo.barbeiroNome}: ${mesLabel(`${mes}-01`)} fechado em ${formatBRLCentavos(f.total)}.`);
    } catch {
      toast("Não foi possível fechar o mês.", "error");
    } finally {
      setFechando(null);
    }
  }

  async function pagar(resumo: ResumoBarbeiro) {
    if (!resumo.fechamento) return;
    try {
      await actions.comissoes.registrarPagamento(resumo.fechamento.id, {
        pagoEm: hoje,
        pagoPor: profile?.nome ?? state.auth.nome,
      });
      toast(`Comissão de ${resumo.barbeiroNome} marcada como paga.`);
    } catch {
      toast("Não foi possível registrar o pagamento.", "error");
    }
  }

  async function reabrir(resumo: ResumoBarbeiro) {
    if (!resumo.fechamento) return;
    try {
      await actions.comissoes.reabrir(resumo.fechamento.id);
      toast(`${mesLabel(`${mes}-01`)} de ${resumo.barbeiroNome} reaberto.`);
    } catch {
      toast("Não foi possível reabrir o mês.", "error");
    }
  }

  if (!state.ui.hidratado) return <div style={{ color: c.ink3, fontSize: 14 }}>Carregando…</div>;

  const semRegra =
    regra.pctPadrao === 0 && Object.keys(regra.pctPorBarbeiro ?? {}).length === 0 && !apuracao.pote.ativo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1600 }}>
      {/* Avisos que precisam vir ANTES de alguém fechar um mês */}
      {semRegra ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.amberBg, borderRadius: 14, padding: "13px 16px" }}>
          <span style={{ color: c.amber, flex: "none" }}><Icon name="alerta" size={18} /></span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: c.amberText }}>Nenhuma comissão configurada</div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
              Defina o pote da assinatura e os percentuais em Configurações → Comissões. Até lá a apuração fica em R$ 0,00.
            </div>
          </div>
        </div>
      ) : null}

      {apuracao.qtdInferidas > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.amberBg, borderRadius: 14, padding: "13px 16px" }}>
          <span style={{ color: c.amber, flex: "none" }}><Icon name="alerta" size={18} /></span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: c.amberText }}>
              {apuracao.qtdInferidas} atendimento{apuracao.qtdInferidas === 1 ? "" : "s"} com cobrança deduzida
            </div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
              São registros antigos, sem vínculo direto com a cobrança: o valor foi casado por barbeiro,
              serviço e data. Confira o detalhe antes de fechar o mês.
            </div>
          </div>
        </div>
      ) : null}

      {foraDaJanela ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.surfaceAlt, borderRadius: 14, padding: "13px 16px" }}>
          <span style={{ color: c.ink4, flex: "none" }}><Icon name="info" size={18} /></span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: c.ink }}>Mês fora da janela carregada</div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
              O painel mantém em memória os últimos 6 meses de atendimentos. Para meses anteriores,
              vale o fechamento gravado — a apuração recalculada aqui estaria incompleta.
            </div>
          </div>
        </div>
      ) : null}

      {/* Mês + KPIs: a comissão apurada é o herói */}
      <div className="oc-kpis">
        <Kpi
          hero
          label="Comissão apurada"
          value={formatBRLCentavos(apuracao.totalComissao)}
          sub={
            apuracao.pote.ativo
              ? `pote ${formatBRLCentavos(apuracao.pote.valor)} + avulsos`
              : `sobre ${formatBRLCentavos(apuracao.totalFaturamento)} recebidos`
          }
        />
        <Card pad="18px 20px" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 138 }}>
          <span className="oc-label">Mês</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
            <button className="oc-icon-btn" aria-label="Mês anterior" onClick={() => setTela({ mes: mesVizinho(mes, -1), barbeiroId: null })}>
              <Icon name="chevronEsq" size={16} />
            </button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: c.inkTitle, textTransform: "capitalize" }}>
              {mesLabel(`${mes}-01`)}
            </div>
            <button className="oc-icon-btn" aria-label="Próximo mês" onClick={() => setTela({ mes: mesVizinho(mes, 1), barbeiroId: null })}>
              <Icon name="chevronDir" size={16} />
            </button>
          </div>
        </Card>
        <Kpi label="Já fechado" value={formatBRLCentavos(totalFechado)} sub={`${fechamentosDoMes.length} de ${state.barbeiros.length} barbeiro(s)`} />
        <Kpi label="Pago aos barbeiros" value={formatBRLCentavos(totalPago)} sub={`a pagar ${formatBRLCentavos(totalFechado - totalPago)}`} />
      </div>

      {apuracao.pote.ativo ? <ResumoPoteCard apuracao={apuracao} regra={regra} mes={mes} /> : null}

      {/* Todos os barbeiros */}
      <Card pad="0">
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.inkTitle }}>Por barbeiro</span>
          <span className="oc-chip num" style={{ color: c.ink2, background: c.surfaceAlt, fontWeight: 500 }}>
            {mesLabel(`${mes}-01`)}
          </span>
          <span style={{ flex: 1 }} />
          <ExportarBotao onExportar={(f) => baixarPlanilha(nomeArquivo("comissoes", mes, f), abasComissoes(apuracao), f)} />
        </div>

        {!narrow ? (
          <div style={{ display: "grid", gridTemplateColumns: COLS_BARBEIRO, gap: 12, padding: "11px 20px", borderBottom: `1px solid ${c.borderSoft}`, fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>
            <span>Barbeiro</span>
            <span>Atendimentos</span>
            <span>Fichas</span>
            <span>Pote</span>
            <span>Avulsos</span>
            <span>Total</span>
            <span style={{ textAlign: "right" }}>Fechamento</span>
          </div>
        ) : null}

        {state.barbeiros.length === 0 ? (
          <div style={{ padding: "34px 20px", textAlign: "center", color: c.ink3, fontSize: 13.5 }}>
            Nenhum barbeiro cadastrado. Cadastre a equipe em Configurações.
          </div>
        ) : (
          apuracao.porBarbeiro.map((r) => {
            const f = r.fechamento;
            const divergente = f && Math.abs(f.total - r.comissao) > 0.009;
            const aberto = r.barbeiroId === barbeiroId;

            const acoes = (
              <div style={{ display: "flex", gap: 7, justifyContent: narrow ? "flex-start" : "flex-end", flexWrap: "wrap", alignItems: "center" }}>
                {!f ? (
                  <Button
                    variant="pill"
                    onClick={() => fecharMes(r)}
                    loading={fechando === r.barbeiroId}
                    disabled={r.atendimentos === 0}
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    Fechar mês
                  </Button>
                ) : f.pagoEm ? (
                  <>
                    <span style={{ background: c.greenBg, color: c.greenText, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>
                      Pago {isoParaDiaMes(f.pagoEm)}
                    </span>
                    <span style={{ fontSize: 12, color: c.ink3 }}>{formatBRLCentavos(f.total)}</span>
                  </>
                ) : (
                  <>
                    <Button variant="pill" onClick={() => pagar(r)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      Marcar como paga
                    </Button>
                    <Button variant="ghost" onClick={() => reabrir(r)} style={{ padding: "6px 11px", fontSize: 12 }}>
                      Reabrir
                    </Button>
                  </>
                )}
              </div>
            );

            const linhaResumo = narrow ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle }}>{r.barbeiroNome}</span>
                  <span style={{ fontFamily: font.serif, fontSize: 16, fontWeight: 600, color: c.brassDeep }}>
                    {formatBRLCentavos(r.comissao)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: c.ink3 }}>
                  {r.atendimentos} atendimento{r.atendimentos === 1 ? "" : "s"}
                  {apuracao.pote.ativo ? ` · ${fmtNum(r.fichas)} fichas → pote ${formatBRLCentavos(r.valorPote)}` : ""}
                  {` · avulsos ${formatBRLCentavos(r.comissaoAvulso)} (${r.pct}% de ${formatBRLCentavos(r.faturamento)})`}
                </div>
                {acoes}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: COLS_BARBEIRO, gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle }}>{r.barbeiroNome}</span>
                <span style={{ fontSize: 13, color: c.ink2 }}>{r.atendimentos}</span>
                <span style={{ fontSize: 13, color: c.ink2 }}>
                  {fmtNum(r.fichas)}
                  {r.fichas > 0 ? <span style={{ color: c.ink4, fontSize: 11.5 }}> · {fmtPct(r.participacao)}</span> : null}
                </span>
                <span style={{ fontSize: 13, color: c.ink2 }}>{formatBRLCentavos(r.valorPote)}</span>
                <span style={{ fontSize: 13, color: c.ink2 }} title={`${r.pct}% de ${formatBRLCentavos(r.faturamento)} recebidos`}>
                  {formatBRLCentavos(r.comissaoAvulso)}
                  <span style={{ color: c.ink4, fontSize: 11.5 }}> · {r.pct}%</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: c.brassDeep }}>{formatBRLCentavos(r.comissao)}</span>
                {acoes}
              </div>
            );

            return (
              <div key={r.barbeiroId} style={{ borderBottom: `1px solid ${c.borderSoft}` }}>
                <div
                  onClick={() => setTela({ barbeiroId: aberto ? null : r.barbeiroId })}
                  style={{ padding: narrow ? "14px 18px" : "13px 20px", cursor: "pointer", background: aberto ? c.brassTint : "transparent" }}
                >
                  {linhaResumo}
                  {divergente ? (
                    <div style={{ fontSize: 11.5, color: c.amberText, marginTop: 5, fontWeight: 600 }}>
                      Fechado em {formatBRLCentavos(f.total)}, apuração hoje dá {formatBRLCentavos(r.comissao)} — o fechamento
                      guarda a regra do dia em que foi feito. Reabra se quiser refazer.
                    </div>
                  ) : null}
                </div>

                {/* Detalhe: cada corte que compôs o valor */}
                {aberto ? (
                  <div style={{ background: c.surfaceWarm, borderTop: `1px solid ${c.border}` }}>
                    {!narrow ? (
                      <div style={{ display: "grid", gridTemplateColumns: COLS_LINHA, gap: 12, padding: "10px 20px", fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>
                        <span>Data</span>
                        <span>Cliente</span>
                        <span>Serviço</span>
                        <span>Recebido</span>
                        <span>Situação</span>
                        <span style={{ textAlign: "right" }}>Comissão / fichas</span>
                      </div>
                    ) : null}

                    {linhasDoBarbeiro.length === 0 ? (
                      <div style={{ padding: "22px 20px", textAlign: "center", color: c.ink3, fontSize: 13 }}>
                        Nenhum atendimento concluído em {mesLabel(`${mes}-01`)}.
                      </div>
                    ) : (
                      visiveis.map((l) => {
                        const sit = situacaoLinha(l);
                        return (
                          <div
                            key={l.id}
                            style={{
                              display: narrow ? "flex" : "grid",
                              flexDirection: narrow ? "column" : undefined,
                              gap: narrow ? 4 : 12,
                              gridTemplateColumns: narrow ? undefined : COLS_LINHA,
                              alignItems: narrow ? "flex-start" : "center",
                              padding: narrow ? "11px 18px" : "10px 20px",
                              borderTop: `1px solid ${c.borderSoft}`,
                              fontSize: 12.5,
                              color: c.ink2,
                            }}
                          >
                            <span>{isoParaDiaMes(l.dataISO)}</span>
                            <span style={{ color: c.inkTitle, fontWeight: 600 }}>{l.clienteNome}</span>
                            <span>
                              {l.servico}
                              {l.forma ? <span style={{ color: c.ink4 }}> · {formaPagamentoLabel[l.forma]}</span> : null}
                            </span>
                            <span>{formatBRLCentavos(l.valorRecebido)}</span>
                            <span>
                              <span style={{ background: sit.bg, color: sit.fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
                                {sit.label}
                              </span>
                              {l.vinculo === "inferido" ? (
                                <span title="Cobrança deduzida de um registro antigo" style={{ marginLeft: 6, color: c.amberText, fontWeight: 700 }}>
                                  ~
                                </span>
                              ) : null}
                            </span>
                            <span style={{ textAlign: narrow ? "left" : "right", fontWeight: 700, color: l.comissao > 0 || l.fichas > 0 ? c.brassDeep : c.ink4 }}>
                              {l.fichas > 0 ? (
                                <span title={l.repetidaNaSemana ? "Cliente repetiu a peça na semana: ficha reduzida" : undefined}>
                                  {fmtNum(l.fichas)} fichas
                                  {l.repetidaNaSemana ? <span style={{ color: c.ink4, fontWeight: 500 }}> · repetido</span> : null}
                                </span>
                              ) : (
                                formatBRLCentavos(l.comissao)
                              )}
                            </span>
                          </div>
                        );
                      })
                    )}

                    {restantes > 0 ? (
                      <div style={{ padding: "12px 20px", textAlign: "center", borderTop: `1px solid ${c.borderSoft}` }}>
                        <Button variant="ghost" onClick={mostrarMais}>
                          Mostrar mais ({restantes})
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {/* Total consolidado */}
        {state.barbeiros.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: c.surfaceWarm }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: c.ink2, textTransform: "uppercase", letterSpacing: 1 }}>
              Total do mês
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12.5, color: c.ink3 }}>
              {apuracao.porBarbeiro.reduce((s, r) => s + r.atendimentos, 0)} atendimentos ·{" "}
              {formatBRLCentavos(apuracao.totalFaturamento)} recebidos
            </span>
            <span style={{ fontFamily: font.serif, fontSize: 19, fontWeight: 600, color: c.brassDeep }}>
              {formatBRLCentavos(apuracao.totalComissao)}
            </span>
          </div>
        ) : null}
      </Card>

      {/* Mensalidades: aparecem porque entram na conta do mês, mas não são de ninguém ainda */}
      {mensalidades.length > 0 ? (
        <Card pad="16px 20px">
          <div style={{ fontSize: 13.5, fontWeight: 700, color: c.inkTitle }}>
            {mensalidades.length} mensalidade{mensalidades.length === 1 ? "" : "s"} em {mesLabel(`${mes}-01`)} ·{" "}
            {formatBRLCentavos(mensalidades.reduce((s, l) => s + l.valorRecebido, 0))} recebidos
          </div>
          <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 4 }}>
            {apuracao.pote.ativo
              ? `É daqui que sai o pote da assinatura: ${apuracao.pote.pct}% do recebido, repartido pelas fichas acima.`
              : "Mensalidade não é de um barbeiro específico. Para repartir uma parte dela pelas fichas, ligue o pote da assinatura em Configurações → Comissões."}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
