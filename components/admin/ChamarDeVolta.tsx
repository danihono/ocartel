"use client";

import { c } from "@/lib/theme";
import { Icon } from "@/components/ui/Icon";
import { useStore } from "@/lib/store";
import { linkWhatsApp } from "@/lib/confirmacao";
import { telefoneWhatsApp } from "@/lib/clientes-import";
import {
  aniversarioCurto,
  comHorarioMarcado,
  diasAteAniversario,
  diasSemVir,
  estaSumido,
  mensagemAniversario,
  mensagemReativacao,
  DIAS_ANIVERSARIO,
} from "@/lib/reativacao";
import type { Cliente } from "@/lib/types";

/** Link da página de agendamento desta barbearia, para ir junto na mensagem. */
export function useLinkAgendamento(): string | undefined {
  const { state } = useStore();
  const slug = state.tenants[0]?.slug;
  if (!slug || typeof window === "undefined") return undefined;
  return `${window.location.origin}/book/${slug}`;
}

/** O motivo para chamar este cliente agora, com a mensagem pronta — ou `null`. */
export function motivoParaChamar(
  cliente: Cliente,
  hoje: string,
  marcados: ReturnType<typeof comHorarioMarcado>,
  barbearia: string,
  link?: string,
): { tipo: "aniversario" | "sumido"; texto: string; mensagem: string } | null {
  const ate = diasAteAniversario(cliente.nascimento, hoje);
  if (ate !== null && ate <= DIAS_ANIVERSARIO) {
    return {
      tipo: "aniversario",
      texto: ate === 0 ? "Faz aniversário hoje" : ate === 1 ? "Faz aniversário amanhã" : `Faz aniversário em ${ate} dias (${aniversarioCurto(cliente.nascimento)})`,
      mensagem: mensagemAniversario({ cliente: cliente.nome, barbearia, hoje: ate === 0, link }),
    };
  }
  if (estaSumido(cliente, hoje, marcados)) {
    return {
      tipo: "sumido",
      texto: `Não volta há ${diasSemVir(cliente, hoje)} dias`,
      mensagem: mensagemReativacao({ cliente: cliente.nome, barbearia, link }),
    };
  }
  return null;
}

/** Botão redondo do WhatsApp com a mensagem pronta (ou desativado sem telefone). */
export function BotaoWhatsApp({ telefone, mensagem, rotulo }: { telefone: string; mensagem: string; rotulo?: string }) {
  const tel = telefoneWhatsApp(telefone ?? "");
  if (!tel) {
    return (
      <span className="oc-chip" style={{ background: c.surfaceAlt, color: c.ink3 }} title="Sem telefone utilizável no cadastro">
        sem telefone
      </span>
    );
  }
  return (
    <a
      href={linkWhatsApp(tel, mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      className={rotulo ? "oc-btn oc-btn-primary oc-btn-sm" : "oc-icon-btn"}
      title="Mandar mensagem pronta no WhatsApp"
      aria-label="Mandar mensagem no WhatsApp"
      style={rotulo ? { flex: "none" } : { color: c.accent }}
    >
      <Icon name="whatsapp" size={rotulo ? 15 : 16} />
      {rotulo}
    </a>
  );
}

/** Faixa no perfil do cliente quando há um bom motivo para chamá-lo agora. */
export function ChamarDeVolta({ cliente, hoje }: { cliente: Cliente; hoje: string }) {
  const { state } = useStore();
  const link = useLinkAgendamento();
  const m = motivoParaChamar(cliente, hoje, comHorarioMarcado(state.agendamentos, hoje), state.config.nome, link);
  if (!m) return null;
  const aniv = m.tipo === "aniversario";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 18,
        padding: "12px 14px",
        borderRadius: 16,
        background: aniv ? c.accentTint : c.amberBg,
        border: `1px solid ${aniv ? c.accentLine : "transparent"}`,
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", flex: "none", background: aniv ? c.forest : c.surface, color: aniv ? c.neon : c.amber }}>
        <Icon name={aniv ? "estrela" : "relogio"} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: aniv ? c.ink : c.amberText }}>{m.texto}</div>
        <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>{aniv ? "Mande os parabéns com um convite para marcar." : "Um convite simples costuma trazer de volta."}</div>
      </div>
      <BotaoWhatsApp telefone={cliente.telefone} mensagem={m.mensagem} rotulo="Mandar mensagem" />
    </div>
  );
}
