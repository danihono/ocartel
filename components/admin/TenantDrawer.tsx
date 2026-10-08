"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldInputDark, fieldLabelDark } from "@/components/ui/Field";
import { acaoDefinirAdministrador } from "@/app/super-admin/actions";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { c, font } from "@/lib/theme";
import { tenantStatusMeta } from "@/lib/status";
import type { Tenant } from "@/lib/types";

export function TenantDrawer({ open, onClose, tenant }: { open: boolean; onClose: () => void; tenant: Tenant | null }) {
  const { actions } = useStore();
  const { user, enterTenant } = useAuth();
  const toast = useToast();
  const router = useRouter();

  // Formulário de "Definir administrador" — zera ao trocar de barbearia.
  const [adminNome, setAdminNome] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [definindo, setDefinindo] = useState(false);
  const [linkSenha, setLinkSenha] = useState("");
  useEffect(() => {
    setAdminNome("");
    setAdminEmail("");
    setLinkSenha("");
  }, [tenant?.id]);

  async function definirAdministrador() {
    if (!user || !tenant?.id || definindo) return;
    setDefinindo(true);
    try {
      const r = await acaoDefinirAdministrador(await user.getIdToken(), tenant.id, adminNome, adminEmail);
      if (!r.ok || !r.link) {
        toast(r.erro ?? "Não foi possível definir o administrador.", "error");
        return;
      }
      setLinkSenha(r.link);
      toast("Administrador definido. Envie o link para ele criar a senha.");
    } catch {
      toast("Não foi possível definir o administrador.", "error");
    } finally {
      setDefinindo(false);
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkSenha);
      toast("Link copiado.");
    } catch {
      toast("Não foi possível copiar. Selecione o link e copie à mão.", "error");
    }
  }

  function abrirPainel() {
    if (!tenant?.id) return;
    enterTenant(tenant.id);
    toast(`Entrando no painel de ${tenant.nome}…`);
    router.push("/dashboard");
  }

  if (!open || !tenant) return null;
  const sm = tenantStatusMeta[tenant.status];
  const ativo = tenant.status === "ativo";
  const pendente = tenant.status === "pendente";
  const pro = tenant.plano === "Pro";

  async function alternarStatus() {
    if (!tenant?.id) return;
    const novo = ativo ? "atrasado" : "ativo";
    try {
      await actions.tenants.update(tenant.id, { status: novo });
      toast(ativo ? "Barbearia suspensa." : "Barbearia reativada.");
    } catch {
      toast("Não foi possível atualizar a barbearia.", "error");
    }
  }

  /** Libera a barbearia. É o único caminho de `pendente` para dentro do sistema. */
  async function aprovar() {
    if (!tenant?.id) return;
    try {
      await actions.tenants.update(tenant.id, { status: "ativo" });
      toast(`${tenant.nome} aprovada. O painel dela libera na hora.`);
    } catch {
      toast("Não foi possível aprovar.", "error");
    }
  }

  async function recusar() {
    if (!tenant?.id) return;
    try {
      await actions.tenants.update(tenant.id, { status: "atrasado" });
      toast("Cadastro recusado. A barbearia segue sem acesso.");
    } catch {
      toast("Não foi possível recusar.", "error");
    }
  }

  async function alternarPlano() {
    if (!tenant?.id) return;
    const novoPlano = pro ? "Básico" : "Pro";
    const novoMrr = pro ? "R$ 129" : "R$ 249";
    try {
      await actions.tenants.update(tenant.id, { plano: novoPlano, mrr: tenant.status === "trial" ? "—" : novoMrr });
      toast(`Plano alterado para ${novoPlano}.`);
    } catch {
      toast("Não foi possível atualizar a barbearia.", "error");
    }
  }

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.darkLine}` }}>
      <span style={{ fontSize: 12.5, color: c.darkMuted, fontWeight: 600, width: 130, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, color: c.darkText, fontWeight: 600 }}>{valor}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={tenant.nome} dark width={460}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: c.espressoLine, color: c.brass, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontSize: 13, fontWeight: 700 }}>
          {tenant.monograma}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: c.darkMuted }}>{tenant.cidade}</div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
      </div>

      {linha("Plano", tenant.plano)}
      {linha("MRR", tenant.mrr)}
      {linha("Agendamentos/mês", tenant.agendamentosMes)}

      <button
        onClick={abrirPainel}
        style={{ width: "100%", marginTop: 20, border: "none", cursor: "pointer", background: c.brass, color: c.espressoDeep, padding: 13, borderRadius: 11, fontSize: 14, fontWeight: 700 }}
      >
        Abrir painel da barbearia →
      </button>
      <div style={{ fontSize: 11.5, color: c.darkMuted, marginTop: 8, textAlign: "center" }}>
        Você entra como super admin e vê todas as telas dela.
      </div>

      {/* Barbearia criada pelo console: ninguém a administra até você definir. */}
      {linkSenha ? (
        <div style={{ marginTop: 20, padding: "14px 16px", border: `1px solid ${c.darkLine}`, borderRadius: 11 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.darkText }}>Administrador definido</div>
          <div style={{ fontSize: 12, color: c.darkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Envie este link para ele criar a senha. Depois é só entrar em /login com o e-mail.
          </div>
          <input readOnly value={linkSenha} onFocus={(e) => e.currentTarget.select()} style={{ ...fieldInputDark, marginTop: 10, fontSize: 12 }} />
          <Button onClick={copiarLink} style={{ marginTop: 10, width: "100%" }}>Copiar link</Button>
        </div>
      ) : tenant.aguardandoAdministrador ? (
        <div style={{ marginTop: 20, padding: "14px 16px", border: `1px dashed ${c.darkAmber}`, borderRadius: 11 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: c.darkAmber }}>Sem administrador</div>
          <div style={{ fontSize: 12, color: c.darkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Quem você definir aqui entra como dono e encontra tudo o que já foi cadastrado.
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            <span style={fieldLabelDark}>Nome</span>
            <input value={adminNome} onChange={(e) => setAdminNome(e.target.value)} style={fieldInputDark} />
          </label>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={fieldLabelDark}>E-mail</span>
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={fieldInputDark} />
          </label>
          <Button
            onClick={definirAdministrador}
            loading={definindo}
            disabled={!adminNome.trim() || !adminEmail.trim()}
            style={{ marginTop: 12, width: "100%" }}
          >
            Definir administrador
          </Button>
        </div>
      ) : null}

      {pendente ? (
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Button variant="dark" onClick={recusar}>Recusar</Button>
          <div style={{ flex: 1 }} />
          <Button onClick={aprovar}>Aprovar barbearia</Button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Button variant="dark" onClick={alternarPlano}>{pro ? "Mudar para Básico" : "Mudar para Pro"}</Button>
          <div style={{ flex: 1 }} />
          <Button onClick={alternarStatus} style={ativo ? { background: c.red } : undefined}>
            {ativo ? "Suspender" : "Reativar"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
