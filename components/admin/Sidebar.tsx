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
import type { Role } from "@/lib/types";

const items: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Agenda", href: "/agenda" },
  { label: "Clientes", href: "/clientes" },
  { label: "Planos", href: "/planos" },
  { label: "Pagamentos", href: "/pagamentos" },
  { label: "Configurações", href: "/configuracoes" },
];

// Opções de "visão" por papel (placeholder de RBAC — ver README › próximos passos).
const VISOES: { value: Role; label: string; sub: string }[] = [
  { value: "admin", label: "Administrador", sub: "Vê tudo" },
  { value: "barbeiro", label: "Barbeiro", sub: "Sua agenda" },
];

// A visão "barbeiro" enxuga o menu; as demais veem tudo (fallback).
// A visão do cliente é a tela pública (link "Tela do cliente" no rodapé).
const itemsPorVisao: Partial<Record<Role, string[]>> = {
  barbeiro: ["/dashboard", "/agenda", "/clientes"],
};

export default function Sidebar({ active }: { active: string }) {
  const { state, dispatch } = useStore();
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
        color: "#cbb89e",
        display: "flex",
        flexDirection: "column",
        padding: "22px 0",
      }}
    >
      <div style={{ padding: "0 22px 20px", display: "flex", gap: 11, alignItems: "center", borderBottom: `1px solid ${c.espressoLine}` }}>
        <Seal size={40} />
        <div>
          <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 14, letterSpacing: 2, color: "#F2E6D2" }}>O CARTEL</div>
          <div style={{ fontSize: 11, color: "#8A7866", marginTop: 2 }}>{state.config.nome}</div>
        </div>
      </div>

      {impersonating ? (
        <button
          onClick={voltarConsole}
          style={{ margin: "14px 14px 0", padding: "10px 12px", borderRadius: 9, border: `1px solid ${c.brass}`, background: "rgba(201,168,106,0.14)", color: "#F3E8D5", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}
        >
          <span style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.brass, fontWeight: 700 }}>Modo super admin</span>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>↩ Voltar ao console</span>
        </button>
      ) : null}

      <nav style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6d5d4d", padding: "8px 12px 7px" }}>Visão</div>
        {VISOES.map((v) => {
          const on = v.value === state.ui.visao;
          return (
            <button
              key={v.value}
              onClick={() => dispatch({ type: "SET_VISAO", visao: v.value })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                textAlign: "left",
                border: "none",
                cursor: "pointer",
                padding: "9px 12px",
                borderRadius: 9,
                background: on ? "rgba(201,168,106,0.14)" : "transparent",
                color: on ? "#F3E8D5" : "#b4a288",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: on ? c.brass : "transparent", flex: "none" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: on ? 600 : 500 }}>{v.label}</span>
                <span style={{ fontSize: 10.5, color: "#7d6c59" }}>{v.sub}</span>
              </span>
            </button>
          );
        })}

        {state.ui.visao === "barbeiro" ? (
          <div style={{ padding: "2px 12px 4px" }}>
            <select
              value={state.ui.barbeiroVisaoId ?? ""}
              onChange={(e) => dispatch({ type: "SET_BARBEIRO_VISAO", id: e.target.value })}
              style={{
                width: "100%",
                background: "#2A1E16",
                color: "#EaDcC6",
                border: `1px solid ${c.espressoLine}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              {state.barbeiros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div style={{ height: 1, background: c.espressoLine, margin: "12px 12px 4px" }} />

        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: "#6d5d4d", padding: "8px 12px 7px" }}>Gestão</div>
        {items
          .filter((it) => (itemsPorVisao[state.ui.visao] ?? items.map((i) => i.href)).includes(it.href))
          .map((it) => {
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
                  background: isActive ? "rgba(201,168,106,0.14)" : "transparent",
                  color: isActive ? "#F3E8D5" : "#b4a288",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? c.brass : "transparent" }} />
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
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0 12px", fontSize: 12.5, fontWeight: 600, color: "#b4a288", textDecoration: "none" }}
        >
          Tela do cliente <span style={{ color: c.brass }}>↗</span>
        </a>
        {menu ? (
          <div style={{ position: "absolute", bottom: "100%", left: 12, right: 12, marginBottom: 6, background: "#2A1E16", border: `1px solid ${c.espressoLine}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>
            <Link href="/configuracoes" onClick={() => setMenu(false)}>
              <div style={{ padding: "11px 14px", fontSize: 13, color: "#cbb89e", cursor: "pointer" }}>Configurações</div>
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
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: c.leather, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#E8DAC0" }}>
            MR
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EaDcC6" }}>{state.auth.nome}</div>
            <div style={{ fontSize: 11, color: "#8A7866" }}>{impersonating ? "Super admin" : "Dona · Admin"}</div>
          </div>
          <span style={{ color: "#8A7866", fontSize: 12 }}>{menu ? "▾" : "▸"}</span>
        </button>
      </div>
    </aside>
  );
}
