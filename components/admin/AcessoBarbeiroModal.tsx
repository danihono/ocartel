"use client";

import { useState } from "react";
import { c } from "@/lib/theme";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/firebase/auth";
import { emailValido, mensagemAcessoBarbeiro, type AcessoBarbeiro } from "@/lib/equipe";
import { acaoDarAcessoBarbeiro, acaoRemoverAcessoBarbeiro } from "@/app/(admin)/configuracoes/equipe-actions";
import type { Barbeiro } from "@/lib/types";

/**
 * Dar, refazer ou tirar o login de um barbeiro.
 *
 * O link que volta serve para ele criar a própria senha. A tela mostra o link uma vez,
 * com atalhos para copiar e mandar pelo WhatsApp — quem administra nunca vê nem escolhe
 * a senha de ninguém.
 */
export function AcessoBarbeiroModal({
  open,
  onClose,
  barbeiro,
  acesso,
  barbearia,
}: {
  open: boolean;
  onClose: () => void;
  barbeiro: Barbeiro | null;
  acesso?: AcessoBarbeiro;
  barbearia: string;
}) {
  const { user, tenantId } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState<"dar" | "remover" | null>(null);
  const [gerado, setGerado] = useState<{ link: string; email: string } | null>(null);

  function fechar() {
    setEmail("");
    setGerado(null);
    onClose();
  }

  async function dar(emailAlvo: string) {
    if (!barbeiro || !user || !tenantId || ocupado) return;
    if (!emailValido(emailAlvo)) {
      toast("Informe um e-mail válido.", "error");
      return;
    }
    setOcupado("dar");
    try {
      const r = await acaoDarAcessoBarbeiro(await user.getIdToken(), tenantId, barbeiro.id, emailAlvo);
      if (!r.ok || !r.link) {
        toast(r.erro ?? "Não foi possível criar o acesso.", "error");
        return;
      }
      setGerado({ link: r.link, email: r.email ?? emailAlvo });
      toast(acesso ? "Link novo gerado." : "Acesso criado.");
    } catch {
      toast("Não foi possível criar o acesso.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function remover() {
    if (!barbeiro || !user || !tenantId || ocupado) return;
    if (!window.confirm(`Tirar o acesso de ${barbeiro.nome}? Ele sai do sistema na hora.`)) return;
    setOcupado("remover");
    try {
      const r = await acaoRemoverAcessoBarbeiro(await user.getIdToken(), tenantId, barbeiro.id);
      if (!r.ok) {
        toast(r.erro ?? "Não foi possível remover.", "error");
        return;
      }
      toast("Acesso removido.");
      fechar();
    } catch {
      toast("Não foi possível remover o acesso.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Copiado.");
    } catch {
      toast("Não deu para copiar — selecione o texto e copie à mão.", "error");
    }
  }

  if (!barbeiro) return null;
  const mensagem = gerado ? mensagemAcessoBarbeiro({ barbeiro: barbeiro.nome, barbearia, email: gerado.email, link: gerado.link }) : "";

  return (
    <Modal open={open} onClose={fechar} title={`Acesso de ${barbeiro.nome}`} width={480}>
      {gerado ? (
        <div className="oc-pop">
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.greenBg, borderRadius: 14, padding: "12px 14px" }}>
            <span style={{ color: c.green, flex: "none" }}>
              <Icon name="check" size={18} stroke={2.4} />
            </span>
            <span style={{ fontSize: 13, color: c.ink2, lineHeight: 1.5 }}>
              Mande o link para <b style={{ color: c.ink }}>{barbeiro.nome}</b>. Ele cria a senha e entra com <b style={{ color: c.ink }}>{gerado.email}</b>.
            </span>
          </div>
          <Field label="Link para criar a senha" style={{ marginTop: 16 }}>
            <TextInput readOnly value={gerado.link} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12.5 }} />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Button variant="ghost" icon="copiar" onClick={() => copiar(mensagem)}>
              Copiar mensagem
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="oc-btn oc-btn-primary"
              style={{ flex: 1 }}
            >
              <Icon name="whatsapp" size={16} /> Enviar pelo WhatsApp
            </a>
          </div>
          <p style={{ fontSize: 12, color: c.ink3, lineHeight: 1.5, margin: "14px 0 0" }}>
            O link vale por pouco tempo. Se vencer, é só gerar outro aqui.
          </p>
        </div>
      ) : acesso ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: c.field, border: `1px solid ${c.borderSoft}`, borderRadius: 14, padding: "14px 16px" }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: c.forest, color: c.neon, display: "grid", placeItems: "center", flex: "none" }}>
              <Icon name="escudo" size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: c.ink }}>Tem acesso</div>
              <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 2, wordBreak: "break-all" }}>{acesso.email}</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: c.ink2, lineHeight: 1.55, margin: "14px 0 0" }}>
            Ele entra com esse e-mail e vê só a própria agenda. Esqueceu a senha? Gere um link novo.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <Button variant="danger" icon="lixo" onClick={remover} loading={ocupado === "remover"}>
              Tirar acesso
            </Button>
            <span style={{ flex: 1 }} />
            <Button icon="link" onClick={() => dar(acesso.email)} loading={ocupado === "dar"}>
              Gerar link novo
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: c.ink2, lineHeight: 1.55, margin: "0 0 16px" }}>
            Com login próprio, {barbeiro.nome} vê a agenda do dia no celular, bloqueia horários e acompanha os atendimentos. Ele não vê
            financeiro, comissões dos colegas nem configurações.
          </p>
          <Field label="E-mail do barbeiro">
            <TextInput
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void dar(email);
              }}
              placeholder="barbeiro@email.com"
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <Button variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button icon="escudo" onClick={() => dar(email)} loading={ocupado === "dar"} disabled={!email.trim()}>
              Criar acesso
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
