"use client";

// WhatsApp & IA — conecta o número da barbearia (QR, igual ao WhatsApp Web) e
// exibe a fila de propostas de agendamento montadas pela IA. Nada entra na
// agenda sem a dona aprovar aqui (o passo "só com autorização").
//
// A conexão viva com o WhatsApp roda num WORKER separado (sempre-ligado); esta
// tela só troca sinais com ele pelo Firestore: lê status/QR de
// integrations/whatsapp e escreve o comando connect/disconnect.

import { useState } from "react";
import { c } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { isoParaLabel, mesAnoCurto, hojeLocalISO } from "@/lib/date";
import { barbeiroNomePorId, duracaoServico } from "@/lib/selectors";
import { horarioLivre, ocupaHorario } from "@/lib/agenda";
import type { WaProposta, WhatsAppStatus } from "@/lib/types";

const STATUS_LABEL: Record<WhatsAppStatus, { texto: string; cor: string; bg: string }> = {
  desconectado: { texto: "Desconectado", cor: c.ink3, bg: c.surfaceAlt },
  connecting: { texto: "Conectando…", cor: c.amberText, bg: c.amberBg },
  qr: { texto: "Escaneie o QR", cor: c.amberText, bg: c.amberBg },
  connected: { texto: "Conectado", cor: c.greenText, bg: c.greenBg },
  loggedOut: { texto: "Sessão encerrada — reconecte", cor: c.redText, bg: c.redBg },
};

export default function WhatsAppPage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 18, maxWidth: 1400, alignItems: "start" }}>
      <ConexaoCard />
      <PropostasCard />
    </div>
  );
}

function ConexaoCard() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);

  const wa = state.whatsapp;
  const status: WhatsAppStatus = wa?.status ?? "desconectado";
  const info = STATUS_LABEL[status];
  const conectado = status === "connected";

  async function comando(action: "connect" | "disconnect") {
    setEnviando(true);
    try {
      await actions.whatsapp.enviarComando(action);
      toast(action === "connect" ? "Solicitando conexão… aguarde o QR." : "Desconectando o WhatsApp.");
    } catch {
      toast("Não foi possível enviar o comando ao WhatsApp.", "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardTitle sub="Conecte o número da barbearia como no WhatsApp Web">Conexão do WhatsApp</CardTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: info.cor }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: info.cor, background: info.bg, padding: "4px 10px", borderRadius: 999 }}>
          {info.texto}
        </span>
        {conectado && wa?.phone ? <span style={{ fontSize: 12.5, color: c.ink3 }}>· {wa.phone}</span> : null}
      </div>

      {/* QR quando disponível */}
      {status === "qr" && wa?.qr ? (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={wa.qr}
            alt="QR do WhatsApp"
            width={220}
            height={220}
            style={{ borderRadius: 12, border: `1px solid ${c.border}`, background: "#fff", padding: 8 }}
          />
          <div style={{ fontSize: 12.5, color: c.ink3, textAlign: "center", maxWidth: 260 }}>
            No celular: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> e aponte para este código.
          </div>
        </div>
      ) : null}

      {status === "connecting" ? (
        <div style={{ marginTop: 16, fontSize: 13, color: c.ink3 }}>Abrindo a sessão com o WhatsApp…</div>
      ) : null}

      {conectado ? (
        <div style={{ marginTop: 16, fontSize: 13, color: c.ink2, lineHeight: 1.5 }}>
          O número está conectado. A IA responde as mensagens, sugere horários livres e monta propostas de
          agendamento — que aparecem ao lado para você aprovar.
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        {conectado ? (
          <Button variant="ghost" onClick={() => comando("disconnect")} loading={enviando} style={{ color: c.red }}>
            Desconectar
          </Button>
        ) : (
          <Button onClick={() => comando("connect")} loading={enviando}>
            {status === "qr" ? "Gerar novo QR" : "Conectar WhatsApp"}
          </Button>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.borderSoft}`, fontSize: 11.5, color: c.ink4, lineHeight: 1.5 }}>
        A conexão é feita por um serviço próprio (não é a API oficial da Meta). Use com um número dedicado da
        barbearia e volume humano de mensagens.
      </div>
    </Card>
  );
}

function PropostasCard() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [processando, setProcessando] = useState<string | null>(null);

  const propostas = state.propostas;

  async function aprovar(p: WaProposta) {
    setProcessando(p.id);
    try {
      const duracaoMin = p.duracaoMin ?? (p.servicoNome ? duracaoServico(state, p.servicoNome) : 30);

      // Vincula ao cadastro por telefone; cria o cliente se ainda não existir.
      const telDigits = (p.clienteTelefone ?? "").replace(/\D/g, "");
      let clienteId = telDigits
        ? state.clientes.find((cl) => (cl.telefoneNorm ?? cl.telefone.replace(/\D/g, "")) === telDigits)?.id
        : state.clientes.find((cl) => cl.nome === p.clienteNome)?.id;

      if (!clienteId && telDigits.length >= 10) {
        const ref = await actions.clientes.add({
          id: makeId("cli"),
          nome: p.clienteNome,
          telefone: p.clienteTelefone ?? "",
          telefoneNorm: telDigits,
          email: "",
          plano: "Avulso",
          planId: "",
          tag: "",
          ultimoAtendimento: "—",
          totalGasto: 0,
          atendimentos: 0,
          desde: mesAnoCurto(hojeLocalISO()),
          iniciais: iniciaisDe(p.clienteNome),
        });
        clienteId = ref.id;
      }

      // Aviso de sobreposição (não bloqueia — mesmo comportamento do resto da agenda).
      const ocupados = state.agendamentos
        .filter((a) => a.barbeiroId === p.barbeiroId && a.date === p.date && ocupaHorario(a.status))
        .map((a) => ({ inicio: a.inicio, duracaoMin: a.duracaoMin }));
      const haConflito = !horarioLivre(ocupados, p.inicio, duracaoMin);

      const ref = await actions.agendamentos.add({
        id: makeId("ag"),
        date: p.date,
        barbeiroId: p.barbeiroId,
        clienteNome: p.clienteNome,
        clienteId,
        servico: p.servicoNome ?? "",
        servicoId: p.servicoId,
        inicio: p.inicio,
        duracaoMin,
        status: "agendado",
        origem: "booking",
        ...(p.observacoes ? { observacoes: p.observacoes } : {}),
      });

      await actions.propostas.aprovar(p.id, ref.id);
      toast(
        haConflito ? "Agendado — atenção: há sobreposição de horário." : "Aprovado! A IA vai confirmar no WhatsApp.",
        haConflito ? "error" : "success",
      );
    } catch {
      toast("Não foi possível aprovar a proposta.", "error");
    } finally {
      setProcessando(null);
    }
  }

  async function recusar(p: WaProposta) {
    setProcessando(p.id);
    try {
      await actions.propostas.recusar(p.id);
      toast("Proposta recusada.");
    } catch {
      toast("Não foi possível recusar.", "error");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <Card>
      <CardTitle sub="Sugestões da IA aguardando sua autorização">Propostas de agendamento</CardTitle>

      {propostas.length === 0 ? (
        <div style={{ marginTop: 20, padding: "28px 16px", textAlign: "center", color: c.ink3, fontSize: 13.5, background: c.surfaceAlt, borderRadius: 12 }}>
          Nenhuma proposta pendente. Quando um cliente combinar um horário no WhatsApp, ele aparece aqui para você
          aprovar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {propostas.map((p) => {
            const busy = processando === p.id;
            const barbeiro = p.barbeiroNome ?? barbeiroNomePorId(state, p.barbeiroId);
            return (
              <div key={p.id} style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: c.inkTitle }}>{p.clienteNome}</div>
                  <div style={{ fontSize: 12.5, color: c.ink3 }}>{p.clienteTelefone}</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 13.5, color: c.ink2, lineHeight: 1.5 }}>
                  <b>{p.servicoNome ?? "Serviço"}</b> com {barbeiro}
                  <br />
                  {isoParaLabel(p.date)} às <b>{p.inicio}</b>
                  {p.duracaoMin ? <span style={{ color: c.ink3 }}> · {p.duracaoMin} min</span> : null}
                </div>
                {p.observacoes ? (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: c.ink3, fontStyle: "italic" }}>“{p.observacoes}”</div>
                ) : null}
                <div style={{ marginTop: 12, display: "flex", gap: 9 }}>
                  <Button onClick={() => aprovar(p)} loading={busy} style={{ padding: "9px 14px" }}>
                    Aprovar
                  </Button>
                  <Button variant="ghost" onClick={() => recusar(p)} disabled={busy} style={{ padding: "9px 14px", color: c.red }}>
                    Recusar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
