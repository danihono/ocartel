"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Seal } from "@/components/ui/Seal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { useStore } from "@/lib/store";
import { signOutApp, useAuth } from "@/lib/firebase/auth";
import { slug } from "@/lib/selectors";
import { useToast } from "@/components/ui/Toast";
import { PAPEL_LABEL, iniciaisDe } from "@/lib/pessoa";
import { LinkAba } from "@/components/admin/navegacao";

// Menu lateral: a própria página (sem faixa escura), com hairline à direita. O item
// ativo é uma pílula floresta com ícone neon (no escuro, pílula neon). Recolhe para
// só ícones (preferência salva); no celular vira gaveta.

type Item = { label: string; href: string; icon: IconName };

const grupos: { titulo?: string; itens: Item[] }[] = [
  { itens: [{ label: "Dashboard", href: "/dashboard", icon: "painel" }] },
  {
    titulo: "Operação",
    itens: [
      { label: "Agenda", href: "/agenda", icon: "agenda" },
      { label: "Clientes", href: "/clientes", icon: "clientes" },
      { label: "WhatsApp", href: "/whatsapp", icon: "whatsapp" },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { label: "Pagamentos", href: "/pagamentos", icon: "pagamentos" },
      { label: "Planos", href: "/planos", icon: "planos" },
      { label: "Comissões", href: "/comissoes", icon: "comissoes" },
    ],
  },
];

const CHAVE_RECOLHIDO = "ocartel.menuRecolhido";

export default function Sidebar({ active, aberto = false, onFechar }: { active: string; aberto?: boolean; onFechar?: () => void }) {
  const { state } = useStore();
  const { tenantId, role, impersonating, exitTenant } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === "1");
    } catch {
      /* sem storage: abre expandido */
    }
  }, []);

  function alternarRecolhido() {
    setRecolhido((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, r ? "0" : "1");
      } catch {
        /* vale só nesta aba */
      }
      return !r;
    });
  }

  async function sair() {
    await signOutApp();
    toast("Sessão encerrada.");
    router.push("/login");
  }

  function voltarConsole() {
    exitTenant();
    router.push("/super-admin");
  }

  // Slug da barbearia atual (na impersonação, state.tenants traz todas — acha a certa).
  const slugAtual = state.tenants.find((t) => t.id === tenantId)?.slug ?? state.tenants[0]?.slug ?? slug(state.config.nome);

  const navItem = (it: Item) => {
    const isActive = it.href === active;
    // O mesmo contador nas duas abas onde a sugestão pode ser resolvida: quem está
    // na Agenda não deveria precisar lembrar de olhar o WhatsApp, e vice-versa.
    const pendentes = it.href === "/whatsapp" || it.href === "/agenda" ? state.sugestoes.length : 0;
    return (
      <LinkAba key={it.href} href={it.href} onNavigate={onFechar}>
        <span className={`oc-nav oc-tip${isActive ? " is-active" : ""}`} data-tip={it.label} aria-current={isActive ? "page" : undefined}>
          <Icon name={it.icon} size={19} stroke={isActive ? 2 : 1.7} />
          <span className="oc-hide-collapsed">{it.label}</span>
          {pendentes > 0 ? (
            <span className="oc-nav-badge" title={`${pendentes} sugestão(ões) do atendente esperando confirmação`}>
              {pendentes}
            </span>
          ) : null}
        </span>
      </LinkAba>
    );
  };

  return (
    <aside className={`oc-side${recolhido ? " is-collapsed" : ""}${aberto ? " is-open" : ""}`} aria-label="Menu principal">
      {/* Marca */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 4px 14px", minHeight: 52 }}>
        <Seal size={38} />
        <div className="oc-hide-collapsed" style={{ flex: 1, minWidth: 0 }}>
          <div className="oc-wordmark" style={{ fontSize: 14, color: "var(--oc-ink)", lineHeight: 1.2 }}>O CARTEL</div>
          <div style={{ fontSize: 11, color: "var(--oc-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {state.config.nome || "Clube de barbearia"}
          </div>
        </div>
        <button className="oc-icon-btn is-plain oc-hide-collapsed oc-only-desktop" onClick={alternarRecolhido} aria-label="Recolher menu" title="Recolher menu" style={{ width: 30, height: 30 }}>
          <Icon name="painelLateral" size={16} />
        </button>
        <button className="oc-icon-btn is-plain oc-only-mobile" onClick={onFechar} aria-label="Fechar menu" style={{ width: 30, height: 30 }}>
          <Icon name="fechar" size={16} />
        </button>
      </div>
      {recolhido ? (
        <button className="oc-icon-btn is-plain oc-only-desktop" onClick={alternarRecolhido} aria-label="Expandir menu" title="Expandir menu" style={{ margin: "0 auto 6px" }}>
          <Icon name="painelLateral" size={16} />
        </button>
      ) : null}

      {impersonating ? (
        <button
          onClick={voltarConsole}
          className="oc-tip"
          data-tip="Voltar ao console"
          style={{ position: "relative", margin: "0 0 10px", padding: recolhido ? 10 : "10px 13px", borderRadius: 14, border: "none", background: "var(--oc-forest)", color: "var(--oc-on-forest)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
        >
          <span style={{ color: "var(--oc-neon)", display: "grid", placeItems: "center" }}>
            <Icon name="escudo" size={17} />
          </span>
          <span className="oc-hide-collapsed" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--oc-neon)", fontWeight: 700 }}>Modo super admin</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Voltar ao console</span>
          </span>
        </button>
      ) : null}

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto", overflowX: "visible", margin: "0 -4px", padding: "0 4px" }}>
        {grupos.map((g, i) => (
          <div key={g.titulo ?? i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {g.titulo ? <div className="oc-nav-group">{g.titulo}</div> : null}
            {g.itens.map(navItem)}
          </div>
        ))}
      </nav>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 10, marginTop: 10, borderTop: "1px solid var(--oc-line)" }}>
        {navItem({ label: "Configurações", href: "/configuracoes", icon: "config" })}
        <a href={`/book/${slugAtual}`} target="_blank" rel="noopener noreferrer" className="oc-nav oc-tip" data-tip="Tela do cliente">
          <Icon name="link" size={18} stroke={1.7} />
          <span className="oc-hide-collapsed" style={{ flex: 1 }}>Tela do cliente</span>
          <Icon name="externo" size={14} className="oc-hide-collapsed" />
        </a>
        <a href={`/barbeiro?b=${state.ui.barbeiroVisaoId ?? state.barbeiros[0]?.id ?? ""}`} target="_blank" rel="noopener noreferrer" className="oc-nav oc-tip" data-tip="Tela do barbeiro">
          <Icon name="celular" size={18} stroke={1.7} />
          <span className="oc-hide-collapsed" style={{ flex: 1 }}>Tela do barbeiro</span>
          <Icon name="externo" size={14} className="oc-hide-collapsed" />
        </a>
      </div>

      <div className="oc-only-mobile" style={{ padding: "12px 4px 2px" }}>
        <ThemeSwitch />
      </div>

      <div style={{ position: "relative", marginTop: 10 }}>
        {menu ? (
          <div className="oc-menu oc-pop" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, minWidth: 210, zIndex: 30 }}>
            <LinkAba
              href="/configuracoes"
              onNavigate={() => {
                setMenu(false);
                onFechar?.();
              }}
            >
              <span className="oc-menu-item">
                <Icon name="config" size={16} /> Configurações
              </span>
            </LinkAba>
            <div style={{ height: 1, background: "var(--oc-line)", margin: "4px 4px" }} />
            <button onClick={sair} className="oc-menu-item" style={{ color: "var(--oc-red-ink)" }}>
              <Icon name="sair" size={16} style={{ color: "var(--oc-red-ink)" }} /> Sair
            </button>
          </div>
        ) : null}
        <button
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          style={{ width: "100%", border: "1px solid var(--oc-line)", background: "var(--oc-surface)", borderRadius: 999, cursor: "pointer", display: "flex", gap: 10, alignItems: "center", padding: recolhido ? 3 : "5px 10px 5px 5px", justifyContent: recolhido ? "center" : undefined, boxShadow: "var(--oc-shadow-sm)" }}
        >
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--oc-forest)", color: "var(--oc-neon)", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 600, flex: "none", letterSpacing: "-0.02em" }}>
            {iniciaisDe(state.auth.nome)}
          </span>
          <span className="oc-hide-collapsed" style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--oc-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{state.auth.nome}</span>
            <span style={{ display: "block", fontSize: 11, color: "var(--oc-muted)" }}>{impersonating ? "Super admin" : role ? PAPEL_LABEL[role] : ""}</span>
          </span>
          <span className="oc-hide-collapsed" style={{ color: "var(--oc-muted)", transform: menu ? "rotate(180deg)" : undefined, transition: "transform .2s" }}>
            <Icon name="chevronBaixo" size={15} />
          </span>
        </button>
      </div>
    </aside>
  );
}
