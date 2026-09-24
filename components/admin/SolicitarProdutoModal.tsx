"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Select, Textarea, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { makeId, useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import { hojeLocalISO } from "@/lib/date";
import { c } from "@/lib/theme";
import type { SolicitacaoProduto, UrgenciaSolicitacao } from "@/lib/types";

/** Registra um produto que faltou e precisa ser comprado. */
export function SolicitarProdutoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();

  const [produto, setProduto] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [unidade, setUnidade] = useState("un");
  const [urgencia, setUrgencia] = useState<UrgenciaSolicitacao>("normal");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProduto("");
    setQuantidade("1");
    setUnidade("un");
    setUrgencia("normal");
    setObservacoes("");
  }, [open]);

  // Produtos já pedidos antes, para não redigitar (e para o nome não virar cinco grafias
  // diferentes da mesma coisa, que é o que estraga qualquer relatório depois).
  const jaPedidos = [...new Set(state.solicitacoes.map((s) => s.produto))].sort();

  async function salvar() {
    const nome = produto.trim();
    const qtd = Number(quantidade.replace(",", "."));
    if (!nome) {
      toast("Informe o produto que faltou.", "error");
      return;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      toast("Quantidade precisa ser maior que zero.", "error");
      return;
    }

    const nova: SolicitacaoProduto = {
      id: makeId("sol"),
      produto: nome,
      quantidade: qtd,
      ...(unidade.trim() ? { unidade: unidade.trim() } : {}),
      urgencia,
      ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
      solicitadoPor: profile?.nome ?? state.auth.nome,
      solicitadoEm: hojeLocalISO(),
      status: "pendente",
    };

    setSalvando(true);
    try {
      await actions.solicitacoes.add(nova);
      toast(urgencia === "urgente" ? `“${nome}” anotado como urgente.` : `“${nome}” anotado na lista de compras.`);
      onClose();
    } catch {
      toast("Não foi possível registrar a solicitação.", "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo produto em falta"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Registrar falta
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <Field label="Produto">
          <TextInput
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            placeholder="Pomada modeladora"
            list="produtos-ja-pedidos"
            autoFocus
          />
          <datalist id="produtos-ja-pedidos">
            {jaPedidos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Quantidade">
            <TextInput
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal"
              placeholder="2"
            />
          </Field>
          <Field label="Unidade">
            <Select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
              <option value="un">un</option>
              <option value="cx">cx</option>
              <option value="pct">pct</option>
              <option value="L">L</option>
              <option value="kg">kg</option>
            </Select>
          </Field>
        </div>

        <Field label="Urgência">
          <Select value={urgencia} onChange={(e) => setUrgencia(e.target.value as UrgenciaSolicitacao)}>
            <option value="normal">Normal — dá pra esperar a próxima compra</option>
            <option value="urgente">Urgente — acabou, está faltando agora</option>
          </Select>
        </Field>

        <Field label="Observação (opcional)">
          <Textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            placeholder="Marca, tamanho, onde costuma comprar…"
          />
        </Field>

        <div style={{ fontSize: 11.5, color: c.ink3 }}>
          Fica na lista como pendente até alguém registrar a compra.
        </div>
      </div>
    </Modal>
  );
}
