"use client";

import { useState } from "react";
import { c, font } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { MoneyInput, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { formatBRL } from "@/lib/selectors";
import type { Plano, Servico } from "@/lib/types";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

export default function PlanosPage() {
  const { state, actions } = useStore();
  const toast = useToast();

  const [novoNome, setNovoNome] = useState("");
  const [novoDur, setNovoDur] = useState(40);
  const [novoPreco, setNovoPreco] = useState(75);

  // Novo plano de assinatura (cliente).
  const [planoNome, setPlanoNome] = useState("");
  const [planoValor, setPlanoValor] = useState(99);
  const [planoVenc, setPlanoVenc] = useState(5);

  const carregando = !state.ui.hidratado;

  const setServ = (s: Servico, patch: Partial<Servico>) => {
    void actions.servicos.update({ ...s, ...patch }).catch(() => toast("Não foi possível salvar.", "error"));
  };

  const setPlano = (p: Plano, patch: Partial<Plano>) => {
    void actions.planos.update({ ...p, ...patch }).catch(() => toast("Não foi possível salvar.", "error"));
  };

  async function adicionar() {
    if (!novoNome.trim()) {
      toast("Informe o nome do serviço.", "error");
      return;
    }
    try {
      await actions.servicos.add({ id: makeId("s"), nome: novoNome.trim(), duracaoMin: novoDur, preco: novoPreco });
      toast("Serviço adicionado.");
      setNovoNome("");
      setNovoDur(40);
      setNovoPreco(75);
    } catch {
      toast("Não foi possível adicionar o serviço.", "error");
    }
  }

  // Quantos agendamentos (na janela carregada) usam este serviço — por id ou nome.
  const usoServico = (s: Servico) => state.agendamentos.filter((a) => a.servicoId === s.id || a.servico === s.nome).length;

  async function remover(s: Servico) {
    const usos = usoServico(s);
    if (usos > 0) {
      toast(`${usos} agendamento(s) usam "${s.nome}". Reatribua antes de excluir.`, "error");
      return;
    }
    try {
      await actions.servicos.remove(s.id);
      toast("Serviço removido.");
    } catch {
      toast("Não foi possível remover o serviço.", "error");
    }
  }

  async function adicionarPlano() {
    if (!planoNome.trim()) {
      toast("Informe o nome do plano.", "error");
      return;
    }
    if (planoValor <= 0) {
      toast("Informe a mensalidade.", "error");
      return;
    }
    try {
      await actions.planos.add({ id: makeId("p"), nome: planoNome.trim(), valor: planoValor, diaVencimento: planoVenc, ativo: true });
      toast("Plano criado.");
      setPlanoNome("");
      setPlanoValor(99);
      setPlanoVenc(5);
    } catch {
      toast("Não foi possível criar o plano.", "error");
    }
  }

  async function removerPlano(p: Plano) {
    const vinculados = state.clientes.filter((cl) => cl.planId === p.id).length;
    if (vinculados > 0) {
      toast(`${vinculados} cliente(s) usam este plano. Reatribua antes de excluir.`, "error");
      return;
    }
    try {
      await actions.planos.remove(p.id);
      toast("Plano removido.");
    } catch {
      toast("Não foi possível remover o plano.", "error");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 18, maxWidth: 1600 }}>
      {/* Serviços */}
      <Card>
        <CardTitle sub="Preços e durações usados na agenda e no agendamento público">Serviços</CardTitle>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.1fr 52px 40px", gap: 10, marginTop: 16, alignItems: "center", ...eyebrow }}>
          <span>Serviço</span>
          <span>Duração (min)</span>
          <span>Preço</span>
          <span>Usos</span>
          <span />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
          {carregando ? (
            <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Carregando…</div>
          ) : state.servicos.length === 0 ? (
            <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Nenhum serviço cadastrado ainda.</div>
          ) : (
            state.servicos.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.1fr 52px 40px", gap: 10, alignItems: "center" }}>
                <TextInput value={s.nome} onChange={(e) => setServ(s, { nome: e.target.value })} />
                <TextInput type="number" value={s.duracaoMin} onChange={(e) => setServ(s, { duracaoMin: Number(e.target.value) || 0 })} />
                <MoneyInput value={s.preco} onChange={(n) => setServ(s, { preco: n })} />
                <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, textAlign: "center" }}>{usoServico(s)}</span>
                <button onClick={() => remover(s)} aria-label="Remover" style={{ border: `1px solid ${c.borderInput}`, background: c.surface, borderRadius: 9, width: 36, height: 38, cursor: "pointer", color: c.red, fontSize: 15 }}>
                  ✕
                </button>
              </div>
            ))
          )}
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

      {/* Planos de assinatura do cliente (mensalidade) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <CardTitle sub="Mensalidades cobradas dos clientes (valor e dia de vencimento)">Planos de assinatura</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {carregando ? (
              <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Carregando…</div>
            ) : state.planos.length === 0 ? (
              <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Nenhum plano. Crie o primeiro abaixo.</div>
            ) : (
              state.planos.map((p) => {
                const usados = state.clientes.filter((cl) => cl.planId === p.id).length;
                return (
                  <div key={p.id} style={{ border: `1px solid ${c.border}`, background: c.surfaceAlt, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <TextInput value={p.nome} onChange={(e) => setPlano(p, { nome: e.target.value })} />
                      <button onClick={() => removerPlano(p)} aria-label="Remover plano" style={{ flex: "none", border: `1px solid ${c.borderInput}`, background: c.surface, borderRadius: 9, width: 36, height: 38, cursor: "pointer", color: c.red, fontSize: 15 }}>
                        ✕
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ ...eyebrow, marginBottom: 4 }}>Mensalidade</div>
                        <MoneyInput value={p.valor} onChange={(n) => setPlano(p, { valor: n })} />
                      </div>
                      <div style={{ width: 92 }}>
                        <div style={{ ...eyebrow, marginBottom: 4 }}>Vence dia</div>
                        <TextInput type="number" value={p.diaVencimento ?? 5} onChange={(e) => setPlano(p, { diaVencimento: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => setPlano(p, { ativo: !(p.ativo ?? true) })}
                        style={{ border: `1.5px solid ${p.ativo ?? true ? c.brass : c.borderInput}`, background: p.ativo ?? true ? c.brassTint : c.surface, color: p.ativo ?? true ? c.inkTitle : c.ink3, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                      >
                        {p.ativo ?? true ? "Ativo" : "Inativo"}
                      </button>
                      <span style={{ fontSize: 11.5, color: c.ink3 }}>{usados} assinante(s)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ ...eyebrow, marginBottom: 10 }}>Novo plano</div>
            <TextInput value={planoNome} onChange={(e) => setPlanoNome(e.target.value)} placeholder="Ex.: Mensal Premium" />
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Mensalidade</div>
                <MoneyInput value={planoValor} onChange={setPlanoValor} />
              </div>
              <div style={{ width: 80 }}>
                <div style={{ ...eyebrow, marginBottom: 4 }}>Dia</div>
                <TextInput type="number" value={planoVenc} onChange={(e) => setPlanoVenc(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
              <Button onClick={adicionarPlano}>Criar</Button>
            </div>
          </div>
        </Card>

        {/* Assinatura O Cartel (tiers SaaS da própria barbearia) */}
        <Card>
          <CardTitle sub="O plano que sua barbearia mantém no O Cartel">Seu plano no O Cartel</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            {state.planosTiers.map((tier) => (
              <div key={tier.id} style={{ border: `1px solid ${c.border}`, background: c.surfaceAlt, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ fontFamily: font.serif, fontSize: 17, fontWeight: 600, color: c.inkTitle, flex: 1 }}>{tier.nome}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: c.inkTitle }}>{formatBRL(tier.preco)}<span style={{ fontSize: 11, color: c.ink3, fontWeight: 500 }}>/mês</span></span>
                </div>
                <div style={{ fontSize: 12, color: c.ink2, marginTop: 6 }}>{tier.descricao}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
