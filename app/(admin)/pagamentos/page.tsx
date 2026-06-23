"use client";

import { useEffect, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { formatBRL, selectResumoFinanceiro, selectTransacoes, type FiltroTransacao } from "@/lib/selectors";
import { HOJE_ISO, isoParaDiaMes } from "@/lib/date";
import type { FormaPagamento, TransacaoStatus } from "@/lib/types";

const FILTROS: FiltroTransacao[] = ["Todas", "Pagas", "Pendentes", "Atrasadas"];
const formaLabel: Record<FormaPagamento, string> = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
const statusMeta: Record<TransacaoStatus, { label: string; fg: string; bg: string }> = {
  pago: { label: "Pago", fg: c.greenText, bg: c.greenBg },
  pendente: { label: "Pendente", fg: c.amberText, bg: c.amberBg },
  atrasado: { label: "Atrasado", fg: c.redText, bg: c.redBg },
};
const COLS = "0.7fr 1.5fr 1.2fr 1fr 0.8fr 0.9fr 1.1fr";

export default function PagamentosPage() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroTransacao>("Todas");
  const [busca, setBusca] = useState("");
  const [lancar, setLancar] = useState(false);

  const resumo = selectResumoFinanceiro(state);
  const comissoes = Math.round(resumo.recebido * 0.3);
  const transacoes = selectTransacoes(state, filtro, busca);

  const kpis = [
    { l: "Recebido", v: formatBRL(resumo.recebido), dot: c.green },
    { l: "Pendente", v: formatBRL(resumo.pendente), dot: c.brass },
    { l: "Inadimplência", v: formatBRL(resumo.atrasado), dot: c.red },
    { l: "Comissões (30%)", v: formatBRL(comissoes), dot: c.leather },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1180 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {kpis.map((k) => (
          <Card key={k.l} pad="16px 18px">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: k.dot }} />
              <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>{k.l}</span>
            </div>
            <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: "#221A13", marginTop: 7 }}>{k.v}</div>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card pad="0">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#241B12" }}>Transações</span>
          <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>{transacoes.length}</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "8px 12px", width: 220 }}>
            <span style={{ width: 13, height: 13, border: "1.6px solid #B6A78F", borderRadius: "50%", flex: "none" }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#241B12", fontFamily: font.sans }} />
          </div>
          <Button onClick={() => setLancar(true)}>+ Lançar pagamento</Button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "12px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
          {FILTROS.map((f) => {
            const on = f === filtro;
            return (
              <button key={f} onClick={() => setFiltro(f)} style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 600, color: on ? "#3E2C20" : c.ink3, background: on ? c.brassSoft : c.surfaceWarm, borderRadius: 999, padding: "5px 12px" }}>
                {f}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: COLS, padding: "12px 20px", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: c.ink3, fontWeight: 600, borderBottom: `1px solid ${c.borderSoft}` }}>
          <span>Data</span>
          <span>Cliente</span>
          <span>Serviço</span>
          <span>Barbeiro</span>
          <span>Valor</span>
          <span>Status</span>
          <span>Forma</span>
        </div>

        {transacoes.map((t) => {
          const sm = statusMeta[t.status];
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", padding: "13px 20px", borderBottom: `1px solid ${c.borderSoft}` }}>
              <span style={{ fontSize: 12.5, color: c.ink2, fontWeight: 600 }}>{t.data}</span>
              <span style={{ fontSize: 13.5, color: "#241B12", fontWeight: 600 }}>{t.clienteNome}</span>
              <span style={{ fontSize: 13, color: c.ink2 }}>{t.servico}</span>
              <span style={{ fontSize: 13, color: c.ink2 }}>{t.barbeiroNome}</span>
              <span style={{ fontSize: 13.5, color: "#3E2C20", fontWeight: 700 }}>{formatBRL(t.valor)}</span>
              <span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: c.ink2 }}>{formaLabel[t.forma]}</span>
                {t.status !== "pago" ? (
                  <button onClick={() => { dispatch({ type: "MARK_TRANSACAO_PAGA", id: t.id }); toast("Pagamento confirmado."); }} style={{ marginLeft: "auto", border: `1px solid ${c.borderInput}`, background: c.surface, cursor: "pointer", color: c.green, fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: "5px 10px", whiteSpace: "nowrap" }}>
                    Marcar pago
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
        {transacoes.length === 0 ? <div style={{ padding: "32px", textAlign: "center", color: c.ink3, fontSize: 13 }}>Nenhuma transação neste filtro.</div> : null}
      </Card>

      <LancarModal open={lancar} onClose={() => setLancar(false)} />
    </div>
  );
}

function LancarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [barbeiro, setBarbeiro] = useState("");
  const [valor, setValor] = useState(0);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [status, setStatus] = useState<TransacaoStatus>("pago");

  useEffect(() => {
    if (!open) return;
    setCliente("");
    setServico(state.servicos[0]?.nome ?? "");
    setBarbeiro(state.barbeiros[0]?.nome ?? "");
    setValor(state.servicos[0]?.preco ?? 0);
    setForma("pix");
    setStatus("pago");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function salvar() {
    if (!cliente.trim()) {
      toast("Informe o cliente.", "error");
      return;
    }
    dispatch({
      type: "ADD_TRANSACAO",
      transacao: { id: makeId("tx"), data: isoParaDiaMes(HOJE_ISO), clienteNome: cliente.trim(), servico, barbeiroNome: barbeiro, valor, status, forma },
    });
    toast("Pagamento lançado.");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lançar pagamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Lançar</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Cliente">
          <TextInput value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Serviço" style={{ flex: 1 }}>
            <Select value={servico} onChange={(e) => { setServico(e.target.value); setValor(state.servicos.find((s) => s.nome === e.target.value)?.preco ?? 0); }}>
              {state.servicos.map((s) => (
                <option key={s.id} value={s.nome}>{s.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Barbeiro" style={{ flex: 1 }}>
            <Select value={barbeiro} onChange={(e) => setBarbeiro(e.target.value)}>
              {state.barbeiros.map((b) => (
                <option key={b.id} value={b.nome}>{b.nome}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Valor" style={{ flex: 1 }}>
            <MoneyInput value={valor} onChange={setValor} />
          </Field>
          <Field label="Forma" style={{ flex: 1 }}>
            <Select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
              <option value="pix">Pix</option>
              <option value="cartao">Cartão</option>
              <option value="dinheiro">Dinheiro</option>
            </Select>
          </Field>
          <Field label="Status" style={{ flex: 1 }}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as TransacaoStatus)}>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="atrasado">Atrasado</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
