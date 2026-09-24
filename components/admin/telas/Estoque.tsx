"use client";

import { useEffect, useMemo, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { useHoje } from "@/lib/useRelogio";
import { useListaProgressiva } from "@/lib/useListaProgressiva";
import { isoParaDiaMes, mesLabel } from "@/lib/date";
import { formatBRL } from "@/lib/selectors";
import { mesVizinho } from "@/lib/comissao";
import {
  FILTROS_SOLICITACAO,
  contagensSolicitacao,
  gastoDoMes,
  selectSolicitacoes,
  urgentesPendentes,
  type FiltroSolicitacao,
} from "@/lib/estoque";
import { SolicitarProdutoModal } from "@/components/admin/SolicitarProdutoModal";
import { RegistrarCompraModal } from "@/components/admin/RegistrarCompraModal";
import type { SolicitacaoProduto, StatusSolicitacao } from "@/lib/types";

const statusMeta: Record<StatusSolicitacao, { label: string; fg: string; bg: string }> = {
  pendente: { label: "Pendente", fg: c.amberText, bg: c.amberBg },
  comprado: { label: "Comprado", fg: c.greenText, bg: c.greenBg },
  cancelado: { label: "Cancelado", fg: c.ink3, bg: c.surfaceAlt },
};

const COLS = "1.7fr 0.8fr 1.1fr 1fr 0.9fr 1.3fr";

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

export function TelaEstoque() {
  const { state, dispatch, actions } = useStore();
  const toast = useToast();
  const narrow = useIsNarrow();
  const hoje = useHoje();

  const tela = state.ui.telas.estoque;
  // `mes: null` = mês corrente resolvido pelo relógio — não envelhece na virada do mês.
  const mes = tela.mes ?? hoje.slice(0, 7);
  const { filtro, busca } = tela;
  const setTela = (patch: Partial<typeof tela>) => dispatch({ type: "SET_TELA", tela: "estoque", patch });

  const [novoOpen, setNovoOpen] = useState(false);
  const [comprar, setComprar] = useState<SolicitacaoProduto | null>(null);

  const lista = useMemo(
    () => selectSolicitacoes(state.solicitacoes, filtro, mes, busca),
    [state.solicitacoes, filtro, mes, busca],
  );
  const contagens = contagensSolicitacao(state.solicitacoes, mes);
  const urgentes = urgentesPendentes(state.solicitacoes);
  const gasto = gastoDoMes(state.solicitacoes, mes);

  const { visiveis, restantes, mostrarMais } = useListaProgressiva(lista, `${filtro}|${mes}|${busca}`);

  async function cancelar(s: SolicitacaoProduto) {
    try {
      await actions.solicitacoes.update(s.id, { status: "cancelado", canceladoEm: hoje });
      toast(`“${s.produto}” cancelado.`);
    } catch {
      toast("Não foi possível cancelar.", "error");
    }
  }

  async function reabrir(s: SolicitacaoProduto) {
    try {
      await actions.solicitacoes.update(s.id, { status: "pendente" });
      toast(`“${s.produto}” voltou para a lista de compras.`);
    } catch {
      toast("Não foi possível reabrir.", "error");
    }
  }

  if (!state.ui.hidratado) return <div style={{ color: c.ink3, fontSize: 14 }}>Carregando…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1600 }}>
      {/* Banner de urgência: o que acabou não pode depender de alguém lembrar de olhar. */}
      {urgentes.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.redBg, border: `1px solid ${c.red}`, borderRadius: 12, padding: "13px 16px" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.red, flex: "none" }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: c.redText }}>
              {urgentes.length} produto{urgentes.length === 1 ? "" : "s"} em falta urgente
            </div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
              {urgentes.map((s) => s.produto).join(" · ")}
            </div>
          </div>
        </div>
      ) : null}

      {/* Navegação de mês + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        <Card pad="16px 18px">
          <div style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>Mês</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <Button variant="ghost" onClick={() => setTela({ mes: mesVizinho(mes, -1) })} style={{ padding: "6px 11px" }}>
              ‹
            </Button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: font.serif, fontSize: 17, fontWeight: 600, color: c.inkTitle }}>
              {mesLabel(`${mes}-01`)}
            </div>
            <Button variant="ghost" onClick={() => setTela({ mes: mesVizinho(mes, 1) })} style={{ padding: "6px 11px" }}>
              ›
            </Button>
          </div>
        </Card>
        <Card pad="16px 18px">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.brass }} />
            <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>Gasto no mês</span>
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: c.inkTitle, marginTop: 7 }}>
            {formatBRL(gasto)}
          </div>
          <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2 }}>
            {contagens.Compradas} compra{contagens.Compradas === 1 ? "" : "s"} registrada{contagens.Compradas === 1 ? "" : "s"}
          </div>
        </Card>
        <Card pad="16px 18px">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.amber }} />
            <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>Esperando compra</span>
          </div>
          <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: c.inkTitle, marginTop: 7 }}>
            {contagens.Pendentes}
          </div>
          <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2 }}>de todos os meses</div>
        </Card>
      </div>

      {/* Lista */}
      <Card pad="0">
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>Produtos</span>
          <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>
            {lista.length}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "8px 12px", width: narrow ? "100%" : 220 }}>
            <span style={{ width: 13, height: 13, border: `1.6px solid ${c.ink4}`, borderRadius: "50%", flex: "none" }} />
            <input
              value={busca}
              onChange={(e) => setTela({ busca: e.target.value })}
              placeholder="Buscar produto…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: c.inkTitle, fontFamily: font.sans }}
            />
          </div>
          <Button onClick={() => setNovoOpen(true)}>+ Produto em falta</Button>
        </div>

        {/* Pills de status */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "13px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
          {FILTROS_SOLICITACAO.map((f) => {
            const ativo = f === filtro;
            return (
              <button
                key={f}
                onClick={() => setTela({ filtro: f as FiltroSolicitacao })}
                style={{
                  border: `1px solid ${ativo ? c.brass : c.border}`,
                  background: ativo ? c.brassTint : c.surface,
                  color: ativo ? c.brassDeep : c.ink2,
                  borderRadius: 999,
                  padding: "6px 13px",
                  fontSize: 12.5,
                  fontWeight: ativo ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: font.sans,
                }}
              >
                {f} · {contagens[f]}
              </button>
            );
          })}
          {filtro === "Pendentes" ? (
            <span style={{ alignSelf: "center", fontSize: 11.5, color: c.ink3 }}>
              Pendentes de qualquer mês — uma falta não expira na virada do mês.
            </span>
          ) : null}
        </div>

        {/* Cabeçalho (só no desktop) */}
        {!narrow ? (
          <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "11px 20px", borderBottom: `1px solid ${c.borderSoft}`, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: c.ink3, fontWeight: 700 }}>
            <span>Produto</span>
            <span>Qtd</span>
            <span>Pedido</span>
            <span>Por</span>
            <span>Custo</span>
            <span style={{ textAlign: "right" }}>Status / ação</span>
          </div>
        ) : null}

        {lista.length === 0 ? (
          <div style={{ padding: "34px 20px", textAlign: "center", color: c.ink3, fontSize: 13.5 }}>
            {busca.trim()
              ? `Nenhum produto encontrado para “${busca.trim()}”.`
              : filtro === "Pendentes"
                ? "Nada em falta. Quando faltar algo, registre aqui."
                : `Nenhum registro em ${mesLabel(`${mes}-01`)}.`}
          </div>
        ) : (
          visiveis.map((s) => {
            const meta = statusMeta[s.status];
            const unidade = s.unidade ? ` ${s.unidade}` : "";
            const acoes = (
              <div style={{ display: "flex", gap: 7, justifyContent: narrow ? "flex-start" : "flex-end", flexWrap: "wrap" }}>
                {s.status === "pendente" ? (
                  <>
                    <Button variant="pill" onClick={() => setComprar(s)} style={{ padding: "6px 12px", fontSize: 12 }}>
                      Registrar compra
                    </Button>
                    <Button variant="ghost" onClick={() => cancelar(s)} style={{ padding: "6px 11px", fontSize: 12 }}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" onClick={() => reabrir(s)} style={{ padding: "6px 11px", fontSize: 12 }}>
                    Reabrir
                  </Button>
                )}
              </div>
            );

            if (narrow) {
              return (
                <div key={s.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${c.borderSoft}`, display: "flex", flexDirection: "column", gap: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle }}>{s.produto}</span>
                    <span style={{ fontSize: 12, color: c.ink2 }}>
                      {s.quantidade}
                      {unidade}
                    </span>
                    <span style={{ background: meta.bg, color: meta.fg, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
                      {meta.label}
                    </span>
                    {s.status === "pendente" && s.urgencia === "urgente" ? (
                      <span style={{ background: c.redBg, color: c.redText, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
                        Urgente
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: c.ink3 }}>
                    Pedido {isoParaDiaMes(s.solicitadoEm)} por {s.solicitadoPor || "—"}
                    {s.compradoEm ? ` · comprado ${isoParaDiaMes(s.compradoEm)}` : ""}
                    {typeof s.custo === "number" ? ` · ${formatBRL(s.custo)}` : ""}
                  </div>
                  {s.observacoes ? <div style={{ fontSize: 12, color: c.ink2 }}>{s.observacoes}</div> : null}
                  {acoes}
                </div>
              );
            }

            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, alignItems: "center", padding: "13px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.produto}
                    </span>
                    {s.status === "pendente" && s.urgencia === "urgente" ? (
                      <span title="Falta urgente" style={{ width: 7, height: 7, borderRadius: "50%", background: c.red, flex: "none" }} />
                    ) : null}
                  </div>
                  {s.observacoes ? (
                    <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.observacoes}
                    </div>
                  ) : null}
                </div>
                <span style={{ fontSize: 13, color: c.ink2 }}>
                  {s.quantidade}
                  {unidade}
                </span>
                <span style={{ fontSize: 13, color: c.ink2 }}>
                  {isoParaDiaMes(s.solicitadoEm)}
                  {s.compradoEm ? (
                    <span style={{ fontSize: 11.5, color: c.ink3 }}> → {isoParaDiaMes(s.compradoEm)}</span>
                  ) : null}
                </span>
                <span style={{ fontSize: 13, color: c.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.status === "comprado" ? (s.compradoPor || s.solicitadoPor) : s.solicitadoPor}
                </span>
                <span style={{ fontSize: 13, color: typeof s.custo === "number" ? c.inkTitle : c.ink4, fontWeight: typeof s.custo === "number" ? 600 : 400 }}>
                  {typeof s.custo === "number" ? formatBRL(s.custo) : "—"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <span style={{ background: meta.bg, color: meta.fg, borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>
                    {meta.label}
                  </span>
                  {acoes}
                </div>
              </div>
            );
          })
        )}

        {restantes > 0 ? (
          <div style={{ padding: "14px 20px", textAlign: "center" }}>
            <Button variant="ghost" onClick={mostrarMais}>
              Mostrar mais ({restantes})
            </Button>
          </div>
        ) : null}
      </Card>

      <SolicitarProdutoModal open={novoOpen} onClose={() => setNovoOpen(false)} />
      <RegistrarCompraModal solicitacao={comprar} onClose={() => setComprar(null)} />
    </div>
  );
}
