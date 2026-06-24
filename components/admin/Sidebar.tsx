"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { useStore } from "@/lib/store";
import { signOutApp, useAuth } from "@/lib/firebase/auth";
import { slug } from "@/lib/selectors";
import { useToast } from "@/components/ui/Toast";

const items: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Agenda", href: "/agenda" },
  { label: "Clientes", href: "/clientes" },
  { label: "Planos", href: "/planos" },
  { label: "Pagamentos", href: "/pagamentos" },
  { label: "Configurações", href: "/configuracoes" },
];

export default function Sidebar({ active }: { active: string }) {
  const { state } = useStore();
  const { tenantId, impersonating, exitTenant } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [menu, setMenu] = useState(false);

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

  return (
    <aside
      style={{
        flex: "0 0 250px",
        background: c.espresso,
        color: "#9FB4AE",
        display: "flex",
        flexDirection: "column",
        padding: "22px 0",
      }}
    >
      <div style={{ padding: "0 22px 20px", display: "flex", gap: 11, alignItems: "center", borderBottom: `1px solid ${c.espressoLine}` }}>
        <Seal size={40} />
        <div>
          <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 14, letterSpacing: 2, color: "#FFFFFF" }}>O CARTEL</div>
          <div style={{ fontSize: 11, color: c.darkMuted, marginTop: 2 }}>{state.config.nome}</div>
        </div>
      </div>

      {impersonating ? (
        <button
          onClick={voltarConsole}
          style={{ margin: "14px 14px 0", padding: "10px 12px", borderRadius: 9, border: `1px solid ${c.brass}`, background: "rgba(14,163,122,0.16)", color: c.darkText, cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}
        >
          <span style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.brass, fontWeight: 700 }}>Modo super admin</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>↩ Voltar ao console</span>
        </button>
      ) : null}

      <nav style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6E817B", padding: "8px 12px 7px" }}>Gestão</div>
        {items.map((it) => {
          const isActive = it.href === active;
          return (
            <Link key={it.label} href={it.href}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: isActive ? "rgba(14,163,122,0.16)" : "transparent",
                  color: isActive ? c.darkText : "#9FB4AE",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? c.lime : "transparent" }} />
                {it.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div style={{ position: "relative", margin: "0 14px", padding: "14px 12px", borderTop: `1px solid ${c.espressoLine}` }}>
        <a
          href={`/book/${slugAtual}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 8px", fontSize: 12.5, fontWeight: 600, color: "#9FB4AE", textDecoration: "none" }}
        >
          Tela do cliente <span style={{ color: c.brass }}>↗</span>
        </a>
        <a
          href={`/barbeiro?b=${state.ui.barbeiroVisaoId ?? state.barbeiros[0]?.id ?? ""}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 12px", fontSize: 12.5, fontWeight: 600, color: "#9FB4AE", textDecoration: "none" }}
        >
          Tela do barbeiro <span style={{ color: c.brass }}>↗</span>
        </a>
        {menu ? (
          <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, marginBottom: 6, background: "#0E2722", border: `1px solid ${c.espressoLine}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
            <Link href="/configuracoes" onClick={() => setMenu(false)}>
              <div style={{ padding: "11px 14px", fontSize: 13, color: "#9FB4AE", cursor: "pointer" }}>Configurações</div>
            </Link>
            <button onClick={sair} style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "11px 14px", fontSize: 13, color: c.darkRed, cursor: "pointer", borderTop: `1px solid ${c.espressoLine}` }}>
              Sair
            </button>
          </div>
        ) : null}
        <button
          onClick={() => setMenu((m) => !m)}
          style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", display: "flex", gap: 11, alignItems: "center", padding: 0 }}
        >
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: c.leather, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: c.darkText }}>
            MR
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: c.darkText }}>{state.auth.nome}</div>
            <div style={{ fontSize: 11, color: c.darkMuted }}>{impersonating ? "Super admin" : "Dona · Admin"}</div>
          </div>
          <span style={{ color: c.darkMuted, fontSize: 12 }}>{menu ? "▾" : "▸"}</span>
        </button>
      </div>
    </aside>
  );
}
