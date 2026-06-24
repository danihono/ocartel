"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { barbeiroNomePorId, fmtDur, precoServico } from "@/lib/selectors";
import { isoParaDiaMes, isoParaLabelLongo } from "@/lib/date";
import { c } from "@/lib/theme";
import { blocoMeta } from "@/lib/status";
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

export function AgendamentoModal({ open, onClose, agendamentoId }: { open: boolean; onClose: () => void; agendamentoId: string | null }) {
  const { state, actions } = useStore();
  const toast = useToast();

  const ag = state.agendamentos.find((a) => a.id === agendamentoId) ?? null;
  if (!open || !ag) return null;

  async function setStatus(status: AgendamentoStatus, msg: string) {
    if (!ag) return;
    try {
      if (status === "concluido") {
        // Vincula ao cliente (id preferido; nome como fallback p/ dados legados),
        // para alimentar histórico, agregados e segmentos.
        const clienteId = ag.clienteId ?? state.clientes.find((cl) => cl.nome === ag.clienteNome)?.id;
        const valor = precoServico(state, ag.servico);
        await actions.agendamentos.concluir(
          ag.id,
          {
            id: makeId("tx"),
            data: isoParaDiaMes(ag.date),
            clienteNome: ag.clienteNome,
            clienteId,
            servico: ag.servico,
            barbeiroNome: barbeiroNomePorId(state, ag.barbeiroId),
            valor,
            status: "pago",
            forma: "pix",
            type: "avulso",
            source: "manual",
            paidAt: ag.date,
            amount: valor,
            amountReceived: valor,
          },
          clienteId ? { id: clienteId, valor, dataISO: ag.date } : undefined,
        );
      } else {
        await actions.agendamentos.setStatus(ag.id, status);
      }
      toast(msg);
      onClose();
    } catch {
      toast("Não foi possível atualizar o agendamento.", "error");
    }
  }

  async function excluir() {
    if (!ag) return;
    try {
      await actions.agendamentos.remove(ag.id);
      toast("Bloqueio removido.");
      onClose();
    } catch {
      toast("Não foi possível remover o bloqueio.", "error");
    }
  }

  const isBloqueio = ag.status === "bloqueio";
  const meta = blocoMeta[ag.status];

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, width: 110, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600 }}>{valor}</span>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isBloqueio ? "Bloqueio" : "Agendamento"}
      footer={
        isBloqueio ? (
          <>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={excluir} style={{ background: c.red }}>Excluir bloqueio</Button>
          </>
        ) : undefined
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.bar }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: c.inkTitle }}>{STATUS_LABEL[ag.status]}</span>
      </div>

      {linha("Cliente", ag.clienteNome)}
      {linha("Serviço", ag.servico)}
      {linha("Profissional", barbeiroNomePorId(state, ag.barbeiroId))}
      {linha("Data", isoParaLabelLongo(ag.date))}
      {linha("Horário", `${ag.inicio} · ${fmtDur(ag.duracaoMin)}`)}

      {!isBloqueio ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {ag.status === "agendado" ? (
            <Button variant="ghost" onClick={() => setStatus("confirmado", "Agendamento confirmado.")}>Confirmar</Button>
          ) : null}
          {ag.status !== "atendimento" && ag.status !== "concluido" ? (
            <Button variant="ghost" onClick={() => setStatus("atendimento", "Atendimento iniciado.")}>Iniciar</Button>
          ) : null}
          {ag.status !== "concluido" ? (
            <Button onClick={() => setStatus("concluido", "Atendimento concluído.")}>Concluir</Button>
          ) : null}
          {ag.status !== "noshow" ? (
            <Button variant="ghost" onClick={() => setStatus("noshow", "Marcado como no-show.")}>No-show</Button>
          ) : null}
          {ag.status !== "cancelado" ? (
            <Button variant="ghost" onClick={() => setStatus("cancelado", "Agendamento cancelado.")} style={{ color: c.red }}>Cancelar</Button>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
