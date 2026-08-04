"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { FinalizarAtendimentoModal } from "./FinalizarAtendimentoModal";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { barbeiroNomePorId, fmtDur, formatBRL, precoServico, tagDerivadaCliente } from "@/lib/selectors";
import { isoParaLabelLongo } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import { c, font } from "@/lib/theme";
import { blocoMeta, STATUS_LABEL, tagMeta } from "@/lib/status";
import { telefoneWhatsApp } from "@/lib/clientes-import";
import { linkConfirmacao, linkWhatsApp, mensagemWhatsApp, montarCodigo, novoToken } from "@/lib/confirmacao";
import { useAuth } from "@/lib/firebase/auth";
import type { AgendamentoStatus } from "@/lib/types";

/** Painel lateral de detalhe do agendamento (substitui o modal central na Agenda). */
export function AgendamentoPanel({ open, onClose, agendamentoId }: { open: boolean; onClose: () => void; agendamentoId: string | null }) {
  const { state, actions } = useStore();
  const { tenantId } = useAuth();
  const toast = useToast();
  const hoje = useHoje();

  const ag = state.agendamentos.find((a) => a.id === agendamentoId) ?? null;

  // Observações: rascunho local, semeado a cada abertura.
  const [obs, setObs] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [excluindoSerie, setExcluindoSerie] = useState(false); // passo de confirmação
  const [removendo, setRemovendo] = useState(false);
  useEffect(() => {
    setExcluindoSerie(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamentoId]);
  useEffect(() => {
    if (open && ag) setObs(ag.observacoes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agendamentoId]);

  // Agendamentos criados antes desta funcionalidade não têm o segredo do link.
  // Gera um na primeira vez que o painel abre — os novos já nascem com ele
  // (lib/firebase/repos.ts e lib/booking-core.ts).
  useEffect(() => {
    if (!open || !ag || ag.confirmToken || ag.status === "bloqueio") return;
    void actions.agendamentos.update(ag.id, { confirmToken: novoToken() }).catch(() => {
      /* sem token, o botão do WhatsApp simplesmente não aparece */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agendamentoId, ag?.confirmToken]);

  if (!open || !ag) return null;

  const isBloqueio = ag.status === "bloqueio";
  const meta = blocoMeta[ag.status];
  // Cliente do cadastro (telefone + selo), por id quando houver, senão pelo nome.
  const cliente = state.clientes.find((cl) => (ag.clienteId && cl.id === ag.clienteId) || cl.nome === ag.clienteNome) ?? null;
  const seloTag = cliente ? tagDerivadaCliente(state, cliente, hoje) : "";
  const selo = tagMeta(seloTag);
  const preco = precoServico(state, ag.servico);
  const obsAlterada = obs.trim() !== (ag.observacoes ?? "").trim();
  // Estado ATIVO = ainda pode mudar (concluir/não compareceu/cancelar).
  const ehAtivo = ag.status === "agendado" || ag.status === "confirmado" || ag.status === "atendimento";
  // "Não compareceu" e "Cancelado" NÃO são becos sem saída: um clique errado
  // tem volta. "Concluído" continua terminal — reverter mexeria na transação e
  // no totalGasto já gravados por repo.agendamentos.concluir().
  const ehRevertivel = ag.status === "noshow" || ag.status === "cancelado";

  // Link de clique-para-conversar já apontando para o número cadastrado, com a
  // mensagem e o link de confirmação prontos. É um <a> com href calculado no
  // render — abrir em `window.open` depois de um `await` cairia no bloqueador.
  const zap = telefoneWhatsApp(cliente?.telefone ?? "");
  const podeMandarZap =
    !isBloqueio && !!zap && !!ag.confirmToken && !!tenantId && ag.status !== "cancelado" && ag.status !== "concluido";
  const urlWhatsApp = podeMandarZap
    ? linkWhatsApp(
        zap,
        mensagemWhatsApp({
          cliente: ag.clienteNome,
          barbearia: state.config.nome,
          servico: ag.servico,
          profissional: barbeiroNomePorId(state, ag.barbeiroId),
          dateISO: ag.date,
          hora: ag.inicio,
          link: linkConfirmacao(
            typeof window !== "undefined" ? window.location.origin : "",
            montarCodigo({ tenantId: tenantId!, agendamentoId: ag.id, token: ag.confirmToken! }),
          ),
          jaConfirmado: ag.status === "confirmado",
        }),
      )
    : null;

  /** Muda o status oferecendo "Desfazer" no toast (volta ao estado anterior). */
  async function setStatus(status: AgendamentoStatus, msg: string, opts?: { manterAberto?: boolean }) {
    if (!ag) return;
    const { id, status: anterior } = ag;
    try {
      await actions.agendamentos.setStatus(id, status);
      toast(msg, "success", {
        label: "Desfazer",
        onClick: () => {
          void actions.agendamentos
            .setStatus(id, anterior)
            .then(() => toast(`Desfeito — voltou para "${STATUS_LABEL[anterior].toLowerCase()}".`))
            .catch(() => toast("Não foi possível desfazer.", "error"));
        },
      });
      if (!opts?.manterAberto) onClose();
    } catch {
      toast("Não foi possível atualizar o agendamento.", "error");
    }
  }

  async function salvarObs() {
    if (!ag || !obsAlterada) return;
    setSalvandoObs(true);
    try {
      await actions.agendamentos.update(ag.id, { observacoes: obs.trim() });
      toast("Observações salvas.");
    } catch {
      toast("Não foi possível salvar as observações.", "error");
    } finally {
      setSalvandoObs(false);
    }
  }

  async function excluir(msg: string) {
    if (!ag) return;
    try {
      await actions.agendamentos.remove(ag.id);
      toast(msg);
      onClose();
    } catch {
      toast("Não foi possível remover.", "error");
    }
  }

  async function excluirSerie() {
    if (!ag?.recorrenciaId) return;
    setRemovendo(true);
    try {
      const r = await actions.agendamentos.removeSerie(ag.recorrenciaId);
      toast(r.mantidos ? `Série excluída (${r.excluidos}); ${r.mantidos} concluído(s) mantido(s).` : `Série excluída (${r.excluidos}).`);
      onClose();
    } catch {
      toast("Não foi possível excluir a série.", "error");
    } finally {
      setRemovendo(false);
      setExcluindoSerie(false);
    }
  }

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, width: 104, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600 }}>{valor}</span>
    </div>
  );

  return (
    <>
    <div
      onClick={onClose}
      className="oc-fade"
      style={{ position: "fixed", inset: 0, background: "rgba(8,19,15,.5)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="oc-slide-right"
        style={{
          width: "100%",
          maxWidth: 420,
          height: "100%",
          background: c.surface,
          borderLeft: `1px solid ${c.border}`,
          boxShadow: "-12px 0 36px rgba(8,19,15,.16)",
          padding: "22px 24px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle, flex: 1 }}>
            {isBloqueio ? "Bloqueio" : "Agendamento"}
          </span>
          <button onClick={onClose} aria-label="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: c.ink3, fontSize: 18, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.bar }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: c.inkTitle }}>{STATUS_LABEL[ag.status]}</span>
          {/* Quem respondeu sozinho pelo link vale mais que quem a barbearia marcou. */}
          {ag.confirmadoPeloCliente ? (
            <span
              title={ag.respondidoEm ? `Resposta do cliente em ${ag.respondidoEm.slice(0, 10)}` : undefined}
              style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: c.greenBg, color: c.greenText }}
            >
              ✓ pelo cliente
            </span>
          ) : null}
        </div>

        {/* Cliente */}
        {!isBloqueio ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: c.inkTitle }}>{ag.clienteNome}</span>
            {selo ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: selo.bg, color: selo.fg }}>{seloTag}</span>
            ) : null}
          </div>
        ) : null}
        {!isBloqueio && cliente?.telefone ? (
          <a href={`tel:${cliente.telefone}`} style={{ fontSize: 13, color: c.brassDeep, fontWeight: 600, textDecoration: "none" }}>
            {cliente.telefone}
          </a>
        ) : null}

        {/* Abre a conversa no número cadastrado, com a mensagem e o link prontos. */}
        {urlWhatsApp ? (
          <a
            href={urlWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="oc-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 12,
              background: "#25D366", // verde do WhatsApp — é o que o olho procura
              color: "#0B3D26",
              borderRadius: 11,
              padding: "11px 14px",
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <span aria-hidden>💬</span>
            {ag.status === "confirmado" ? "Lembrar pelo WhatsApp" : "Pedir confirmação pelo WhatsApp"}
          </a>
        ) : null}

        {/* Detalhes */}
        <div style={{ marginTop: 14 }}>
          {isBloqueio ? linha("Motivo", ag.clienteNome || "Bloqueado") : linha("Serviço", `${ag.servico}${preco ? ` · ${formatBRL(preco)}` : ""}`)}
          {linha("Profissional", barbeiroNomePorId(state, ag.barbeiroId))}
          {linha("Data", isoParaLabelLongo(ag.date))}
          {linha("Horário", `${ag.inicio} · ${fmtDur(ag.duracaoMin)}`)}
        </div>

        {/* Observações */}
        {!isBloqueio ? (
          <div style={{ marginTop: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: c.inkLabel, display: "block", marginBottom: 6 }}>Observações</span>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Preferência de corte, alergia, lembrete…" />
            {obsAlterada ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Button variant="ghost" onClick={salvarObs} disabled={salvandoObs}>
                  {salvandoObs ? "Salvando…" : "Salvar observações"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ flex: 1 }} />

        {/* Ações */}
        {isBloqueio ? (
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <div style={{ flex: 1 }} />
            <Button onClick={() => excluir("Bloqueio removido.")} style={{ background: c.red }}>Excluir bloqueio</Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
            {/* Transições válidas: a partir de um estado ATIVO (agendado/confirmado/atendimento).
                concluído/no-show/cancelado são terminais — sem ações. */}
            {ag.status === "agendado" ? (
              <Button variant="ghost" onClick={() => setStatus("confirmado", "Agendamento confirmado.")}>Confirmar</Button>
            ) : null}
            {ag.status === "agendado" || ag.status === "confirmado" ? (
              <Button variant="ghost" onClick={() => setStatus("atendimento", "Atendimento iniciado.")}>Iniciar</Button>
            ) : null}
            {ehAtivo ? <Button onClick={() => setFinalizando(true)}>Concluir</Button> : null}
            {ehAtivo ? (
              <Button variant="ghost" onClick={() => setStatus("noshow", `Marcado como "${STATUS_LABEL.noshow.toLowerCase()}".`)}>
                {STATUS_LABEL.noshow}
              </Button>
            ) : null}
            {ehAtivo ? (
              <Button variant="ghost" onClick={() => setStatus("cancelado", "Agendamento cancelado.")} style={{ color: c.red }}>Cancelar</Button>
            ) : null}
            {ehRevertivel ? (
              <>
                <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, flex: 1, minWidth: 140 }}>
                  Marcou sem querer?
                </span>
                <Button onClick={() => setStatus("agendado", "Revertido para agendado.", { manterAberto: true })}>
                  Reverter para agendado
                </Button>
              </>
            ) : null}
            {!ehAtivo && !ehRevertivel ? (
              <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>Agendamento {STATUS_LABEL[ag.status].toLowerCase()} — sem ações disponíveis.</span>
            ) : null}
          </div>
        )}

        {/* Série recorrente: excluir todos de uma vez (mantém os concluídos). */}
        {!isBloqueio && ag.recorrenciaId ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.borderSoft}` }}>
            {excluindoSerie ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: c.ink2, fontWeight: 600, flex: 1, minWidth: 150 }}>
                  Excluir toda a série? (concluídos são mantidos)
                </span>
                <Button variant="ghost" onClick={() => setExcluindoSerie(false)} disabled={removendo}>Cancelar</Button>
                <Button onClick={excluirSerie} loading={removendo} style={{ background: c.red }}>Confirmar exclusão</Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setExcluindoSerie(true)}
                style={{ border: "none", background: "transparent", color: c.red, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                Excluir série toda
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
    <FinalizarAtendimentoModal
      open={finalizando}
      agendamentoId={ag.id}
      onClose={() => setFinalizando(false)}
      onConcluido={() => {
        setFinalizando(false);
        onClose();
      }}
    />
    </>
  );
}
