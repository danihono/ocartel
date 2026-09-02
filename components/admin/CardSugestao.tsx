"use client";

// O card de um agendamento SUGERIDO pelo atendente automático.
//
// Um componente só, usado na conversa (tela de WhatsApp) e na agenda do dia. Duas cópias
// divergiriam — e é justamente aqui que a diferença apareceria no pior lugar: a confirmação
// de um horário, feita de dois jeitos diferentes conforme a tela.
//
// Visual tracejado de propósito: enquanto ninguém confirmar, isto NÃO é um agendamento.
// Não ocupa o horário e não impede outra pessoa de pegar o mesmo.

import { useState } from "react";
import { c, font } from "@/lib/theme";
import { useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { isoParaLabel } from "@/lib/date";
import { acaoConfirmarSugestao, acaoDescartarSugestao } from "@/app/(admin)/whatsapp/actions-sugestao";
import type { Sugestao } from "@/lib/types";

export function CardSugestao({ sugestao, compacto = false }: { sugestao: Sugestao; compacto?: boolean }) {
  const { user, tenantId } = useAuth();
  const toast = useToast();
  const [ocupado, setOcupado] = useState<"" | "confirmar" | "descartar">("");

  async function confirmar() {
    if (!user || !tenantId || ocupado) return;
    setOcupado("confirmar");
    try {
      const r = await acaoConfirmarSugestao(await user.getIdToken(), tenantId, sugestao.id);
      // O horário pode ter sido tomado entre a sugestão e o clique: a transação do
      // agendamento recusa, e a sugestão continua pendente para a barbearia decidir.
      toast(r.ok ? "Agendamento confirmado." : (r.erro ?? "Não foi possível confirmar."), r.ok ? "success" : "error");
    } finally {
      setOcupado("");
    }
  }

  async function descartar() {
    if (!user || !tenantId || ocupado) return;
    setOcupado("descartar");
    try {
      const r = await acaoDescartarSugestao(await user.getIdToken(), tenantId, sugestao.id);
      if (!r.ok) toast(r.erro ?? "Não foi possível descartar.", "error");
    } finally {
      setOcupado("");
    }
  }

  return (
    <div
      style={{
        border: `1.5px dashed ${c.brass}`,
        background: c.brassTint,
        borderRadius: 12,
        padding: compacto ? "9px 11px" : "12px 14px",
        marginBottom: 8,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: c.brassDeep, fontWeight: 700, marginBottom: 5 }}>
        Sugerido pelo atendente · aguardando você
      </div>

      <div style={{ fontFamily: font.serif, fontSize: compacto ? 13.5 : 15, fontWeight: 600, color: c.inkTitle }}>
        {sugestao.clienteNome || "Cliente"}
      </div>
      <div style={{ fontSize: 12.5, color: c.ink2, marginTop: 2, lineHeight: 1.5 }}>
        {sugestao.servico} · {sugestao.barbeiro}
        <br />
        {isoParaLabel(sugestao.date)} às <b>{sugestao.inicio}</b> ({sugestao.duracaoMin} min)
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={() => void confirmar()}
          disabled={ocupado !== ""}
          style={{
            border: "none",
            cursor: ocupado ? "default" : "pointer",
            background: c.primaryBtnBg,
            color: c.primaryBtnText,
            borderRadius: 9,
            padding: "7px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            opacity: ocupado ? 0.6 : 1,
          }}
        >
          {ocupado === "confirmar" ? "Confirmando…" : "Confirmar"}
        </button>
        <button
          onClick={() => void descartar()}
          disabled={ocupado !== ""}
          style={{
            border: `1px solid ${c.borderInput}`,
            cursor: ocupado ? "default" : "pointer",
            background: c.surface,
            color: c.ink2,
            borderRadius: 9,
            padding: "7px 14px",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          {ocupado === "descartar" ? "…" : "Descartar"}
        </button>
      </div>
    </div>
  );
}
