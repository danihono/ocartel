"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import { HOJE_ISO } from "@/lib/date";

export function BloquearHorarioModal({
  open,
  onClose,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  defaults?: { dateISO?: string; barbeiroId?: string; inicio?: string };
}) {
  const { state, actions } = useStore();
  const toast = useToast();

  const [barbeiroId, setBarbeiroId] = useState("");
  const [date, setDate] = useState(HOJE_ISO);
  const [inicio, setInicio] = useState("12:00");
  const [duracaoMin, setDuracaoMin] = useState(60);
  const [motivo, setMotivo] = useState("Almoço");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBarbeiroId(defaults?.barbeiroId ?? state.barbeiros[0]?.id ?? "");
    setDate(defaults?.dateISO ?? HOJE_ISO);
    setInicio(defaults?.inicio ?? "12:00");
    setDuracaoMin(60);
    setMotivo("Almoço");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function salvar() {
    // Aviso de sobreposição (não bloqueia — admin pode sobrepor de propósito).
    const ocupados = state.agendamentos
      .filter((a) => a.barbeiroId === barbeiroId && a.date === date && ocupaHorario(a.status))
      .map((a) => ({ inicio: a.inicio, duracaoMin: a.duracaoMin }));
    const haConflito = !horarioLivre(ocupados, inicio, duracaoMin);

    setSalvando(true);
    try {
      await actions.agendamentos.add({
        id: makeId("bl"),
        date,
        barbeiroId,
        clienteNome: motivo.trim() || "Bloqueado",
        servico: "Bloqueado",
        inicio,
        duracaoMin,
        status: "bloqueio",
        origem: "admin",
      });
      toast(haConflito ? "Horário bloqueado — atenção: havia algo nesse horário." : "Horário bloqueado.", haConflito ? "error" : undefined);
      onClose();
    } catch {
      toast("Não foi possível bloquear o horário.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bloquear horário"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Bloquear</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
          <Field label="Início" style={{ flex: 1 }}>
            <TextInput type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Duração" style={{ flex: 1 }}>
            <Select value={String(duracaoMin)} onChange={(e) => setDuracaoMin(Number(e.target.value))}>
              <option value="30">30 min</option>
              <option value="60">1 hora</option>
              <option value="90">1h30</option>
              <option value="120">2 horas</option>
            </Select>
          </Field>
          <Field label="Motivo" style={{ flex: 1 }}>
            <TextInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Almoço, folga…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
