"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { mesAnoCurto, hojeLocalISO } from "@/lib/date";
import { EMAIL_RE, iniciaisDe, maskCpf, maskTelefone, normalizarCpf, normalizarTelefone, validarCpf } from "@/lib/clientes-import";
import type { Cliente, ClienteTag } from "@/lib/types";

// "Inadimplente" NÃO é um marcador manual: é derivado das cobranças em atraso
// (ver selectors.tagDerivadaCliente). Aqui só os marcadores escolhidos à mão.
const TAGS: { value: ClienteTag; label: string }[] = [
  { value: "", label: "Nenhuma" },
  { value: "VIP", label: "VIP" },
  { value: "Novo", label: "Novo" },
];

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
  const { state, actions } = useStore();
  const toast = useToast();
  const editando = !!cliente;

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState(""); // "" = Avulso (sem plano)
  const [tag, setTag] = useState<ClienteTag>("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(cliente?.nome ?? "");
    setTelefone(cliente?.telefone ?? "");
    setCpf(cliente?.cpf ? maskCpf(cliente.cpf) : "");
    setEmail(cliente?.email ?? "");
    // planId direto; senão tenta casar pelo rótulo `plano` legado; senão Avulso.
    const porNome = cliente?.plano ? state.planos.find((p) => p.nome === cliente.plano)?.id : undefined;
    setPlanId(cliente?.planId ?? porNome ?? "");
    setTag(cliente?.tag ?? "");
    setObservacoes(cliente?.observacoes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const planoSel = state.planos.find((p) => p.id === planId) ?? null;
  const planoLabel = planoSel ? planoSel.nome : "Avulso";

  async function salvar() {
    if (!nome.trim()) {
      toast("Informe o nome do cliente.", "error");
      return;
    }
    if (telefone.replace(/\D/g, "").length < 10) {
      toast("Informe um telefone válido (com DDD).", "error");
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      toast("E-mail inválido.", "error");
      return;
    }
    if (cpf.trim() && !validarCpf(cpf)) {
      toast("CPF inválido.", "error");
      return;
    }
    const cpfNorm = normalizarCpf(cpf);
    setSalvando(true);
    try {
      if (editando && cliente) {
        const atualizado: Cliente = { ...cliente, nome: nome.trim(), telefone, telefoneNorm: normalizarTelefone(telefone), cpf: cpfNorm, email: email.trim(), plano: planoLabel, planId, tag, observacoes: observacoes.trim(), iniciais: iniciaisDe(nome) };
        await actions.clientes.update(atualizado);
        toast("Cliente atualizado.");
        onSaved?.(cliente.id);
      } else {
        const novo: Cliente = {
          id: makeId("c"),
          nome: nome.trim(),
          telefone,
          telefoneNorm: normalizarTelefone(telefone),
          cpf: cpfNorm,
          email: email.trim(),
          plano: planoLabel,
          planId,
          tag,
          observacoes: observacoes.trim(),
          ultimoAtendimento: "—",
          totalGasto: 0,
          atendimentos: 0,
          desde: mesAnoCurto(hojeLocalISO()),
          iniciais: iniciaisDe(nome),
        };
        const ref = await actions.clientes.add(novo);
        toast("Cliente adicionado.");
        onSaved?.(ref.id);
      }
      onClose();
    } catch {
      toast("Não foi possível salvar o cliente.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? "Editar cliente" : "Novo cliente"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>{editando ? "Salvar" : "Adicionar"}</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nome">
          <TextInput value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Telefone" style={{ flex: 1 }}>
            <TextInput value={telefone} onChange={(e) => setTelefone(maskTelefone(e.target.value))} placeholder="(11) 90000-0000" inputMode="tel" />
          </Field>
          <Field label="CPF" style={{ flex: 1 }}>
            <TextInput value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
          </Field>
        </div>
        <Field label="E-mail">
          <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Plano" style={{ flex: 1 }}>
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Avulso (sem plano)</option>
              {state.planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · R$ {p.valor}/mês
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
        <Field label="Observações">
          <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Preferência de corte, alergia, lembrete…" />
        </Field>
      </div>
    </Modal>
  );
}
