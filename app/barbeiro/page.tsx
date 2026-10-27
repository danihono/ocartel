"use client";

// Tela do barbeiro — mobile-only, na mesma moldura de celular da tela do cliente
// (/book). Mini-painel rápido para o barbeiro ver a agenda do dia, os clientes e
// um resumo, além de BLOQUEAR horários (o bloqueio impede agendamentos pela tela
// pública — a guarda fica na server action do booking).
//
// Acesso: usuário com papel `barbeiro` cai aqui no login; o admin abre em modo
// preview pelo link "Tela do barbeiro ↗" (com ?b=<barbeiroId>).

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { c } from "@/lib/theme";
import AuthGuard from "@/components/auth/AuthGuard";
import { Icon } from "@/components/ui/Icon";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { Avatar } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useStore, makeId } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { blocoMeta, STATUS_LABEL, tagMeta } from "@/lib/status";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import { slug as slugify, selectClientesFiltrados, precoServico, formatBRL, fmtDur } from "@/lib/selectors";
import { HOJE_ISO, addDias, hojeLocalISO, isoParaLabelLongo, comparaHora } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import type { Agendamento } from "@/lib/types";

type Tab = "agenda" | "clientes" | "resumo";

export default function BarbeiroPage() {
  return (
    <AuthGuard need="tenant">
      <Suspense fallback={null}>
        <BarbeiroMobile />
      </Suspense>
    </AuthGuard>
  );
}

function BarbeiroMobile() {
  const { state, actions } = useStore();
  const { profile, role } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const bParam = searchParams.get("b");

  const hoje = useHoje();
  const [tab, setTab] = useState<Tab>("agenda");
  // Semente determinística no 1º render (SSR-safe); salta para a data real pós-mount.
  const [date, setDate] = useState(HOJE_ISO);
  useEffect(() => {
    setDate(hojeLocalISO());
  }, []);
  const [busca, setBusca] = useState("");
  const [bloquearOpen, setBloquearOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Agendamento | null>(null);

  // Qual barbeiro é o "dono" desta tela: ?b= (preview do admin) → vínculo do
  // perfil → casamento por nome → 1º barbeiro (fallback).
  // O `?b=` é o PREVIEW de quem administra (o link "Tela do barbeiro ↗" da sidebar).
  // Para um barbeiro ele é ignorado: antes tinha precedência sobre o perfil, então
  // bastava trocar o id na barra de endereço para abrir a agenda de um colega — junto
  // com a base de clientes e o faturamento do dia, que esta tela também mostra.
  const gerencia = role === "admin" || role === "superAdmin";
  const barbId = useMemo(() => {
    if (gerencia && bParam && state.barbeiros.some((b) => b.id === bParam)) return bParam;
    if (profile?.barbeiroId && state.barbeiros.some((b) => b.id === profile.barbeiroId)) return profile.barbeiroId;
    const porNome = profile?.nome ? state.barbeiros.find((b) => slugify(b.nome) === slugify(profile.nome)) : undefined;
    if (porNome) return porNome.id;
    // Sem vínculo, um barbeiro NÃO cai no primeiro da lista: isso abria a agenda de um
    // colega qualquer. Quem administra pode cair, porque está só pré-visualizando.
    return gerencia ? (state.barbeiros[0]?.id ?? null) : null;
  }, [gerencia, bParam, profile?.barbeiroId, profile?.nome, state.barbeiros]);

  const barbeiro = state.barbeiros.find((b) => b.id === barbId) ?? null;

  const doDia = useMemo(
    () =>
      state.agendamentos
        .filter((a) => a.barbeiroId === barbId && a.date === date)
        .sort((a, b) => comparaHora(a.inicio, b.inicio)),
    [state.agendamentos, barbId, date],
  );
  const atendimentos = doDia.filter((a) => a.status !== "bloqueio");
  const ocupadosDoDia = doDia.filter((a) => ocupaHorario(a.status)).map((a) => ({ inicio: a.inicio, duracaoMin: a.duracaoMin }));
  const faturamentoDia = atendimentos.reduce((acc, a) => acc + precoServico(state, a.servico), 0);

  const clientes = selectClientesFiltrados(state, "Todos", busca);
  const carregando = !state.ui.hidratado;

  return (
    <PhoneFrame
      title={(state.config.nome || "Barbearia").toUpperCase()}
      subtitle={barbeiro ? `Agenda de ${barbeiro.nome}` : "Sua agenda"}
      right={barbeiro ? <Avatar initials={barbeiro.iniciais} size={38} bg={c.neon} color={c.onNeon} /> : null}
    >
      {/* corpo rolável */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 18px" }}>
        {carregando ? (
          <Vazio texto="Carregando…" />
        ) : !barbId ? (
          // Conta de barbeiro sem vínculo com um cadastro da equipe. Sem isso a tela
          // ficaria muda: agenda vazia, botões desligados e nenhuma pista do motivo.
          <Vazio texto="Sua conta ainda não está ligada a um barbeiro da equipe. Peça para a barbearia fazer esse vínculo." />
        ) : tab === "agenda" ? (
          <>
            {/* navegação de dia */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <button className="oc-icon-btn" onClick={() => setDate((d) => addDias(d, -1))} aria-label="Dia anterior">
                <Icon name="chevronEsq" size={16} />
              </button>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em", color: c.inkTitle }}>{isoParaLabelLongo(date)}</div>
                {date !== hoje ? (
                  <button onClick={() => setDate(hoje)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: c.accent }}>
                    Voltar para hoje
                  </button>
                ) : (
                  <div style={{ fontSize: 12, color: c.ink3, marginTop: 2 }}>{atendimentos.length} atendimento(s)</div>
                )}
              </div>
              <button className="oc-icon-btn" onClick={() => setDate((d) => addDias(d, 1))} aria-label="Próximo dia">
                <Icon name="chevronDir" size={16} />
              </button>
            </div>

            <button
              onClick={() => setBloquearOpen(true)}
              disabled={!barbId}
              style={{ width: "100%", border: `1px dashed ${c.borderInput}`, background: c.surface, cursor: barbId ? "pointer" : "not-allowed", color: c.accent, padding: "11px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
            >
              <Icon name="bloqueio" size={15} /> Bloquear horário
            </button>

            {doDia.length === 0 ? (
              <Vazio texto="Nenhum horário para este dia." />
            ) : (
              <div className="oc-card" style={{ padding: "4px 14px" }}>
                {doDia.map((a) => (
                  <AgendaRow key={a.id} ag={a} onClick={() => setDetalhe(a)} />
                ))}
              </div>
            )}
          </>
        ) : tab === "clientes" ? (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="oc-input"
              style={{ ...fieldInput, borderRadius: 999, marginBottom: 14 }}
            />
            {clientes.length === 0 ? (
              <Vazio texto="Nenhum cliente encontrado." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientes.map((cl) => {
                  const tm = tagMeta(cl.tag);
                  return (
                    <div key={cl.id} style={{ ...card, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px" }}>
                      <Avatar initials={cl.iniciais} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
                        <div style={{ fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{cl.telefone}</div>
                      </div>
                      {tm ? <span className="oc-chip" style={{ fontSize: 10.5, color: tm.fg, background: tm.bg }}>{cl.tag}</span> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <KpiCard label="Previsto hoje" valor={formatBRL(faturamentoDia)} hero />
              <KpiCard label="Atendimentos" valor={String(atendimentos.length)} />
            </div>
            <div className="oc-label" style={{ margin: "6px 0 10px" }}>
              Próximos hoje
            </div>
            {atendimentos.length === 0 ? (
              <Vazio texto="Sem atendimentos hoje." />
            ) : (
              <div className="oc-card" style={{ padding: "4px 14px" }}>
                {atendimentos.slice(0, 6).map((a) => (
                  <AgendaRow key={a.id} ag={a} onClick={() => setDetalhe(a)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* rodapé de abas: pílula de indicador, como no app */}
      <div className="oc-phone-foot" style={{ justifyContent: "space-around", padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", gap: 4 }}>
        {([
          ["agenda", "Agenda", "agenda"],
          ["clientes", "Clientes", "clientes"],
          ["resumo", "Resumo", "grafico"],
        ] as const).map(([value, label, icon]) => {
          const on = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              aria-pressed={on}
              style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 0", fontSize: 11.5, fontWeight: on ? 600 : 500, color: on ? c.ink : c.ink3 }}
            >
              <span style={{ width: 56, height: 30, borderRadius: 999, display: "grid", placeItems: "center", background: on ? c.primaryBtnBg : "transparent", color: on ? "var(--oc-btn-icon)" : c.ink3, transition: "background .15s" }}>
                <Icon name={icon} size={18} />
              </span>
              {label}
            </button>
          );
        })}
      </div>

      {/* folha: bloquear horário */}
      {bloquearOpen && barbId ? (
        <BloquearSheet
          onClose={() => setBloquearOpen(false)}
          onSalvar={async (inicio, duracaoMin, motivo) => {
            if (!horarioLivre(ocupadosDoDia, inicio, duracaoMin)) {
              toast("Você já tem algo nesse horário.", "error");
              return;
            }
            try {
              await actions.agendamentos.add({
                id: makeId("bl"),
                date,
                barbeiroId: barbId,
                clienteNome: motivo.trim() || "Bloqueado",
                servico: "Bloqueado",
                inicio,
                duracaoMin,
                status: "bloqueio",
                origem: "admin",
              });
              toast("Horário bloqueado.");
              setBloquearOpen(false);
            } catch {
              toast("Não foi possível bloquear o horário.", "error");
            }
          }}
        />
      ) : null}

      {/* folha: detalhe / remover bloqueio */}
      {detalhe ? (
        <DetalheSheet
          ag={detalhe}
          onClose={() => setDetalhe(null)}
          onRemover={async () => {
            try {
              await actions.agendamentos.remove(detalhe.id);
              toast("Bloqueio removido.");
              setDetalhe(null);
            } catch {
              toast("Não foi possível remover.", "error");
            }
          }}
        />
      ) : null}
    </PhoneFrame>
  );
}

// ---- linha de agendamento / bloqueio ----
function AgendaRow({ ag, onClick }: { ag: Agendamento; onClick: () => void }) {
  const m = blocoMeta[ag.status];
  return (
    <button
      onClick={onClick}
      className="oc-agenda-row"
      style={{ display: "grid", gridTemplateColumns: "46px 3px minmax(0,1fr) auto", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "transparent", padding: "12px 0" }}
    >
      <span className="num" style={{ fontSize: 14.5, fontWeight: 500, color: c.inkTitle }}>{ag.inicio}</span>
      <span style={{ height: 34, borderRadius: 2, background: m.bar }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {ag.status === "bloqueio" ? `Bloqueado · ${ag.clienteNome}` : ag.clienteNome}
        </span>
        <span style={{ display: "block", fontSize: 12, color: c.ink3, marginTop: 2 }}>
          {ag.status !== "bloqueio" ? `${ag.servico} · ` : ""}
          {fmtDur(ag.duracaoMin)}
        </span>
      </span>
      {ag.status !== "bloqueio" ? (
        <span className="oc-chip" style={{ fontSize: 10.5, background: m.bg, color: m.title }}>{STATUS_LABEL[ag.status]}</span>
      ) : null}
    </button>
  );
}

// ---- cartão KPI ----
function KpiCard({ label, valor, hero = false }: { label: string; valor: string; hero?: boolean }) {
  return (
    <div className={hero ? "oc-card-hero" : "oc-card"} style={{ flex: 1, padding: "14px 16px" }}>
      <div className="oc-label">{label}</div>
      <div className="num" style={{ fontSize: 24, fontWeight: 500, color: hero ? "#fff" : c.inkTitle, marginTop: 8 }}>{valor}</div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div style={{ textAlign: "center", color: c.ink3, fontSize: 13, padding: "30px 0" }}>{texto}</div>;
}

// ---- folha inferior: bloquear ----
function BloquearSheet({ onClose, onSalvar }: { onClose: () => void; onSalvar: (inicio: string, duracaoMin: number, motivo: string) => void }) {
  const [inicio, setInicio] = useState("12:00");
  const [duracaoMin, setDuracaoMin] = useState(60);
  const [motivo, setMotivo] = useState("Almoço");
  return (
    <Sheet onClose={onClose} titulo="Bloquear horário">
      <div style={{ display: "flex", gap: 12 }}>
        <label style={{ flex: 1 }}>
          <span style={fieldLabel}>Início</span>
          <input type="time" className="oc-input" value={inicio} onChange={(e) => setInicio(e.target.value)} style={fieldInput} />
        </label>
        <label style={{ flex: 1 }}>
          <span style={fieldLabel}>Duração</span>
          <select value={String(duracaoMin)} onChange={(e) => setDuracaoMin(Number(e.target.value))} style={{ ...fieldInput, cursor: "pointer" }}>
            <option value="30">30 min</option>
            <option value="60">1 hora</option>
            <option value="90">1h30</option>
            <option value="120">2 horas</option>
          </select>
        </label>
      </div>
      <label style={{ display: "block", marginTop: 12 }}>
        <span style={fieldLabel}>Motivo</span>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Almoço, folga…" style={fieldInput} />
      </label>
      <button
        onClick={() => onSalvar(inicio, duracaoMin, motivo)}
        className="oc-btn oc-btn-primary oc-btn-block"
        style={{ marginTop: 18, padding: 14, fontSize: 14.5 }}
      >
        Bloquear
      </button>
    </Sheet>
  );
}

// ---- folha inferior: detalhe ----
function DetalheSheet({ ag, onClose, onRemover }: { ag: Agendamento; onClose: () => void; onRemover: () => void }) {
  const bloqueio = ag.status === "bloqueio";
  return (
    <Sheet onClose={onClose} titulo={bloqueio ? "Bloqueio" : "Agendamento"}>
      <Linha l="Horário" v={`${ag.inicio} · ${fmtDur(ag.duracaoMin)}`} />
      <Linha l={bloqueio ? "Motivo" : "Cliente"} v={ag.clienteNome} />
      {!bloqueio ? <Linha l="Serviço" v={ag.servico} /> : null}
      <Linha l="Status" v={STATUS_LABEL[ag.status]} />
      {bloqueio ? (
        <button
          onClick={onRemover}
          className="oc-btn oc-btn-danger oc-btn-block"
          style={{ marginTop: 18, padding: 13 }}
        >
          Remover bloqueio
        </button>
      ) : null}
    </Sheet>
  );
}

function Linha({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ flex: 1, fontSize: 12.5, color: c.ink3 }}>{l}</span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: c.inkTitle }}>{v}</span>
    </div>
  );
}

// ---- folha inferior genérica (dentro da moldura do celular) ----
function Sheet({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 20, background: "var(--oc-overlay)", display: "flex", alignItems: "flex-end" }} className="oc-fade">
      <div onClick={(e) => e.stopPropagation()} className="oc-toast" style={{ width: "100%", background: c.surface, borderRadius: "26px 26px 0 0", padding: "10px 20px", paddingBottom: "max(24px, env(safe-area-inset-bottom))", boxShadow: "var(--oc-shadow-modal)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: c.borderInput, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <span style={{ flex: 1, fontSize: 20, fontWeight: 500, letterSpacing: "-0.03em", color: c.inkTitle }}>{titulo}</span>
          <button onClick={onClose} aria-label="Fechar" className="oc-icon-btn">
            <Icon name="fechar" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


const card: CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
};
