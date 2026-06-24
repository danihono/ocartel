"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { signOutApp } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import type { Barbeiro } from "@/lib/types";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PALETA = ["#0EA37A", "#0FB6C8", "#7C5CFC", "#E0A21A", "#F0476A"];
const HORAS = Array.from({ length: 15 }, (_, i) => `${String(7 + i).padStart(2, "0")}:00`);

function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function ConfiguracoesPage() {
  const { state, actions } = useStore();
  const toast = useToast();
  const router = useRouter();

  const [nome, setNome] = useState(state.config.nome);
  const [endereco, setEndereco] = useState(state.config.endereco);
  const [telefone, setTelefone] = useState(state.config.telefone);
  const [abre, setAbre] = useState(state.config.horario.abre);
  const [fecha, setFecha] = useState(state.config.horario.fecha);
  const [diasAtivos, setDiasAtivos] = useState<boolean[]>(state.config.horario.diasAtivos);

  const [novoBarbeiro, setNovoBarbeiro] = useState("");

  // Sincroniza o formulário sempre que a config do store mudar
  // (após hidratar do localStorage ou após "Restaurar dados").
  useEffect(() => {
    setNome(state.config.nome);
    setEndereco(state.config.endereco);
    setTelefone(state.config.telefone);
    setAbre(state.config.horario.abre);
    setFecha(state.config.horario.fecha);
    setDiasAtivos(state.config.horario.diasAtivos);
  }, [state.config]);

  async function salvarConfig() {
    try {
      await actions.config.update({ nome, endereco, telefone, horario: { abre, fecha, diasAtivos } });
      toast("Configurações salvas.");
    } catch {
      toast("Não foi possível salvar.", "error");
    }
  }

  function toggleDia(i: number) {
    setDiasAtivos((d) => d.map((v, idx) => (idx === i ? !v : v)));
  }

  function setBarb(b: Barbeiro, patch: Partial<Barbeiro>) {
    void actions.barbeiros.update({ ...b, ...patch }).catch(() => toast("Não foi possível salvar.", "error"));
  }

  async function adicionarBarbeiro() {
    if (!novoBarbeiro.trim()) {
      toast("Informe o nome do barbeiro.", "error");
      return;
    }
    try {
      await actions.barbeiros.add({
        id: makeId("b"),
        nome: novoBarbeiro.trim(),
        iniciais: iniciaisDe(novoBarbeiro),
        cor: PALETA[state.barbeiros.length % PALETA.length],
      });
      toast("Barbeiro adicionado.");
      setNovoBarbeiro("");
    } catch {
      toast("Não foi possível adicionar o barbeiro.", "error");
    }
  }

  async function sair() {
    await signOutApp();
    toast("Sessão encerrada.");
    router.push("/login");
  }

  const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 18, maxWidth: 1600 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Dados da barbearia */}
        <Card>
          <CardTitle>Dados da barbearia</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            <Field label="Nome">
              <TextInput value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Field label="Endereço">
              <TextInput value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </Field>
            <Field label="Telefone">
              <TextInput value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </Field>

            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Horário de funcionamento</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <Field label="Abre" style={{ flex: 1 }}>
                  <Select value={abre} onChange={(e) => setAbre(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fecha" style={{ flex: 1 }}>
                  <Select value={fecha} onChange={(e) => setFecha(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                {DIAS.map((d, i) => {
                  const on = diasAtivos[i];
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDia(i)}
                      style={{ flex: 1, cursor: "pointer", border: `1.5px solid ${on ? c.brass : c.borderInput}`, background: on ? c.brassTint : c.surface, color: on ? c.inkTitle : c.ink3, borderRadius: 9, padding: "9px 0", fontSize: 12, fontWeight: on ? 700 : 600 }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={salvarConfig}>Salvar alterações</Button>
          </div>
        </Card>

        {/* Barbeiros */}
        <Card>
          <CardTitle sub="Cada barbeiro vira uma coluna na agenda">Equipe</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {state.barbeiros.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: b.cor, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{b.iniciais}</div>
                <TextInput value={b.nome} onChange={(e) => setBarb(b, { nome: e.target.value, iniciais: iniciaisDe(e.target.value) })} />
                <button onClick={() => { void actions.barbeiros.remove(b.id).then(() => toast("Barbeiro removido.")).catch(() => toast("Não foi possível remover.", "error")); }} aria-label="Remover" style={{ flex: "none", border: `1px solid ${c.borderInput}`, background: c.surface, borderRadius: 9, width: 38, height: 38, cursor: "pointer", color: c.red, fontSize: 15 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 14 }}>
            <TextInput value={novoBarbeiro} onChange={(e) => setNovoBarbeiro(e.target.value)} placeholder="Nome do novo barbeiro" />
            <Button onClick={adicionarBarbeiro}>Adicionar</Button>
          </div>
        </Card>
      </div>

      {/* Conta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <CardTitle>Conta</CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.leather, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>MR</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.inkTitle }}>{state.auth.nome}</div>
              <div style={{ fontSize: 12, color: c.ink3 }}>Dona · Admin</div>
            </div>
          </div>
          <button onClick={sair} style={{ width: "100%", marginTop: 18, border: `1px solid ${c.borderInput}`, background: c.surface, color: c.red, cursor: "pointer", padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 600 }}>
            Sair da conta
          </button>
        </Card>
      </div>
    </div>
  );
}
