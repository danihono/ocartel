"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { formaPagamentoLabel, formatBRL, valorCobrado } from "@/lib/selectors";
import { HOJE_ISO, hojeLocalISO } from "@/lib/date";
import { c } from "@/lib/theme";
import type { FormaPagamento, Transacao } from "@/lib/types";

// Ordem do prompt: Pix, Dinheiro, Cartão de crédito, Cartão de débito.
const FORMAS: FormaPagamento[] = ["pix", "dinheiro", "cartao", "cartao_debito"];

/** Confirma manualmente o pagamento de uma cobrança (Pix/dinheiro/cartão na mão da dona). */
export function RegistrarPagamentoModal({
  open,
  onClose,
  transacao,
  confirmedBy,
}: {
  open: boolean;
  onClose: () => void;
  transacao: Transacao | null;
  confirmedBy?: string;
}) {
  const { actions } = useStore();
  const toast = useToast();

  const cobrado = transacao ? valorCobrado(transacao) : 0;
  const [valor, setValor] = useState(0);
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [dataISO, setDataISO] = useState(HOJE_ISO);

  useEffect(() => {
    if (!open || !transacao) return;
    setValor(valorCobrado(transacao));
    setForma(transacao.forma ?? "pix");
    setDataISO(hojeLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!transacao) return null;
  const divergente = valor !== cobrado;

  async function salvar() {
    if (!transacao) return;
    if (valor <= 0) {
      toast("Informe o valor recebido.", "error");
      return;
    }
    try {
      await actions.transacoes.registrarPagamento(transacao.id, {
        paidAt: dataISO,
        forma,
        amountReceived: valor,
        confirmedBy,
      });
      toast("Pagamento confirmado.");
      onClose();
    } catch {
      toast("Não foi possível confirmar o pagamento.", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar pagamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Confirmar</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>{transacao.clienteNome}</div>
          <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2 }}>{transacao.servico}</div>
          <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 4 }}>
            Valor cobrado: <b style={{ color: c.inkTitle }}>{formatBRL(cobrado)}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Valor recebido" style={{ flex: 1 }}>
            <MoneyInput value={valor} onChange={setValor} />
          </Field>
          <Field label="Data do recebimento" style={{ flex: 1 }}>
            <TextInput type="date" value={dataISO} onChange={(e) => setDataISO(e.target.value)} />
          </Field>
        </div>
        <Field label="Forma de pagamento">
          <Select value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
            {FORMAS.map((f) => (
              <option key={f} value={f}>{formaPagamentoLabel[f]}</option>
            ))}
          </Select>
        </Field>
        {divergente ? (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: c.amberText, background: c.amberBg, borderRadius: 9, padding: "9px 12px" }}>
            Recebido difere do cobrado: {formatBRL(cobrado)} → {formatBRL(valor)}. A diferença ({formatBRL(Math.abs(cobrado - valor))}) ficará registrada.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
