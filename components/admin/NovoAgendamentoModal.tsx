"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { duracaoServico } from "@/lib/selectors";
import { HOJE_ISO } from "@/lib/date";

export interface NovoAgendamentoDefaults {
  dateISO?: string;
  barbeiroId?: string;
  inicio?: string;
  clienteNome?: string;
  servico?: string;
}

export function NovoAgendamentoModal({
  open,
  onClose,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  defaults?: NovoAgendamentoDefaults;
}) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [cliente, setCliente] = useState("");
  const [servico, setServico] = useState("");
  const [barbeiroId, setBarbeiroId] = useState("");
  const [date, setDate] = useState(HOJE_ISO);
  const [inicio, setInicio] = useState("09:00");

  useEffect(() => {
    if (!open) return;
    setCliente(defaults?.clienteNome ?? "");
    setServico(defaults?.servico ?? state.servicos[0]?.nome ?? "");
    setBarbeiroId(defaults?.barbeiroId ?? state.barbeiros[0]?.id ?? "");
    setDate(defaults?.dateISO ?? HOJE_ISO);
    setInicio(defaults?.inicio ?? "09:00");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function salvar() {
    if (!cliente.trim()) {
      toast("Informe o nome do cliente.", "error");
      return;
    }
    const svc = state.servicos.find((s) => s.nome === servico);
    try {
      await actions.agendamentos.add({
        id: makeId("ag"),
        date,
        barbeiroId,
        clienteNome: cliente.trim(),
        servico,
        servicoId: svc?.id,
        inicio,
        duracaoMin: duracaoServico(state, servico),
        status: "agendado",
        origem: "admin",
      });
      toast("Agendamento criado.");
      onClose();
    } catch {
      toast("Não foi possível criar o agendamento.", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo agendamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Agendar</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Cliente">
          <TextInput value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" list="oc-clientes" />
          <datalist id="oc-clientes">
            {state.clientes.map((c) => (
              <option key={c.id} value={c.nome} />
            ))}
          </datalist>
        </Field>
        <Field label="Serviço">
          <Select value={servico} onChange={(e) => setServico(e.target.value)}>
            {state.servicos.map((s) => (
              <option key={s.id} value={s.nome}>
                {s.nome} · R$ {s.preco} · {s.duracaoMin}min
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Profissional">
          <Select value={barbeiroId} onChange={(e) => setBarbeiroId(e.target.value)}>
            {state.barbeiros.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </Select>
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Data" style={{ flex: 1 }}>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Horário" style={{ flex: 1 }}>
            <TextInput type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
