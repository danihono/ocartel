"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { HOJE_ISO, hojeLocalISO, isoParaDiaMes } from "@/lib/date";
import type { TipoCobranca } from "@/lib/types";

/** Lança uma cobrança PENDENTE manualmente (retroativa, ajuste, mensalidade fora do lote). */
export function NovaCobrancaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState<TipoCobranca>("mensalidade");
  const [item, setItem] = useState("");
  const [valor, setValor] = useState(0);
  const [vencISO, setVencISO] = useState(HOJE_ISO);

  useEffect(() => {
    if (!open) return;
    setCliente("");
    setTipo("mensalidade");
    setItem("");
    setValor(0);
    setVencISO(hojeLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pré-preenche o item com o plano do cliente quando é mensalidade.
  function onClienteChange(nome: string) {
    setCliente(nome);
    const cl = state.clientes.find((c) => c.nome === nome.trim());
    if (cl && tipo === "mensalidade" && !item.trim()) setItem(cl.plano);
  }

  async function salvar() {
    const nomeLimpo = cliente.trim();
    if (!nomeLimpo) {
      toast("Informe o cliente.", "error");
      return;
    }
    if (!item.trim()) {
      toast(tipo === "mensalidade" ? "Informe o plano." : "Informe o serviço.", "error");
      return;
    }
    if (valor <= 0) {
      toast("Informe o valor.", "error");
      return;
    }
    const clienteId = state.clientes.find((cl) => cl.nome === nomeLimpo)?.id;
    try {
      await actions.transacoes.add({
        id: makeId("tx"),
        data: isoParaDiaMes(vencISO),
        clienteNome: nomeLimpo,
        clienteId,
        servico: item.trim(),
        barbeiroNome: "",
        valor,
        status: "pendente",
        forma: "pix", // placeholder até o pagamento ser registrado
        type: tipo,
        dueDate: vencISO,
        amount: valor,
        source: "manual",
      });
      toast("Cobrança criada.");
      onClose();
    } catch {
      toast("Não foi possível criar a cobrança.", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova cobrança"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Criar cobrança</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Cliente">
          <TextInput value={cliente} onChange={(e) => onClienteChange(e.target.value)} placeholder="Nome do cliente" list="oc-clientes-cobranca" />
          <datalist id="oc-clientes-cobranca">
            {state.clientes.map((c) => (
              <option key={c.id} value={c.nome} />
            ))}
          </datalist>
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Tipo" style={{ flex: 1 }}>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCobranca)}>
              <option value="mensalidade">Mensalidade</option>
              <option value="avulso">Avulso</option>
            </Select>
          </Field>
          <Field label="Vencimento" style={{ flex: 1 }}>
            <TextInput type="date" value={vencISO} onChange={(e) => setVencISO(e.target.value)} />
          </Field>
        </div>
        <Field label={tipo === "mensalidade" ? "Plano" : "Serviço"}>
          <TextInput value={item} onChange={(e) => setItem(e.target.value)} placeholder={tipo === "mensalidade" ? "Ex.: Mensal C+B" : "Ex.: Corte"} />
        </Field>
        <Field label="Valor">
          <MoneyInput value={valor} onChange={setValor} />
        </Field>
      </div>
    </Modal>
  );
}
