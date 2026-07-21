"use client";

import { useEffect, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Seal";
import { tagMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import {
  selectClientesFiltrados,
  selectContagensCliente,
  selectHistoricoCliente,
  selectProximoAgendamentoCliente,
  selectFormaPreferidaCliente,
  tagDerivadaCliente,
  formaPagamentoLabel,
  formatBRL,
  type FiltroCliente,
} from "@/lib/selectors";
import { isoParaLabel, tempoRelativo } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import { ClienteModal } from "@/components/admin/ClienteModal";
import { ImportarClientesModal } from "@/components/admin/ImportarClientesModal";
import { NovoAgendamentoModal } from "@/components/admin/NovoAgendamentoModal";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };
const FILTROS: FiltroCliente[] = ["Todos", "VIP", "Avulsos", "Inadimplentes"];
const HIST_INICIAL = 8;

export default function ClientesPage() {
  const { state, actions } = useStore();
  const toast = useToast();
  const hoje = useHoje();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroCliente>("Todos");
  const [selId, setSelId] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [verTudo, setVerTudo] = useState(false);

  // Lê ?q (vindo da busca da Topbar) só no cliente, após montar — preserva o SSR.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setBusca(q);
    } catch {
      /* ignore */
    }
  }, []);

  const lista = selectClientesFiltrados(state, filtro, busca, hoje);
  const contagens = selectContagensCliente(state, hoje);
  // Seleção restrita à lista filtrada; cai no 1º item, ou null (estado vazio).
  const sel = lista.find((x) => x.id === selId) ?? lista[0] ?? null;
  // Marcador exibido = derivado das cobranças (Inadimplente) com fallback ao tag manual (VIP/Novo).
  const selTagValue = sel ? tagDerivadaCliente(state, sel, hoje) : "";
  const selTag = tagMeta(selTagValue);

  const historico = sel ? selectHistoricoCliente(state, sel) : [];
  const proximo = sel ? selectProximoAgendamentoCliente(state, sel, hoje) : null;
  const formaPreferida = sel ? selectFormaPreferidaCliente(state, sel) : null;
  const histVisivel = verTudo ? historico : historico.slice(0, HIST_INICIAL);

  async function excluirCliente() {
    if (!sel) return;
    const ativos: string[] = ["agendado", "confirmado", "atendimento"];
    const futuros = state.agendamentos.filter(
      (a) => (a.clienteId ? a.clienteId === sel.id : a.clienteNome === sel.nome) && a.date >= hoje && ativos.includes(a.status),
    ).length;
    const aviso = futuros > 0 ? `\n\nAtenção: ${futuros} agendamento(s) futuro(s) deste cliente continuarão na agenda.` : "";
    if (!window.confirm(`Excluir ${sel.nome}? Esta ação não pode ser desfeita.${aviso}`)) return;
    try {
      await actions.clientes.remove(sel.id);
      toast("Cliente excluído.");
      setSelId("");
    } catch {
      toast("Não foi possível excluir o cliente.", "error");
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 18, height: "100%", maxWidth: 1600 }}>
      {/* List */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>Clientes</span>
            <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>{contagens.Todos}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setImportOpen(true)} style={{ border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: c.inkTitle, padding: "8px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 600 }}>
              Importar
            </button>
            <button onClick={() => setNovoOpen(true)} style={{ border: "none", cursor: "pointer", background: c.primaryBtnBg, color: c.primaryBtnText, padding: "8px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 700 }}>
              + Novo cliente
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "9px 13px", marginBottom: 12 }}>
            <span style={{ width: 13, height: 13, border: `1.6px solid ${c.ink4}`, borderRadius: "50%", display: "inline-block", flex: "none" }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: c.inkTitle, fontFamily: font.sans }}
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
                    color: on ? c.inkTitle : c.ink3,
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
            const active = sel?.id === cl.id;
            const clTag = tagDerivadaCliente(state, cl, hoje);
            const t = tagMeta(clTag);
            const ultimo = cl.ultimoAtendimentoISO ? tempoRelativo(cl.ultimoAtendimentoISO, hoje) : cl.ultimoAtendimento;
            return (
              <button
                key={cl.id}
                onClick={() => { setSelId(cl.id); setVerTudo(false); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${active ? c.brass : "transparent"}`,
                  cursor: "pointer",
                  background: active ? "rgba(14,163,122,0.12)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${c.borderSoft}`,
                }}
              >
                <Avatar initials={cl.iniciais} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 1 }}>{cl.telefone}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: c.inkTitle }}>{cl.plano}</div>
                  <div style={{ fontSize: 11, color: c.ink3, marginTop: 2 }}>{ultimo}</div>
                </div>
                {t ? <Tag label={clTag} fg={t.fg} bg={t.bg} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      {sel ? (
        <Card pad="24px" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <Avatar initials={sel.iniciais} size={58} bg={c.leather} color={c.darkText} fontSize={19} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: c.inkTitle }}>{sel.nome}</span>
                {selTag ? <Tag label={selTagValue} fg={selTag.fg} bg={selTag.bg} /> : null}
              </div>
              <div style={{ fontSize: 13, color: c.ink2, marginTop: 3 }}>
                {[sel.telefone, sel.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "none" }}>
              <button onClick={() => setAgendarOpen(true)} style={{ border: "none", cursor: "pointer", background: c.primaryBtnBg, color: c.primaryBtnText, padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                Novo agendamento
              </button>
              <button onClick={() => setEditOpen(true)} style={{ border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: c.inkTitle, padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                Editar
              </button>
              <button onClick={excluirCliente} style={{ border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: c.red, padding: "8px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                Excluir
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 22 }}>
            {[
              { l: "Total gasto", v: formatBRL(sel.totalGasto) },
              { l: "Atendimentos", v: String(sel.atendimentos) },
              { l: "Cliente desde", v: sel.desde },
            ].map((s) => (
              <div key={s.l} style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
                <div style={{ fontSize: 10.5, letterSpacing: 0.5, textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>{s.l}</div>
                <div style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: c.inkTitle, marginTop: 5 }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Plano */}
          <div style={{ border: `1px solid ${c.surfaceAlt}`, background: c.surface, borderRadius: 12, padding: 16, marginTop: 18, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.inkTitle, flex: 1 }}>Plano · {sel.plano}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: /avulso/i.test(sel.plano) ? c.ink3 : c.green }}>
              {/avulso/i.test(sel.plano) ? "Sem plano ativo" : "Plano ativo"}
            </span>
          </div>

          {/* Próximo + Pagamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              <div style={eyebrow}>Próximo agendamento</div>
              {proximo ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle, marginTop: 5 }}>
                    {isoParaLabel(proximo.date)} · {proximo.inicio}
                  </div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>{proximo.servico} · {proximo.barbeiroNome}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink3, marginTop: 5 }}>Nenhum futuro</div>
                  <button onClick={() => setAgendarOpen(true)} style={{ marginTop: 4, border: "none", background: "transparent", cursor: "pointer", color: c.brassDeep, fontSize: 12, fontWeight: 700, padding: 0 }}>
                    Agendar →
                  </button>
                </>
              )}
            </div>
            <div style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              <div style={eyebrow}>Forma de pagamento</div>
              {formaPreferida ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.inkTitle, marginTop: 5 }}>{formaPagamentoLabel[formaPreferida]}</div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>mais usada</div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink3, marginTop: 5 }}>Sem pagamentos</div>
              )}
            </div>
          </div>

          {/* Observações */}
          <div style={{ marginTop: 18 }}>
            <div style={{ ...eyebrow, marginBottom: 7 }}>Observações</div>
            <div style={{ fontSize: 13.5, color: sel.observacoes ? c.inkTitle : c.ink3, lineHeight: 1.5, background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
              {sel.observacoes || "Sem observações."}
            </div>
          </div>

          {/* Histórico */}
          <div style={{ marginTop: 20 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Histórico de atendimentos</div>
            {historico.length === 0 ? (
              <div style={{ fontSize: 13, color: c.ink3, padding: "12px 0" }}>Nenhum atendimento concluído ainda.</div>
            ) : (
              <>
                {histVisivel.map((h) => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
                    <div style={{ fontFamily: font.serif, fontSize: 13, fontWeight: 600, color: c.brown2, width: 48 }}>{h.data}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle }}>{h.servico}</span>
                      <span style={{ fontSize: 12, color: c.ink2, marginLeft: 8 }}>{h.barbeiro}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>{formatBRL(h.valor)}</div>
                  </div>
                ))}
                {historico.length > HIST_INICIAL ? (
                  <button onClick={() => setVerTudo((v) => !v)} style={{ marginTop: 10, border: "none", background: "transparent", cursor: "pointer", color: c.brassDeep, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
                    {verTudo ? "Ver menos" : `Ver tudo (${historico.length})`}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card pad="24px" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
          <Avatar initials="" size={52} bg={c.surfaceAlt} color={c.ink4} />
          <div style={{ fontFamily: font.serif, fontSize: 17, fontWeight: 600, color: c.inkTitle, marginTop: 6 }}>Selecione um cliente</div>
          <div style={{ fontSize: 13, color: c.ink3, maxWidth: 260 }}>Escolha um cliente na lista ao lado para ver o perfil completo, ou cadastre um novo.</div>
          <button onClick={() => setNovoOpen(true)} style={{ marginTop: 8, border: "none", cursor: "pointer", background: c.primaryBtnBg, color: c.primaryBtnText, padding: "9px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 700 }}>
            + Novo cliente
          </button>
        </Card>
      )}

      <ClienteModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={(id) => { setFiltro("Todos"); setBusca(""); setSelId(id); }} />
      <ImportarClientesModal open={importOpen} onClose={() => setImportOpen(false)} />
      {sel ? <ClienteModal open={editOpen} onClose={() => setEditOpen(false)} cliente={sel} /> : null}
      {sel ? <NovoAgendamentoModal open={agendarOpen} onClose={() => setAgendarOpen(false)} defaults={{ clienteNome: sel.nome, clienteId: sel.id }} /> : null}
    </div>
  );
}
