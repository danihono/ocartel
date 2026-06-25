"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import {
  barbeiroNomePorId,
  clientePossuiPlanoAtivo,
  formaPagamentoLabel,
  formatBRL,
  precoServico,
} from "@/lib/selectors";
import { isoParaDiaMes } from "@/lib/date";
import { c } from "@/lib/theme";
import type { FormaPagamento, Transacao } from "@/lib/types";

// Mesma ordem do RegistrarPagamentoModal: Pix, Dinheiro, Cartão, Débito.
const FORMAS: FormaPagamento[] = ["pix", "dinheiro", "cartao", "cartao_debito"];

/**
 * Conclui um atendimento aplicando a regra de plano:
 * - Cliente com plano ativo → R$ 0,00, "Coberto pelo plano" (não cobra o corte).
 * - Cliente avulso → cobra o serviço; o admin escolhe a forma e marca como pago.
 * É o ÚNICO ponto que monta a transação de conclusão (reutilizado pela Agenda e
 * pelo Dashboard), evitando lógica duplicada.
 */
export function FinalizarAtendimentoModal({
  open,
  onClose,
  onConcluido,
  agendamentoId,
}: {
  open: boolean;
  onClose: () => void;
  onConcluido?: () => void;
  agendamentoId: string | null;
}) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [salvando, setSalvando] = useState(false);

  const ag = state.agendamentos.find((a) => a.id === agendamentoId) ?? null;
  const cliente = ag
    ? state.clientes.find((cl) => (ag.clienteId && cl.id === ag.clienteId) || cl.nome === ag.clienteNome) ?? null
    : null;
  const coberto = clientePossuiPlanoAtivo(cliente);
  const preco = ag ? precoServico(state, ag.servico) : 0;
  const valor = coberto ? 0 : preco;

  useEffect(() => {
    if (open) setForma("pix");
  }, [open]);

  if (!open || !ag) return null;

  async function confirmar() {
    if (!ag) return;
    setSalvando(true);
    const clienteId = ag.clienteId ?? cliente?.id;
    const transacao: Transacao = {
      id: makeId("tx"),
      data: isoParaDiaMes(ag.date),
      clienteNome: ag.clienteNome,
      clienteId,
      servico: ag.servico,
      barbeiroNome: barbeiroNomePorId(state, ag.barbeiroId),
      valor,
      status: "pago",
      forma: coberto ? "pix" : forma, // no coberto a forma não é exibida nem conta como preferida
      type: "avulso",
      source: "manual",
      paidAt: ag.date,
      amount: valor,
      amountReceived: valor,
      ...(coberto ? { cobertoPorPlano: true } : {}),
    };
    try {
      await actions.agendamentos.concluir(
        ag.id,
        transacao,
        clienteId ? { id: clienteId, valor, dataISO: ag.date } : undefined,
      );
      toast(coberto ? "Atendimento concluído — coberto pelo plano." : "Atendimento concluído.");
      (onConcluido ?? onClose)();
    } catch {
      toast("Não foi possível concluir o atendimento.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Finalizar atendimento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando}>{salvando ? "Concluindo…" : "Concluir"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>{ag.clienteNome}</div>
          <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>{ag.servico}</div>
        </div>

        {coberto ? (
          <div style={{ background: c.greenBg, borderRadius: 11, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.greenText }}>Atendimento coberto pelo plano</div>
            <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 4 }}>
              Cliente assinante{cliente?.plano ? ` (${cliente.plano})` : ""}. Valor cobrado:{" "}
              <b style={{ color: c.inkTitle }}>{formatBRL(0)}</b>.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: c.ink2 }}>
              Valor do serviço: <b style={{ color: c.inkTitle }}>{formatBRL(preco)}</b>
            </div>
            <Field label="Forma de pagamento">
              <Select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
                {FORMAS.map((f) => (
                  <option key={f} value={f}>{formaPagamentoLabel[f]}</option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
