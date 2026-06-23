"use client";

import { useState } from "react";
import { c, font } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { MoneyInput, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { slug } from "@/lib/selectors";
import type { Servico } from "@/lib/types";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

export default function PlanosPage() {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const [novoNome, setNovoNome] = useState("");
  const [novoDur, setNovoDur] = useState(40);
  const [novoPreco, setNovoPreco] = useState(75);

  const setServ = (s: Servico, patch: Partial<Servico>) => dispatch({ type: "UPDATE_SERVICO", servico: { ...s, ...patch } });

  function adicionar() {
    if (!novoNome.trim()) {
      toast("Informe o nome do serviço.", "error");
      return;
    }
    dispatch({ type: "ADD_SERVICO", servico: { id: slug(novoNome) || makeId("s"), nome: novoNome.trim(), duracaoMin: novoDur, preco: novoPreco } });
    toast("Serviço adicionado.");
    setNovoNome("");
    setNovoDur(40);
    setNovoPreco(75);
  }

  function remover(id: string) {
    dispatch({ type: "REMOVE_SERVICO", id });
    toast("Serviço removido.");
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18, maxWidth: 1180 }}>
      {/* Serviços */}
      <Card>
        <CardTitle sub="Preços e durações usados na agenda e no agendamento público">Serviços</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 40px", gap: 10, marginTop: 16, alignItems: "center", ...eyebrow }}>
          <span>Serviço</span>
          <span>Duração (min)</span>
          <span>Preço</span>
          <span />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
          {state.servicos.map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 40px", gap: 10, alignItems: "center" }}>
              <TextInput value={s.nome} onChange={(e) => setServ(s, { nome: e.target.value })} />
              <TextInput type="number" value={s.duracaoMin} onChange={(e) => setServ(s, { duracaoMin: Number(e.target.value) || 0 })} />
              <MoneyInput value={s.preco} onChange={(n) => setServ(s, { preco: n })} />
              <button onClick={() => remover(s.id)} aria-label="Remover" style={{ border: `1px solid ${c.borderInput}`, background: c.surface, borderRadius: 9, width: 36, height: 38, cursor: "pointer", color: c.red, fontSize: 15 }}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 16, paddingTop: 16 }}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Novo serviço</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr auto", gap: 10, alignItems: "center" }}>
            <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Sobrancelha" />
            <TextInput type="number" value={novoDur} onChange={(e) => setNovoDur(Number(e.target.value) || 0)} />
            <MoneyInput value={novoPreco} onChange={setNovoPreco} />
            <Button onClick={adicionar}>Adicionar</Button>
          </div>
        </div>
      </Card>

      {/* Planos de assinatura */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <CardTitle sub="Mensalidades oferecidas aos clientes">Planos de assinatura</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            {state.planosTiers.map((tier) => (
              <div key={tier.id} style={{ border: `1px solid ${c.border}`, background: c.surfaceAlt, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: font.serif, fontSize: 17, fontWeight: 600, color: "#241B12", flex: 1 }}>{tier.nome}</span>
                  <div style={{ width: 120 }}>
                    <MoneyInput value={tier.preco} onChange={(n) => dispatch({ type: "UPDATE_PLANO_TIER", tier: { ...tier, preco: n } })} />
                  </div>
                </div>
                <TextInput value={tier.descricao} onChange={(e) => dispatch({ type: "UPDATE_PLANO_TIER", tier: { ...tier, descricao: e.target.value } })} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
