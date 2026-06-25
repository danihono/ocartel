"use client";

import { useEffect, useMemo, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import {
  ehDoCliente,
  formaPagamentoLabel,
  formatBRL,
  selectContagensTransacao,
  selectResumoFinanceiro,
  selectTransacoes,
  statusCobranca,
  tipoCobranca,
  valorCobrado,
  valorRecebido,
  type FiltroTipoCobranca,
  type FiltroTransacao,
} from "@/lib/selectors";
import { HOJE_ISO, isoParaDiaMes } from "@/lib/date";
import { RegistrarPagamentoModal } from "@/components/admin/RegistrarPagamentoModal";
import { NovaCobrancaModal } from "@/components/admin/NovaCobrancaModal";
import type { Transacao, TransacaoStatus } from "@/lib/types";

const FILTROS: FiltroTransacao[] = ["Todas", "Pagas", "Pendentes", "Atrasadas"];
const TIPOS: { value: FiltroTipoCobranca; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "mensalidade", label: "Mensalidade" },
  { value: "avulso", label: "Avulso" },
];
const statusMeta: Record<TransacaoStatus, { label: string; fg: string; bg: string }> = {
  pago: { label: "Pago", fg: c.greenText, bg: c.greenBg },
  pendente: { label: "Pendente", fg: c.amberText, bg: c.amberBg },
  atrasado: { label: "Atrasado", fg: c.redText, bg: c.redBg },
};
const PRIORIDADE: Record<TransacaoStatus, number> = { atrasado: 0, pendente: 1, pago: 2 };
const COLS = "1.3fr 1.4fr 0.9fr 1fr 0.9fr 1fr 1.2fr";

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

/** Data exibida: pagamento (se pago) ou vencimento (se em aberto). */
function dataExibida(t: Transacao): string {
  if (statusCobranca(t) === "pago") return t.paidAt ? isoParaDiaMes(t.paidAt) : t.data;
  return t.dueDate ? isoParaDiaMes(t.dueDate) : t.data;
}

export default function PagamentosPage() {
  const { state, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();
  const narrow = useIsNarrow();

  const [filtro, setFiltro] = useState<FiltroTransacao>("Todas");
  const [tipo, setTipo] = useState<FiltroTipoCobranca>("todos");
  const [busca, setBusca] = useState("");
  const [novaOpen, setNovaOpen] = useState(false);
  const [pagar, setPagar] = useState<Transacao | null>(null);

  const resumo = selectResumoFinanceiro(state);
  const contagens = selectContagensTransacao(state, tipo);
  const transacoes = useMemo(() => {
    const lista = selectTransacoes(state, filtro, busca, tipo);
    return [...lista].sort((a, b) => {
      const pa = PRIORIDADE[statusCobranca(a)];
      const pb = PRIORIDADE[statusCobranca(b)];
      if (pa !== pb) return pa - pb;
      const da = a.dueDate ?? a.paidAt ?? "";
      const db = b.dueDate ?? b.paidAt ?? "";
      return db.localeCompare(da);
    });
  }, [state, filtro, busca, tipo]);

  const kpis = [
    { l: "Recebido este mês", v: formatBRL(resumo.recebidoMes), dot: c.green, sub: "" },
    { l: "A receber", v: formatBRL(resumo.aReceber), dot: c.brass, sub: "" },
    { l: "Em atraso", v: formatBRL(resumo.emAtraso), dot: c.red, sub: `${resumo.qtdAtraso} cobrança${resumo.qtdAtraso === 1 ? "" : "s"}` },
  ];

  function gerarMensalidades() {
    const cicloMes = HOJE_ISO.slice(0, 7); // "YYYY-MM"
    const venc = `${cicloMes}-10`; // vencimento dia 10 do ciclo
    const ativos = state.clientes.filter((cl) => cl.plano && !/avulso/i.test(cl.plano));

    const valorAnterior = (cl: (typeof ativos)[number]): number | null => {
      const ant = state.transacoes
        .filter((t) => tipoCobranca(t) === "mensalidade" && ehDoCliente(t, cl))
        .sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? ""))[0];
      return ant ? valorCobrado(ant) : null;
    };

    const novas: Transacao[] = [];
    let semValor = 0;
    for (const cl of ativos) {
      const jaTem = state.transacoes.some(
        (t) => tipoCobranca(t) === "mensalidade" && ehDoCliente(t, cl) && (t.dueDate ?? "").slice(0, 7) === cicloMes,
      );
      if (jaTem) continue;
      const valor = valorAnterior(cl);
      if (valor == null) {
        semValor += 1; // sem mensalidade anterior → não dá pra inferir o valor
        continue;
      }
      novas.push({
        id: makeId("tx"),
        data: isoParaDiaMes(venc),
        clienteNome: cl.nome,
        clienteId: cl.id,
        servico: cl.plano,
        barbeiroNome: "",
        valor,
        status: "pendente",
        forma: "pix",
        type: "mensalidade",
        dueDate: venc,
        amount: valor,
        source: "manual",
      });
    }

    if (novas.length === 0) {
      toast(
        semValor > 0
          ? `Nada gerado: ${semValor} cliente(s) sem mensalidade anterior. Crie a 1ª manualmente.`
          : "Mensalidades deste mês já geradas.",
        semValor > 0 ? "error" : undefined,
      );
      return;
    }
    void actions.transacoes
      .gerarMensalidades(novas)
      .then(() =>
        toast(
          `${novas.length} mensalidade${novas.length === 1 ? "" : "s"} gerada${novas.length === 1 ? "" : "s"}` +
            (semValor > 0 ? ` · ${semValor} sem valor anterior` : ""),
        ),
      )
      .catch(() => toast("Não foi possível gerar as mensalidades.", "error"));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1600 }}>
      {/* Banner de inadimplência */}
      {resumo.qtdAtraso > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.redBg, border: `1px solid ${c.red}`, borderRadius: 12, padding: "13px 16px" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.red, flex: "none" }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: c.redText }}>
              {resumo.qtdAtraso} cobrança{resumo.qtdAtraso === 1 ? "" : "s"} em atraso · {formatBRL(resumo.emAtraso)}
            </div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>
              Esses clientes aparecem como “Inadimplente” no módulo Clientes.
            </div>
          </div>
        </div>
      ) : null}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        {kpis.map((k) => (
          <Card key={k.l} pad="16px 18px">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: k.dot }} />
              <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>{k.l}</span>
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: c.inkTitle, marginTop: 7 }}>{k.v}</div>
            {k.sub ? <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 2 }}>{k.sub}</div> : null}
          </Card>
        ))}
      </div>

      {/* Lista de cobranças */}
      <Card pad="0">
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>Cobranças</span>
          <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>{transacoes.length}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "8px 12px", width: narrow ? "100%" : 220 }}>
            <span style={{ width: 13, height: 13, border: `1.6px solid ${c.ink4}`, borderRadius: "50%", flex: "none" }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: c.inkTitle, fontFamily: font.sans }} />
          </div>
          <Button variant="ghost" onClick={gerarMensalidades}>Gerar mensalidades do mês</Button>
          <Button onClick={() => setNovaOpen(true)}>+ Nova cobrança</Button>
        </div>

        {/* Filtro por tipo */}
        <div style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
          {TIPOS.map((t) => {
            const on = t.value === tipo;
            return (
              <button key={t.value} onClick={() => setTipo(t.value)} style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 600, color: on ? c.inkTitle : c.ink3, background: on ? c.brassSoft : c.surfaceWarm, borderRadius: 999, padding: "5px 12px" }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Pills de status com contagem */}
        <div style={{ display: "flex", gap: 6, padding: "10px 20px 12px", borderBottom: `1px solid ${c.borderSoft}`, flexWrap: "wrap" }}>
          {FILTROS.map((f) => {
            const on = f === filtro;
            return (
              <button key={f} onClick={() => setFiltro(f)} style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 600, color: on ? c.inkTitle : c.ink3, background: on ? c.brassSoft : c.surfaceWarm, borderRadius: 999, padding: "5px 12px" }}>
                {f} <span style={{ opacity: 0.6 }}>{contagens[f]}</span>
              </button>
            );
          })}
        </div>

        {/* Cabeçalho da tabela (desktop) */}
        {!narrow ? (
          <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "12px 20px", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: c.ink3, fontWeight: 600, borderBottom: `1px solid ${c.borderSoft}` }}>
            <span>Cliente</span>
            <span>Item</span>
            <span>Data</span>
            <span>Valor</span>
            <span>Status</span>
            <span>Forma</span>
            <span />
          </div>
        ) : null}

        {transacoes.map((t) => {
          const st = statusCobranca(t);
          const sm = statusMeta[st];
          const cobrado = valorCobrado(t);
          const recebido = valorRecebido(t);
          const divergente = st === "pago" && cobrado !== recebido;
          const valorMostrado = st === "pago" ? recebido : cobrado;

          if (narrow) {
            // Card (mobile)
            return (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle, flex: 1 }}>{t.clienteNome}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
                </div>
                <div style={{ fontSize: 13, color: c.ink2 }}>{t.servico} · {dataExibida(t)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: c.inkTitle }}>{formatBRL(valorMostrado)}</span>
                  {divergente ? <span style={{ fontSize: 11.5, color: c.ink3 }}>cobrado {formatBRL(cobrado)}</span> : null}
                  {t.cobertoPorPlano ? (
                    <span style={{ fontSize: 12, color: c.greenText, fontWeight: 600, marginLeft: "auto" }}>Coberto pelo plano</span>
                  ) : st === "pago" ? (
                    <span style={{ fontSize: 12, color: c.ink3, marginLeft: "auto" }}>{formaPagamentoLabel[t.forma]}</span>
                  ) : null}
                </div>
                {st !== "pago" ? (
                  <Button variant="ghost" onClick={() => setPagar(t)} style={{ alignSelf: "flex-start" }}>Registrar pagamento</Button>
                ) : null}
              </div>
            );
          }

          // Linha (desktop)
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", padding: "13px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
              <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600 }}>{t.clienteNome}</span>
              <span style={{ fontSize: 13, color: c.ink2 }}>{t.servico}</span>
              <span style={{ fontSize: 12.5, color: st === "atrasado" ? c.redText : c.ink2, fontWeight: 600 }}>{dataExibida(t)}</span>
              <span>
                <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 700 }}>{formatBRL(valorMostrado)}</span>
                {divergente ? <div style={{ fontSize: 11, color: c.ink3 }}>cobrado {formatBRL(cobrado)}</div> : null}
              </span>
              <span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
              </span>
              <span style={{ fontSize: 12.5, color: t.cobertoPorPlano ? c.greenText : c.ink2, fontWeight: t.cobertoPorPlano ? 600 : undefined }}>
                {t.cobertoPorPlano ? "Coberto pelo plano" : st === "pago" ? formaPagamentoLabel[t.forma] : "—"}
              </span>
              <span style={{ display: "flex", justifyContent: "flex-end" }}>
                {st !== "pago" ? (
                  <button onClick={() => setPagar(t)} style={{ border: `1px solid ${c.borderInput}`, background: c.surface, cursor: "pointer", color: c.green, fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: "6px 11px", whiteSpace: "nowrap" }}>
                    Registrar pagamento
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: c.ink4, fontWeight: 600 }}>✓ pago</span>
                )}
              </span>
            </div>
          );
        })}

        {transacoes.length === 0 ? (
          <div style={{ padding: "36px", textAlign: "center", color: c.ink3, fontSize: 13 }}>
            {busca.trim() ? "Nenhuma cobrança para esta busca." : "Nenhuma cobrança neste filtro."}
          </div>
        ) : null}
      </Card>

      <NovaCobrancaModal open={novaOpen} onClose={() => setNovaOpen(false)} />
      <RegistrarPagamentoModal open={!!pagar} onClose={() => setPagar(null)} transacao={pagar} confirmedBy={profile?.nome} />
    </div>
  );
}
