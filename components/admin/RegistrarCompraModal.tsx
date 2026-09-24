"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import { hojeLocalISO } from "@/lib/date";
import { c } from "@/lib/theme";
import type { SolicitacaoProduto } from "@/lib/types";

/** Dá baixa numa solicitação: o produto já foi comprado. */
export function RegistrarCompraModal({
  solicitacao,
  onClose,
}: {
  solicitacao: SolicitacaoProduto | null;
  onClose: () => void;
}) {
  const { state, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();

  const [dataISO, setDataISO] = useState(hojeLocalISO());
  const [custo, setCusto] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!solicitacao) return;
    setDataISO(hojeLocalISO());
    setCusto(solicitacao.custo ?? 0);
  }, [solicitacao]);

  if (!solicitacao) return null;

  async function salvar() {
    if (!solicitacao) return;
    setSalvando(true);
    try {
      await actions.solicitacoes.update(solicitacao.id, {
        status: "comprado",
        compradoEm: dataISO,
        compradoPor: profile?.nome ?? state.auth.nome,
        // Custo 0 = não informado; não grava um zero falso no lugar de "não sei".
        ...(custo > 0 ? { custo } : {}),
      });
      toast(`Compra de “${solicitacao.produto}” registrada.`);
      onClose();
    } catch {
      toast("Não foi possível registrar a compra.", "error");
    } finally {
      setSalvando(false);
    }
  }

  const unidade = solicitacao.unidade ? ` ${solicitacao.unidade}` : "";

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar compra"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Confirmar compra
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle }}>
            {solicitacao.produto} · {solicitacao.quantidade}
            {unidade}
          </div>
          <div style={{ fontSize: 12, color: c.ink3, marginTop: 3 }}>
            Pedido por {solicitacao.solicitadoPor || "—"}
          </div>
          {solicitacao.observacoes ? (
            <div style={{ fontSize: 12, color: c.ink2, marginTop: 5 }}>{solicitacao.observacoes}</div>
          ) : null}
        </div>

        <Field label="Data da compra">
          <TextInput type="date" value={dataISO} onChange={(e) => setDataISO(e.target.value)} />
        </Field>

        <Field label="Quanto custou (opcional)">
          <MoneyInput value={custo} onChange={setCusto} />
        </Field>
      </div>
    </Modal>
  );
}
