"use client";

// Catálogo da barbearia em duas abas: SERVIÇOS e PLANOS. Cada aba tem o
// formulário de cadastro no topo e a lista do que já existe logo abaixo — antes
// era tudo empilhado em duas colunas fixas na mesma tela.
//
// O dia de vencimento saiu daqui: ele é por pessoa (Cliente.diaVencimento),
// editável no cadastro do cliente.

import { useMemo, useState } from "react";
import { c } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { MoneyInput, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import type { Plano, Servico } from "@/lib/types";

const eyebrow = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };
const ABAS = [
  ["servicos", "Serviços"],
  ["planos", "Planos"],
] as const;
const COLS_SERVICO = "2fr 1fr 1.1fr 52px 40px";

export function TelaPlanos() {
  const { state, dispatch, actions } = useStore();
  const toast = useToast();

  // A aba fica no store: voltar de outra tela do menu mantém onde você estava.
  const aba = state.ui.telas.planos.aba;
  const setAba = (a: (typeof ABAS)[number][0]) => dispatch({ type: "SET_TELA", tela: "planos", patch: { aba: a } });

  const [novoNome, setNovoNome] = useState("");
  const [novoDur, setNovoDur] = useState(40);
  const [novoPreco, setNovoPreco] = useState(75);

  // Novo plano de assinatura (cliente).
  const [planoNome, setPlanoNome] = useState("");
  const [planoValor, setPlanoValor] = useState(99);

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

  // Quantos agendamentos (na janela carregada) usam cada serviço — uma passada
  // só sobre os agendamentos, em vez de uma varredura por linha da tabela.
  const usosPorServico = useMemo(() => {
    const porId = new Map<string, number>();
    const porNome = new Map<string, number>();
    for (const a of state.agendamentos) {
      if (a.servicoId) porId.set(a.servicoId, (porId.get(a.servicoId) ?? 0) + 1);
      if (a.servico) porNome.set(a.servico, (porNome.get(a.servico) ?? 0) + 1);
    }
    return (s: Servico) => porId.get(s.id) ?? porNome.get(s.nome) ?? 0;
  }, [state.agendamentos]);

  // Assinantes por plano — idem, uma passada sobre os clientes.
  const assinantesPorPlano = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const cl of state.clientes) {
      if (cl.planId) mapa.set(cl.planId, (mapa.get(cl.planId) ?? 0) + 1);
    }
    return mapa;
  }, [state.clientes]);

  async function remover(s: Servico) {
    const usos = usosPorServico(s);
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
      await actions.planos.add({ id: makeId("p"), nome: planoNome.trim(), valor: planoValor, ativo: true });
      toast("Plano criado.");
      setPlanoNome("");
      setPlanoValor(99);
    } catch {
      toast("Não foi possível criar o plano.", "error");
    }
  }

  async function removerPlano(p: Plano) {
    const vinculados = assinantesPorPlano.get(p.id) ?? 0;
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
    <div className="oc-stagger" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
      {/* Abas */}
      <div className="oc-seg" role="tablist" style={{ alignSelf: "flex-start" }}>
        {ABAS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)} style={{ padding: "8px 22px", fontSize: 13.5 }}>
            {label}
          </button>
        ))}
      </div>

      {aba === "servicos" ? (
        <>
          {/* Cadastro */}
          <Card>
            <CardTitle sub="Preços e durações usados na agenda e no agendamento público">Novo serviço</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr auto", gap: 10, marginTop: 16, ...eyebrow }}>
              <span>Serviço</span>
              <span>Duração (min)</span>
              <span>Preço</span>
              <span />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr auto", gap: 10, alignItems: "center", marginTop: 8 }}>
              <TextInput value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Sobrancelha" />
              <TextInput type="number" value={novoDur} onChange={(e) => setNovoDur(Number(e.target.value) || 0)} />
              <MoneyInput value={novoPreco} onChange={setNovoPreco} />
              <Button icon="mais" onClick={adicionar}>Adicionar</Button>
            </div>
          </Card>

          {/* Lista */}
          <Card>
            <CardTitle sub="Clique para editar — as mudanças salvam sozinhas">Serviços cadastrados</CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: COLS_SERVICO, gap: 10, marginTop: 16, alignItems: "center", ...eyebrow }}>
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
                  <div key={s.id} style={{ display: "grid", gridTemplateColumns: COLS_SERVICO, gap: 10, alignItems: "center" }}>
                    <TextInput value={s.nome} onChange={(e) => setServ(s, { nome: e.target.value })} />
                    <TextInput type="number" value={s.duracaoMin} onChange={(e) => setServ(s, { duracaoMin: Number(e.target.value) || 0 })} />
                    <MoneyInput value={s.preco} onChange={(n) => setServ(s, { preco: n })} />
                    <span className="num" style={{ fontSize: 13, color: c.ink2, textAlign: "center" }}>{usosPorServico(s)}</span>
                    <button onClick={() => remover(s)} aria-label="Remover" className="oc-icon-btn" style={{ color: c.red, width: 40, height: 40 }}>
                      <Icon name="lixo" size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Cadastro */}
          <Card>
            <CardTitle sub="Mensalidade cobrada dos clientes. O dia de vencimento é de cada assinante, no cadastro do cliente.">
              Novo plano
            </CardTitle>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr auto", gap: 10, marginTop: 16, ...eyebrow }}>
              <span>Plano</span>
              <span>Mensalidade</span>
              <span />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr auto", gap: 10, alignItems: "center", marginTop: 8 }}>
              <TextInput value={planoNome} onChange={(e) => setPlanoNome(e.target.value)} placeholder="Ex.: Mensal Premium" />
              <MoneyInput value={planoValor} onChange={setPlanoValor} />
              <Button icon="mais" onClick={adicionarPlano}>Criar</Button>
            </div>
          </Card>

          {/* Lista */}
          <Card>
            <CardTitle sub="Clique para editar — as mudanças salvam sozinhas">Planos cadastrados</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {carregando ? (
                <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Carregando…</div>
              ) : state.planos.length === 0 ? (
                <div style={{ fontSize: 13, color: c.ink3, padding: "10px 0" }}>Nenhum plano. Crie o primeiro acima.</div>
              ) : (
                state.planos.map((p) => {
                  const usados = assinantesPorPlano.get(p.id) ?? 0;
                  const ativo = p.ativo ?? true;
                  return (
                    <div key={p.id} style={{ border: `1px solid ${ativo ? c.accentLine : c.border}`, background: ativo ? `linear-gradient(135deg, ${c.accentTint}, transparent 60%)` : c.field, borderRadius: 16, padding: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 40px", gap: 10, alignItems: "end" }}>
                        <div>
                          <div style={{ ...eyebrow, marginBottom: 4 }}>Plano</div>
                          <TextInput value={p.nome} onChange={(e) => setPlano(p, { nome: e.target.value })} />
                        </div>
                        <div>
                          <div style={{ ...eyebrow, marginBottom: 4 }}>Mensalidade</div>
                          <MoneyInput value={p.valor} onChange={(n) => setPlano(p, { valor: n })} />
                        </div>
                        <button onClick={() => removerPlano(p)} aria-label="Remover plano" className="oc-icon-btn" style={{ color: c.red, width: 40, height: 40 }}>
                          <Icon name="lixo" size={16} />
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => setPlano(p, { ativo: !ativo })}
                          style={{ border: "none", background: ativo ? c.greenBg : c.surfaceAlt, color: ativo ? c.greenText : c.ink3, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                          {ativo ? "Ativo" : "Inativo"}
                        </button>
                        <span style={{ fontSize: 11.5, color: c.ink3 }}>{usados} assinante(s)</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
