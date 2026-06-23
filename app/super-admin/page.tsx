"use client";

import { useState } from "react";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { LineChart } from "@/components/ui/LineChart";
import { atividadeSaas, mrr12m, planosSaas, saasKpis } from "@/lib/mock-data";
import { tenantStatusMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { TenantDrawer } from "@/components/admin/TenantDrawer";
import type { Tenant, TenantStatus } from "@/lib/types";

const navTabs = ["Visão geral", "Barbearias", "Billing", "Suporte"] as const;
type Aba = (typeof navTabs)[number];

function brl(n: number): string {
  return "R$ " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseMrr(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

const filtrosStatus: { label: string; status: TenantStatus | "todas" }[] = [
  { label: "Todas", status: "todas" },
  { label: "Ativas", status: "ativo" },
  { label: "Trial", status: "trial" },
  { label: "Atrasadas", status: "atrasado" },
];

export default function SuperAdminPage() {
  const { state } = useStore();
  const [aba, setAba] = useState<Aba>("Visão geral");
  const [filtro, setFiltro] = useState<TenantStatus | "todas">("todas");
  const [drawer, setDrawer] = useState<Tenant | null>(null);

  const ativas = state.tenants.filter((t) => t.status === "ativo").length;
  const trials = state.tenants.filter((t) => t.status === "trial").length;
  const mrrTotal = state.tenants.reduce((acc, t) => acc + parseMrr(t.mrr), 0);

  const tenantsFiltrados = filtro === "todas" ? state.tenants : state.tenants.filter((t) => t.status === filtro);

  function kpiValor(label: string, original: string): string {
    if (label === "Barbearias ativas") return String(ativas);
    if (label === "MRR") return brl(mrrTotal);
    if (label === "Em trial") return String(trials);
    return original;
  }

  return (
    <div style={{ height: "100vh", overflow: "auto", background: c.darkBg, color: c.darkText }}>
      <header style={{ height: 70, borderBottom: `1px solid ${c.espressoLine}`, display: "flex", alignItems: "center", padding: "0 30px", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Seal size={36} />
          <div>
            <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 13, letterSpacing: 2, color: "#F2E6D2" }}>O CARTEL</div>
            <div style={{ fontSize: 10.5, color: "#8A7866", letterSpacing: 0.5 }}>Console SaaS</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {navTabs.map((t) => {
            const on = t === aba;
            return (
              <button
                key={t}
                onClick={() => setAba(t)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: on ? 700 : 600,
                  color: on ? c.espressoDeep : c.darkMuted,
                  background: on ? c.brass : "transparent",
                  borderRadius: 999,
                  padding: "6px 13px",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: c.darkText }}>Daniel H.</div>
            <div style={{ fontSize: 10.5, color: "#8A7866" }}>Super Admin</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: c.leather, color: "#E8DAC0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>DH</div>
        </div>
      </header>

      <div style={{ padding: "28px 30px", maxWidth: 1180 }}>
        {/* KPIs (sempre visíveis, dinâmicos) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {saasKpis.map((k) => (
            <div key={k.label} style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.darkMuted, fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontFamily: font.serif, fontSize: 30, fontWeight: 600, marginTop: 8, color: "#F2E6D2" }}>{kpiValor(k.label, k.value)}</div>
              <div style={{ fontSize: 12, marginTop: 5, color: k.tone === "green" ? c.darkGreen : c.darkAmber, fontWeight: 600 }}>{k.delta}</div>
            </div>
          ))}
        </div>

        {aba === "Visão geral" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16 }}>
              <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, padding: "20px 22px" }}>
                <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2" }}>Crescimento de MRR</div>
                <div style={{ fontSize: 12, color: c.darkMuted, marginTop: 2, marginBottom: 14 }}>Últimos 12 meses</div>
                <LineChart data={mrr12m} stroke={c.brass} fill="rgba(201,168,106,.14)" gridColor="#2E231C" gridLines={[60, 120]} height={180} />
              </div>
              <PlanosCard />
            </div>
            <AtividadeCard />
          </>
        ) : aba === "Barbearias" ? (
          <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, marginTop: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "18px 22px 12px", gap: 12 }}>
              <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2", flex: 1 }}>Barbearias</span>
              <div style={{ display: "flex", gap: 6 }}>
                {filtrosStatus.map((f) => {
                  const on = f.status === filtro;
                  return (
                    <button
                      key={f.label}
                      onClick={() => setFiltro(f.status)}
                      style={{ border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? c.espressoDeep : c.darkMuted, background: on ? c.brass : "rgba(231,220,201,.08)", borderRadius: 999, padding: "5px 12px" }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <TenantsHeader />
            {tenantsFiltrados.map((t) => (
              <TenantRow key={t.nome} t={t} onClick={() => setDrawer(t)} />
            ))}
            {tenantsFiltrados.length === 0 ? <div style={{ padding: "28px", textAlign: "center", color: c.darkMuted, fontSize: 13 }}>Nenhuma barbearia neste filtro.</div> : null}
          </div>
        ) : aba === "Billing" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 16 }}>
              <MiniKpi label="MRR total" value={brl(mrrTotal)} />
              <MiniKpi label="Receita anual projetada" value={brl(mrrTotal * 12)} />
              <MiniKpi label="Ticket médio" value={brl(ativas ? Math.round(mrrTotal / ativas) : 0)} />
            </div>
            <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, marginTop: 16, overflow: "hidden" }}>
              <div style={{ padding: "18px 22px 4px", fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2" }}>Faturamento por barbearia</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 22px", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#8A7866", fontWeight: 600, borderBottom: `1px solid ${c.darkLine}` }}>
                <span>Barbearia</span>
                <span>Plano</span>
                <span>Status</span>
                <span>MRR</span>
              </div>
              {state.tenants.map((t) => {
                const sm = tenantStatusMeta[t.status];
                return (
                  <div key={t.nome} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", alignItems: "center", padding: "13px 22px", borderBottom: "1px solid #2A1F18" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: c.darkText }}>{t.nome}</div>
                    <div style={{ fontSize: 13, color: "#B6A78F" }}>{t.plano}</div>
                    <div><span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span></div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: c.darkText }}>{t.mrr}</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Suporte */
          <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, marginTop: 16, padding: "18px 22px" }}>
            <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2", marginBottom: 6 }}>Atividade & suporte</div>
            {atividadeSaas.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : "1px solid #2A1F18" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.cor, flex: "none" }} />
                <span style={{ flex: 1, fontSize: 13.5, color: c.darkText }}>{a.texto}</span>
                <span style={{ fontSize: 12, color: c.darkMuted }}>{a.quando}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: c.darkGreen, background: "rgba(94,122,82,.18)", borderRadius: 999, padding: "3px 11px" }}>Resolver</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <TenantDrawer open={drawer !== null} onClose={() => setDrawer(null)} tenant={drawer} />
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase", color: c.darkMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: font.serif, fontSize: 26, fontWeight: 600, marginTop: 8, color: "#F2E6D2" }}>{value}</div>
    </div>
  );
}

function PlanosCard() {
  return (
    <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, padding: "20px 22px" }}>
      <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2", marginBottom: 16 }}>Distribuição de planos</div>
      {planosSaas.map((p, i) => (
        <div key={p.nome} style={{ marginBottom: i === 0 ? 16 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: c.darkText, fontWeight: 600 }}>{p.nome}</span>
            <span style={{ color: c.darkMuted, fontWeight: 600 }}>{p.qtd}</span>
          </div>
          <div style={{ height: 8, background: "#2E231C", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ width: `${p.pct}%`, height: "100%", background: p.cor }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${c.darkLine}`, marginTop: 18, paddingTop: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: c.darkMuted, fontWeight: 600 }}>Ticket médio SaaS</div>
        <div style={{ fontFamily: font.serif, fontSize: 22, fontWeight: 600, color: "#F2E6D2", marginTop: 4 }}>
          R$ 210<span style={{ fontSize: 12, fontFamily: font.sans, color: c.darkMuted, fontWeight: 500 }}>/barbearia</span>
        </div>
      </div>
    </div>
  );
}

function AtividadeCard() {
  return (
    <div style={{ background: c.darkSurface, border: `1px solid ${c.darkLine}`, borderRadius: 14, marginTop: 16, padding: "18px 22px" }}>
      <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#F2E6D2", marginBottom: 6 }}>Atividade recente</div>
      {atividadeSaas.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: i === 0 ? "none" : "1px solid #2A1F18" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.cor, flex: "none" }} />
          <span style={{ flex: 1, fontSize: 13.5, color: c.darkText }}>{a.texto}</span>
          <span style={{ fontSize: 12, color: c.darkMuted }}>{a.quando}</span>
        </div>
      ))}
    </div>
  );
}

function TenantsHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "12px 22px", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: "#8A7866", fontWeight: 600, borderBottom: `1px solid ${c.darkLine}`, borderTop: `1px solid ${c.darkLine}` }}>
      <span>Barbearia</span>
      <span>Plano</span>
      <span>Status</span>
      <span>MRR</span>
      <span>Agend./mês</span>
    </div>
  );
}

function TenantRow({ t, onClick }: { t: Tenant; onClick: () => void }) {
  const sm = tenantStatusMeta[t.status];
  const proPlan = t.plano === "Pro";
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "transparent", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", alignItems: "center", padding: "14px 22px", borderBottom: "1px solid #2A1F18" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: c.espressoLine, color: c.brass, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontSize: 11, fontWeight: 700 }}>
          {t.monograma}
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: c.darkText }}>{t.nome}</div>
          <div style={{ fontSize: 11, color: "#8A7866" }}>{t.cidade}</div>
        </div>
      </div>
      <div>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 999, background: proPlan ? c.brass : "rgba(231,220,201,.12)", color: proPlan ? c.espressoDeep : c.darkText }}>{t.plano}</span>
      </div>
      <div>
        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 11px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: c.darkText }}>{t.mrr}</div>
      <div style={{ fontSize: 13.5, color: "#B6A78F" }}>{t.agendamentosMes}</div>
    </button>
  );
}
