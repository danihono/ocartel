"use client";

import { useEffect, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Seal";
import { tagMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { selectClientesFiltrados, selectContagensCliente, type FiltroCliente } from "@/lib/selectors";
import { ClienteModal } from "@/components/admin/ClienteModal";
import { NovoAgendamentoModal } from "@/components/admin/NovoAgendamentoModal";
import { historicoCliente } from "@/lib/mock-data";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };
const FILTROS: FiltroCliente[] = ["Todos", "VIP", "Avulsos", "Inadimplentes"];

export default function ClientesPage() {
  const { state } = useStore();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroCliente>("Todos");
  const [selId, setSelId] = useState("c1");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);

  // Lê ?q (vindo da busca da Topbar) só no cliente, após montar — preserva o SSR.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setBusca(q);
    } catch {
      /* ignore */
    }
  }, []);

  const lista = selectClientesFiltrados(state, filtro, busca);
  const contagens = selectContagensCliente(state);
  const sel = state.clientes.find((x) => x.id === selId) ?? lista[0] ?? state.clientes[0];
  const selTag = sel ? tagMeta(sel.tag) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 18, height: "100%", maxWidth: 1180 }}>
      {/* List */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#241B12" }}>Clientes</span>
            <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>{contagens.Todos}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setNovoOpen(true)} style={{ border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: "8px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 700 }}>
              + Novo cliente
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "9px 13px", marginBottom: 12 }}>
            <span style={{ width: 13, height: 13, border: "1.6px solid #B6A78F", borderRadius: "50%", display: "inline-block", flex: "none" }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#241B12", fontFamily: font.sans }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTROS.map((f) => {
              const on = f === filtro;
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: on ? 700 : 600,
                    color: on ? "#3E2C20" : c.ink3,
                    background: on ? c.brassSoft : c.surfaceWarm,
                    borderRadius: 999,
                    padding: "5px 12px",
                  }}
                >
                  {f} <span style={{ opacity: 0.6 }}>{contagens[f]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {lista.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: c.ink3, fontSize: 13 }}>Nenhum cliente encontrado.</div>
          ) : null}
          {lista.map((cl) => {
            const active = cl.id === selId;
            const t = tagMeta(cl.tag);
            return (
              <button
                key={cl.id}
                onClick={() => setSelId(cl.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${active ? c.brass : "transparent"}`,
                  cursor: "pointer",
                  background: active ? "rgba(201,168,106,0.12)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${c.borderSoft}`,
                }}
              >
                <Avatar initials={cl.iniciais} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#231B14", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 1 }}>{cl.telefone}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#3E2C20" }}>{cl.plano}</div>
                  <div style={{ fontSize: 11, color: c.ink3, marginTop: 2 }}>{cl.ultimoAtendimento}</div>
                </div>
                {t ? <Tag label={cl.tag} fg={t.fg} bg={t.bg} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      {sel ? (
        <Card pad="24px" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <Avatar initials={sel.iniciais} size={58} bg={c.leather} color="#E8DAC0" fontSize={19} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: "#241B12" }}>{sel.nome}</span>
                {selTag ? <Tag label={sel.tag} fg={selTag.fg} bg={selTag.bg} /> : null}
              </div>
              <div style={{ fontSize: 13, color: c.ink2, marginTop: 3 }}>
                {sel.telefone} · {sel.email}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "none" }}>
              <button onClick={() => setAgendarOpen(true)} style={{ border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                Novo agendamento
              </button>
              <button onClick={() => setEditOpen(true)} style={{ border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: "#3E2C20", padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                Editar
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 22 }}>
            {[
              { l: "Total gasto", v: sel.totalGasto },
              { l: "Atendimentos", v: String(sel.atendimentos) },
              { l: "Cliente desde", v: sel.desde },
            ].map((s) => (
              <div key={s.l} style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
                <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>{s.l}</div>
                <div style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: "#221A13", marginTop: 5 }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Plano */}
          <div style={{ border: "1px solid #EFE4D2", background: "#FBF6EC", borderRadius: 12, padding: 16, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#3E2C20", flex: 1 }}>Plano · {sel.plano}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: c.green }}>Renova 12 jul</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 11 }}>
              <div style={{ flex: 1, height: 7, background: "#EFE6D8", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: "50%", height: "100%", background: c.brass }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#3E2C20" }}>2 / 4 cortes</span>
            </div>
          </div>

          {/* Próximo + Pagamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              <div style={eyebrow}>Próximo agendamento</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#241B12", marginTop: 5 }}>Ter 24 jun · 11:00</div>
              <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>Corte + Barba · Everton</div>
            </div>
            <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              <div style={eyebrow}>Forma de pagamento</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#241B12", marginTop: 5 }}>Pix</div>
              <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>ou cartão final 4421</div>
            </div>
          </div>

          {/* Fidelidade */}
          <div style={{ background: c.espresso, borderRadius: 12, padding: 16, marginTop: 12, color: "#E8DAC0" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Fidelidade</span>
              <span style={{ fontSize: 11.5, color: c.brass, fontWeight: 600 }}>7 / 10 para um corte grátis</span>
            </div>
            <div style={{ display: "flex", height: 7, background: "#3a2c22", borderRadius: 4, overflow: "hidden", marginTop: 11 }}>
              <div style={{ width: "70%", background: c.brass }} />
            </div>
          </div>

          {/* Observações */}
          <div style={{ marginTop: 18 }}>
            <div style={{ ...eyebrow, marginBottom: 7 }}>Observações</div>
            <div style={{ fontSize: 13.5, color: "#3E2C20", lineHeight: 1.5, background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              Gosta de degradê baixo, máquina 1 nas laterais. Sempre marca com o Everton.
            </div>
          </div>

          {/* Histórico */}
          <div style={{ marginTop: 20 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Histórico de atendimentos</div>
            {historicoCliente.map((h) => (
              <div key={h.data + h.servico} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
                <div style={{ fontFamily: font.serif, fontSize: 13, fontWeight: 600, color: c.brown2, width: 48 }}>{h.data}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "#241B12" }}>{h.servico}</span>
                  <span style={{ fontSize: 12, color: c.ink2, marginLeft: 8 }}>{h.barbeiro}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#3E2C20" }}>{h.valor}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <ClienteModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={(id) => { setFiltro("Todos"); setBusca(""); setSelId(id); }} />
      {sel ? <ClienteModal open={editOpen} onClose={() => setEditOpen(false)} cliente={sel} /> : null}
      {sel ? <NovoAgendamentoModal open={agendarOpen} onClose={() => setAgendarOpen(false)} defaults={{ clienteNome: sel.nome }} /> : null}
    </div>
  );
}
