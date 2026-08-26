"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, MoneyInput, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ClientePicker, type ClienteEscolhido } from "@/components/admin/ClientePicker";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { diaVencimentoCliente, planoDoCliente } from "@/lib/selectors";
import { HOJE_ISO, hojeLocalISO, isoParaDiaMes } from "@/lib/date";
import type { Cliente, TipoCobranca } from "@/lib/types";

/** Lança uma cobrança PENDENTE manualmente (retroativa, ajuste, mensalidade fora do lote). */
export function NovaCobrancaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [cliente, setCliente] = useState<ClienteEscolhido>({ nome: "" });
  const [tipo, setTipo] = useState<TipoCobranca>("mensalidade");
  const [item, setItem] = useState("");
  const [valor, setValor] = useState(0);
  const [vencISO, setVencISO] = useState(HOJE_ISO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCliente({ nome: "" });
    setTipo("mensalidade");
    setItem("");
    setValor(0);
    setVencISO(hojeLocalISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Vencimento no dia do cliente, no mês corrente (ou no próximo, se já passou). */
  function vencimentoSugerido(cl: Cliente): string {
    const hoje = hojeLocalISO();
    const dia = String(diaVencimentoCliente(cl, planoDoCliente(state.planos, cl))).padStart(2, "0");
    const desteMes = `${hoje.slice(0, 7)}-${dia}`;
    if (desteMes >= hoje) return desteMes;
    const [y, m] = hoje.split("-").map(Number);
    const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return `${prox}-${dia}`;
  }

  // Pré-preenche plano e vencimento a partir do cadastro do cliente escolhido.
  function onClienteChange(escolhido: ClienteEscolhido) {
    setCliente(escolhido);
    const cl = escolhido.id
      ? state.clientes.find((c) => c.id === escolhido.id)
      : state.clientes.find((c) => c.nome === escolhido.nome.trim());
    if (!cl) return;
    if (tipo === "mensalidade") {
      if (!item.trim()) setItem(cl.plano);
      setVencISO(vencimentoSugerido(cl));
    }
  }

  async function salvar() {
    const nomeLimpo = cliente.nome.trim();
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
    const clienteId = cliente.id ?? state.clientes.find((cl) => cl.nome === nomeLimpo)?.id;
    setSalvando(true);
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
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova cobrança"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Criar cobrança</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Cliente">
          <ClientePicker valor={cliente} onChange={onClienteChange} />
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
