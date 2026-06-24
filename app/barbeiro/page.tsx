"use client";

// Tela do barbeiro — mobile-only, na mesma moldura de celular da tela do cliente
// (/book). Mini-painel rápido para o barbeiro ver a agenda do dia, os clientes e
// um resumo, além de BLOQUEAR horários (o bloqueio impede agendamentos pela tela
// pública — a guarda fica na server action do booking).
//
// Acesso: usuário com papel `barbeiro` cai aqui no login; o admin abre em modo
// preview pelo link "Tela do barbeiro ↗" (com ?b=<barbeiroId>).

import { Suspense, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { c, font } from "@/lib/theme";
import AuthGuard from "@/components/auth/AuthGuard";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { Avatar } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useStore, makeId } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { blocoMeta, tagMeta } from "@/lib/status";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import { slug as slugify, selectClientesFiltrados, precoServico, formatBRL, fmtDur } from "@/lib/selectors";
import { HOJE_ISO, addDias, isoParaLabelLongo, comparaHora } from "@/lib/date";
import type { Agendamento } from "@/lib/types";

type Tab = "agenda" | "clientes" | "resumo";

const STATUS_LABEL: Record<Agendamento["status"], string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  atendimento: "Em atendimento",
  concluido: "Concluído",
  noshow: "No-show",
  cancelado: "Cancelado",
  bloqueio: "Bloqueio",
};

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
  const { profile } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const bParam = searchParams.get("b");

  const [tab, setTab] = useState<Tab>("agenda");
  const [date, setDate] = useState(HOJE_ISO);
  const [busca, setBusca] = useState("");
  const [bloquearOpen, setBloquearOpen] = useState(false);
  const [detalhe, setDetalhe] = useState<Agendamento | null>(null);

  // Qual barbeiro é o "dono" desta tela: ?b= (preview do admin) → vínculo do
  // perfil → casamento por nome → 1º barbeiro (fallback).
  const barbId = useMemo(() => {
    if (bParam && state.barbeiros.some((b) => b.id === bParam)) return bParam;
    if (profile?.barbeiroId && state.barbeiros.some((b) => b.id === profile.barbeiroId)) return profile.barbeiroId;
    const porNome = profile?.nome ? state.barbeiros.find((b) => slugify(b.nome) === slugify(profile.nome)) : undefined;
    return porNome?.id ?? state.barbeiros[0]?.id ?? null;
  }, [bParam, profile?.barbeiroId, profile?.nome, state.barbeiros]);

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
      right={barbeiro ? <Avatar initials={barbeiro.iniciais} size={36} bg={c.leather} color={c.darkText} /> : null}
    >
      {/* corpo rolável */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 18px" }}>
        {carregando ? (
          <Vazio texto="Carregando…" />
        ) : tab === "agenda" ? (
          <>
            {/* navegação de dia */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <button style={btnNav} onClick={() => setDate((d) => addDias(d, -1))} aria-label="Dia anterior">‹</button>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: font.serif, fontSize: 15, fontWeight: 700, color: c.inkTitle }}>{isoParaLabelLongo(date)}</div>
                {date !== HOJE_ISO ? (
                  <button onClick={() => setDate(HOJE_ISO)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: c.brassDeep }}>
                    Voltar para hoje
                  </button>
                ) : (
                  <div style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>{atendimentos.length} atendimento(s)</div>
                )}
              </div>
              <button style={btnNav} onClick={() => setDate((d) => addDias(d, 1))} aria-label="Próximo dia">›</button>
            </div>

            <button
              onClick={() => setBloquearOpen(true)}
              disabled={!barbId}
              style={{ width: "100%", border: `1px dashed ${c.borderInput}`, background: c.surface, cursor: barbId ? "pointer" : "not-allowed", color: c.brassDeep, padding: "11px", borderRadius: 12, fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}
            >
              + Bloquear horário
            </button>

            {doDia.length === 0 ? (
              <Vazio texto="Nenhum horário para este dia." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
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
              style={{ ...fieldInput, marginBottom: 14 }}
            />
            {clientes.length === 0 ? (
              <Vazio texto="Nenhum cliente encontrado." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientes.map((cl) => {
                  const tm = tagMeta(cl.tag);
                  return (
                    <div key={cl.id} style={{ ...card, display: "flex", alignItems: "center", gap: 11, padding: "11px 13px" }}>
                      <Avatar initials={cl.iniciais} size={36} bg={c.brassSoft} color={c.brassDeep} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
                        <div style={{ fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{cl.telefone}</div>
                      </div>
                      {tm ? <span style={{ fontSize: 10.5, fontWeight: 700, color: tm.fg, background: tm.bg, borderRadius: 999, padding: "3px 9px" }}>{cl.tag}</span> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <KpiCard label="Atendimentos" valor={String(atendimentos.length)} />
              <KpiCard label="Previsto" valor={formatBRL(faturamentoDia)} />
            </div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.ink3, fontWeight: 700, margin: "4px 0 10px" }}>
              Próximos hoje
            </div>
            {atendimentos.length === 0 ? (
              <Vazio texto="Sem atendimentos hoje." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {atendimentos.slice(0, 6).map((a) => (
                  <AgendaRow key={a.id} ag={a} onClick={() => setDetalhe(a)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* rodapé de abas */}
      <div style={{ flex: "none", display: "flex", borderTop: `1px solid ${c.border}`, background: c.surface }}>
        {([
          ["agenda", "Agenda"],
          ["clientes", "Clientes"],
          ["resumo", "Resumo"],
        ] as const).map(([value, label]) => {
          const on = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              style={{ flex: 1, border: "none", background: "transparent", cursor: "pointer", padding: "13px 0 18px", fontSize: 12.5, fontWeight: on ? 800 : 600, color: on ? c.brassDeep : c.ink3 }}
            >
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
      style={{ display: "flex", alignItems: "stretch", gap: 11, width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: c.surface, borderRadius: 12, padding: 0, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,27,25,.05)" }}
    >
      <span style={{ width: 4, background: m.bar, flex: "none" }} />
      <span style={{ flex: 1, minWidth: 0, padding: "11px 12px 11px 4px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: font.serif, fontSize: 15, fontWeight: 700, color: c.inkTitle }}>{ag.inicio}</span>
          <span style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>· {fmtDur(ag.duracaoMin)}</span>
        </span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: c.ink, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {ag.status === "bloqueio" ? `Bloqueado · ${ag.clienteNome}` : ag.clienteNome}
        </span>
        {ag.status !== "bloqueio" ? <span style={{ display: "block", fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{ag.servico}</span> : null}
      </span>
    </button>
  );
}

// ---- cartão KPI ----
function KpiCard({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ ...card, flex: 1, padding: "13px 15px" }}>
      <div style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: font.serif, fontSize: 22, fontWeight: 700, color: c.inkTitle, marginTop: 5 }}>{valor}</div>
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
          <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} style={fieldInput} />
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
        style={{ width: "100%", marginTop: 16, border: "none", cursor: "pointer", background: c.primaryBtnBg, color: c.primaryBtnText, padding: 14, borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}
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
          style={{ width: "100%", marginTop: 16, border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: c.redText, padding: 13, borderRadius: 12, fontSize: 14, fontWeight: 700 }}
        >
          Remover bloqueio
        </button>
      ) : null}
    </Sheet>
  );
}

function Linha({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ flex: 1, fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>{l}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: c.inkTitle }}>{v}</span>
    </div>
  );
}

// ---- folha inferior genérica (dentro da moldura do celular) ----
function Sheet({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(7,23,20,.45)", display: "flex", alignItems: "flex-end" }} className="oc-fade">
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: c.surface, borderRadius: "20px 20px 0 0", padding: "16px 18px 24px" }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: c.borderInput, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <span style={{ flex: 1, fontFamily: font.serif, fontSize: 18, fontWeight: 700, color: c.inkTitle }}>{titulo}</span>
          <button onClick={onClose} aria-label="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: c.ink3, fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const btnNav: CSSProperties = {
  width: 34,
  height: 34,
  border: `1px solid ${c.borderInput}`,
  background: c.surface,
  borderRadius: 10,
  cursor: "pointer",
  color: c.ink2,
  fontSize: 17,
  flex: "none",
};

const card: CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
};
