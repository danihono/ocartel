"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { mesAnoCurto, HOJE_ISO } from "@/lib/date";
import type { Cliente, ClienteTag } from "@/lib/types";

const PLANOS = ["Avulso", "Mensal Corte", "Mensal C+B"];
const TAGS: { value: ClienteTag; label: string }[] = [
  { value: "", label: "Nenhuma" },
  { value: "VIP", label: "VIP" },
  { value: "Novo", label: "Novo" },
  { value: "Inadimplente", label: "Inadimplente" },
];

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function ClienteModal({
  open,
  onClose,
  cliente,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  cliente?: Cliente;
  onSaved?: (id: string) => void;
}) {
  const { actions } = useStore();
  const toast = useToast();
  const editando = !!cliente;

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState(PLANOS[0]);
  const [tag, setTag] = useState<ClienteTag>("");

  useEffect(() => {
    if (!open) return;
    setNome(cliente?.nome ?? "");
    setTelefone(cliente?.telefone ?? "");
    setEmail(cliente?.email ?? "");
    setPlano(cliente?.plano ?? PLANOS[0]);
    setTag(cliente?.tag ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function salvar() {
    if (!nome.trim()) {
      toast("Informe o nome do cliente.", "error");
      return;
    }
    try {
      if (editando && cliente) {
        const atualizado: Cliente = { ...cliente, nome: nome.trim(), telefone, email, plano, tag, iniciais: iniciaisDe(nome) };
        await actions.clientes.update(atualizado);
        toast("Cliente atualizado.");
        onSaved?.(cliente.id);
      } else {
        const novo: Cliente = {
          id: makeId("c"),
          nome: nome.trim(),
          telefone,
          email,
          plano,
          tag,
          ultimoAtendimento: "—",
          totalGasto: "R$ 0",
          atendimentos: 0,
          desde: mesAnoCurto(HOJE_ISO),
          iniciais: iniciaisDe(nome),
        };
        const ref = await actions.clientes.add(novo);
        toast("Cliente adicionado.");
        onSaved?.(ref.id);
      }
      onClose();
    } catch {
      toast("Não foi possível salvar o cliente.", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? "Editar cliente" : "Novo cliente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>{editando ? "Salvar" : "Adicionar"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome">
          <TextInput value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Telefone" style={{ flex: 1 }}>
            <TextInput value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
          </Field>
          <Field label="E-mail" style={{ flex: 1 }}>
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Plano" style={{ flex: 1 }}>
            <Select value={plano} onChange={(e) => setPlano(e.target.value)}>
              {PLANOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Marcador" style={{ flex: 1 }}>
            <Select value={tag} onChange={(e) => setTag(e.target.value as ClienteTag)}>
              {TAGS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
