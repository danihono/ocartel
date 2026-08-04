"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ClientePicker, type ClienteEscolhido } from "@/components/admin/ClientePicker";
import { DuracaoField } from "@/components/admin/DuracaoField";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { duracaoServico } from "@/lib/selectors";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import { HOJE_ISO, hojeLocalISO } from "@/lib/date";

export interface NovoAgendamentoDefaults {
  dateISO?: string;
  barbeiroId?: string;
  inicio?: string;
  clienteNome?: string;
  clienteId?: string;
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

  const [cliente, setCliente] = useState<ClienteEscolhido>({ nome: "" });
  const [servico, setServico] = useState("");
  const [barbeiroId, setBarbeiroId] = useState("");
  const [date, setDate] = useState(HOJE_ISO);
  const [inicio, setInicio] = useState("09:00");
  // Duração: começa na do serviço e acompanha a troca de serviço ATÉ o usuário
  // ajustar à mão — daí em diante manda o que ele escolheu.
  const [duracao, setDuracao] = useState(30);
  const [duracaoTocada, setDuracaoTocada] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const duracaoPadrao = duracaoServico(state, servico);

  useEffect(() => {
    if (!open) return;
    const svcInicial = defaults?.servico ?? state.servicos[0]?.nome ?? "";
    setCliente({ nome: defaults?.clienteNome ?? "", id: defaults?.clienteId });
    setServico(svcInicial);
    setBarbeiroId(defaults?.barbeiroId ?? state.barbeiros[0]?.id ?? "");
    setDate(defaults?.dateISO ?? hojeLocalISO());
    setInicio(defaults?.inicio ?? "09:00");
    setDuracao(duracaoServico(state, svcInicial));
    setDuracaoTocada(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function trocarServico(nome: string) {
    setServico(nome);
    if (!duracaoTocada) setDuracao(duracaoServico(state, nome));
  }

  async function salvar() {
    const nomeLimpo = cliente.nome.trim();
    if (!nomeLimpo) {
      toast("Informe o nome do cliente.", "error");
      return;
    }
    const svc = state.servicos.find((s) => s.nome === servico);
    // Vincula ao cadastro: o escolhido no seletor, senão o default explícito.
    const clienteId = cliente.id ?? defaults?.clienteId;
    const duracaoMin = duracao;

    // Aviso de sobreposição (não bloqueia — mesmo comportamento do drag/resize na agenda).
    const ocupados = state.agendamentos
      .filter((a) => a.barbeiroId === barbeiroId && a.date === date && ocupaHorario(a.status))
      .map((a) => ({ inicio: a.inicio, duracaoMin: a.duracaoMin }));
    const haConflito = !horarioLivre(ocupados, inicio, duracaoMin);

    setSalvando(true);
    try {
      await actions.agendamentos.add({
        id: makeId("ag"),
        date,
        barbeiroId,
        clienteNome: nomeLimpo,
        clienteId,
        servico,
        servicoId: svc?.id,
        inicio,
        duracaoMin,
        status: "agendado",
        origem: "admin",
      });
      toast(haConflito ? "Agendamento criado — atenção: há sobreposição de horário." : "Agendamento criado.", haConflito ? "error" : undefined);
      onClose();
    } catch {
      toast("Não foi possível criar o agendamento.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo agendamento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Agendar</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Cliente">
          <ClientePicker valor={cliente} onChange={setCliente} />
        </Field>
        <Field label="Serviço">
          <Select value={servico} onChange={(e) => trocarServico(e.target.value)}>
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
        <DuracaoField
          valor={duracao}
          padrao={duracaoPadrao}
          onChange={(min) => {
            setDuracao(min);
            setDuracaoTocada(true);
          }}
        />
      </div>
    </Modal>
  );
}
