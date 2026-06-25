"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { FinalizarAtendimentoModal } from "./FinalizarAtendimentoModal";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { barbeiroNomePorId, fmtDur, formatBRL, precoServico, tagDerivadaCliente } from "@/lib/selectors";
import { HOJE_ISO, isoParaLabelLongo } from "@/lib/date";
import { c, font } from "@/lib/theme";
import { blocoMeta, tagMeta } from "@/lib/status";
import type { AgendamentoStatus } from "@/lib/types";

const STATUS_LABEL: Record<AgendamentoStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  atendimento: "Em atendimento",
  concluido: "Concluído",
  noshow: "No-show",
  cancelado: "Cancelado",
  bloqueio: "Bloqueio",
};

/** Painel lateral de detalhe do agendamento (substitui o modal central na Agenda). */
export function AgendamentoPanel({ open, onClose, agendamentoId }: { open: boolean; onClose: () => void; agendamentoId: string | null }) {
  const { state, actions } = useStore();
  const toast = useToast();

  const ag = state.agendamentos.find((a) => a.id === agendamentoId) ?? null;

  // Observações: rascunho local, semeado a cada abertura.
  const [obs, setObs] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [excluindoSerie, setExcluindoSerie] = useState(false); // passo de confirmação
  const [removendo, setRemovendo] = useState(false);
  useEffect(() => {
    setExcluindoSerie(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamentoId]);
  useEffect(() => {
    if (open && ag) setObs(ag.observacoes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agendamentoId]);

  if (!open || !ag) return null;

  const isBloqueio = ag.status === "bloqueio";
  const meta = blocoMeta[ag.status];
  // Cliente do cadastro (telefone + selo), por id quando houver, senão pelo nome.
  const cliente = state.clientes.find((cl) => (ag.clienteId && cl.id === ag.clienteId) || cl.nome === ag.clienteNome) ?? null;
  const seloTag = cliente ? tagDerivadaCliente(state, cliente, HOJE_ISO) : "";
  const selo = tagMeta(seloTag);
  const preco = precoServico(state, ag.servico);
  const obsAlterada = obs.trim() !== (ag.observacoes ?? "").trim();
  // Estado ATIVO = ainda pode mudar (concluir/no-show/cancelar). Os demais são terminais.
  const ehAtivo = ag.status === "agendado" || ag.status === "confirmado" || ag.status === "atendimento";

  // A conclusão (com a regra de plano) é feita no FinalizarAtendimentoModal.
  async function setStatus(status: AgendamentoStatus, msg: string) {
    if (!ag) return;
    try {
      await actions.agendamentos.setStatus(ag.id, status);
      toast(msg);
      onClose();
    } catch {
      toast("Não foi possível atualizar o agendamento.", "error");
    }
  }

  async function salvarObs() {
    if (!ag || !obsAlterada) return;
    setSalvandoObs(true);
    try {
      await actions.agendamentos.update(ag.id, { observacoes: obs.trim() });
      toast("Observações salvas.");
    } catch {
      toast("Não foi possível salvar as observações.", "error");
    } finally {
      setSalvandoObs(false);
    }
  }

  async function excluir(msg: string) {
    if (!ag) return;
    try {
      await actions.agendamentos.remove(ag.id);
      toast(msg);
      onClose();
    } catch {
      toast("Não foi possível remover.", "error");
    }
  }

  async function excluirSerie() {
    if (!ag?.recorrenciaId) return;
    setRemovendo(true);
    try {
      const r = await actions.agendamentos.removeSerie(ag.recorrenciaId);
      toast(r.mantidos ? `Série excluída (${r.excluidos}); ${r.mantidos} concluído(s) mantido(s).` : `Série excluída (${r.excluidos}).`);
      onClose();
    } catch {
      toast("Não foi possível excluir a série.", "error");
    } finally {
      setRemovendo(false);
      setExcluindoSerie(false);
    }
  }

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, width: 104, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600 }}>{valor}</span>
    </div>
  );

  return (
    <>
    <div
      onClick={onClose}
      className="oc-fade"
      style={{ position: "fixed", inset: 0, background: "rgba(8,19,15,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="oc-slide-right"
        style={{
          width: "100%",
          maxWidth: 420,
          height: "100%",
          background: c.surface,
          borderLeft: `1px solid ${c.border}`,
          boxShadow: "-12px 0 36px rgba(8,19,15,.16)",
          padding: "22px 24px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle, flex: 1 }}>
            {isBloqueio ? "Bloqueio" : "Agendamento"}
          </span>
          <button onClick={onClose} aria-label="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: c.ink3, fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.bar }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: c.inkTitle }}>{STATUS_LABEL[ag.status]}</span>
        </div>

        {/* Cliente */}
        {!isBloqueio ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: c.inkTitle }}>{ag.clienteNome}</span>
            {selo ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: selo.bg, color: selo.fg }}>{seloTag}</span>
            ) : null}
          </div>
        ) : null}
        {!isBloqueio && cliente?.telefone ? (
          <a href={`tel:${cliente.telefone}`} style={{ fontSize: 13, color: c.brassDeep, fontWeight: 600, textDecoration: "none" }}>
            {cliente.telefone}
          </a>
        ) : null}

        {/* Detalhes */}
        <div style={{ marginTop: 14 }}>
          {isBloqueio ? linha("Motivo", ag.clienteNome || "Bloqueado") : linha("Serviço", `${ag.servico}${preco ? ` · ${formatBRL(preco)}` : ""}`)}
          {linha("Profissional", barbeiroNomePorId(state, ag.barbeiroId))}
          {linha("Data", isoParaLabelLongo(ag.date))}
          {linha("Horário", `${ag.inicio} · ${fmtDur(ag.duracaoMin)}`)}
        </div>

        {/* Observações */}
        {!isBloqueio ? (
          <div style={{ marginTop: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.inkLabel, display: "block", marginBottom: 6 }}>Observações</span>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Preferência de corte, alergia, lembrete…" />
            {obsAlterada ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Button variant="ghost" onClick={salvarObs} disabled={salvandoObs}>
                  {salvandoObs ? "Salvando…" : "Salvar observações"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        {/* Ações */}
        {isBloqueio ? (
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <div style={{ flex: 1 }} />
            <Button onClick={() => excluir("Bloqueio removido.")} style={{ background: c.red }}>Excluir bloqueio</Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
            {/* Transições válidas: a partir de um estado ATIVO (agendado/confirmado/atendimento).
                concluído/no-show/cancelado são terminais — sem ações. */}
            {ag.status === "agendado" ? (
              <Button variant="ghost" onClick={() => setStatus("confirmado", "Agendamento confirmado.")}>Confirmar</Button>
            ) : null}
            {ag.status === "agendado" || ag.status === "confirmado" ? (
              <Button variant="ghost" onClick={() => setStatus("atendimento", "Atendimento iniciado.")}>Iniciar</Button>
            ) : null}
            {ehAtivo ? <Button onClick={() => setFinalizando(true)}>Concluir</Button> : null}
            {ehAtivo ? (
              <Button variant="ghost" onClick={() => setStatus("noshow", "Marcado como no-show.")}>No-show</Button>
            ) : null}
            {ehAtivo ? (
              <Button variant="ghost" onClick={() => setStatus("cancelado", "Agendamento cancelado.")} style={{ color: c.red }}>Cancelar</Button>
            ) : null}
            {!ehAtivo ? (
              <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>Agendamento {STATUS_LABEL[ag.status].toLowerCase()} — sem ações disponíveis.</span>
            ) : null}
          </div>
        )}

        {/* Série recorrente: excluir todos de uma vez (mantém os concluídos). */}
        {!isBloqueio && ag.recorrenciaId ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.borderSoft}` }}>
            {excluindoSerie ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: c.ink2, fontWeight: 600, flex: 1, minWidth: 150 }}>
                  Excluir toda a série? (concluídos são mantidos)
                </span>
                <Button variant="ghost" onClick={() => setExcluindoSerie(false)} disabled={removendo}>Cancelar</Button>
                <Button onClick={excluirSerie} loading={removendo} style={{ background: c.red }}>Confirmar exclusão</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setExcluindoSerie(true)}
                style={{ border: "none", background: "transparent", color: c.red, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                Excluir série toda
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
    <FinalizarAtendimentoModal
      open={finalizando}
      agendamentoId={ag.id}
      onClose={() => setFinalizando(false)}
      onConcluido={() => {
        setFinalizando(false);
        onClose();
      }}
    />
    </>
  );
}
