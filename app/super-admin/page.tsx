"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { tenantStatusMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { signOutApp, useAuth } from "@/lib/firebase/auth";
import { seedDemoTenant } from "@/lib/firebase/bootstrap";
import { useToast } from "@/components/ui/Toast";
import { TenantDrawer } from "@/components/admin/TenantDrawer";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Kpi } from "@/components/ui/Kpi";
import { PageHeader } from "@/components/ui/PageHeader";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { acaoCriarBarbearia } from "./actions";
import type { Tenant, TenantStatus } from "@/lib/types";

const navTabs = ["Visão geral", "Barbearias", "Billing", "Suporte"] as const;
type Aba = (typeof navTabs)[number];

function brl(n: number): string {
  return "R$ " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function parseMrr(s: string): number {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}
function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "SA";
}

const filtrosStatus: { label: string; status: TenantStatus | "todas" }[] = [
  { label: "Todas", status: "todas" },
  { label: "Pendentes", status: "pendente" },
  { label: "Ativas", status: "ativo" },
  { label: "Trial", status: "trial" },
  { label: "Atrasadas", status: "atrasado" },
];

export default function SuperAdminPage() {
  const { state } = useStore();
  const { user, profile, enterTenant } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("Visão geral");
  const [filtro, setFiltro] = useState<TenantStatus | "todas">("todas");
  const [drawer, setDrawer] = useState<Tenant | null>(null);
  const [criando, setCriando] = useState(false);

  async function criarDemo() {
    if (!user || criando) return;
    setCriando(true);
    try {
      const { tenantId } = await seedDemoTenant({ ownerUid: user.uid, nome: "Barbearia Demo" });
      enterTenant(tenantId);
      toast("Barbearia demo criada. Abrindo painel…");
      router.push("/dashboard");
    } catch {
      toast("Não foi possível criar a barbearia demo.", "error");
      setCriando(false);
    }
  }

  // Barbearia de verdade, vazia e sem dono: você monta o cadastro (serviços, equipe,
  // clientes) e define o administrador depois, pelo drawer dela.
  const [novaAberta, setNovaAberta] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  async function criarBarbearia() {
    if (!user || criando || !nomeNova.trim()) return;
    setCriando(true);
    try {
      const r = await acaoCriarBarbearia(await user.getIdToken(), nomeNova);
      if (!r.ok || !r.tenantId) {
        toast(r.erro ?? "Não foi possível criar a barbearia.", "error");
        setCriando(false);
        return;
      }
      enterTenant(r.tenantId);
      toast(`${nomeNova.trim()} criada. Abrindo painel…`);
      router.push("/dashboard");
    } catch {
      toast("Não foi possível criar a barbearia.", "error");
      setCriando(false);
    }
  }

  const pendentes = state.tenants.filter((t) => t.status === "pendente").length;
  const ativas = state.tenants.filter((t) => t.status === "ativo").length;
  const trials = state.tenants.filter((t) => t.status === "trial").length;
  const mrrTotal = state.tenants.reduce((acc, t) => acc + parseMrr(t.mrr), 0);
  const ticketMedioSaas = ativas ? Math.round(mrrTotal / ativas) : 0;

  // Distribuição de planos: derivada das barbearias reais (não mock).
  const distribPlanos = (() => {
    const pro = state.tenants.filter((t) => t.plano === "Pro").length;
    const basico = state.tenants.filter((t) => t.plano === "Básico").length;
    const total = pro + basico || 1;
    return [
      { nome: "Pro · R$ 249", qtd: pro, pct: Math.round((pro / total) * 100), cor: c.accent },
      { nome: "Básico · R$ 129", qtd: basico, pct: Math.round((basico / total) * 100), cor: c.ink4 },
    ];
  })();

  const nomeSuper = profile?.nome || "Super Admin";

  const tenantsFiltrados = filtro === "todas" ? state.tenants : state.tenants.filter((t) => t.status === filtro);

  const atrasadas = state.tenants.filter((t) => t.status === "atrasado").length;
  const pro = state.tenants.filter((t) => t.plano === "Pro").length;

  // Os quatro números do topo, todos vindos das barbearias de verdade.
  //
  // O quarto era "Churn 2,1% ▼ 0,4 p.p." — e nunca foi medido: churn precisa de
  // histórico, que o sistema não guarda. No lugar entra o que realmente exige ação
  // sua: quantos cadastros estão parados esperando aprovação.

  /**
   * A fila de coisas que pedem ação sua, derivada das barbearias — não uma lista de
   * eventos. O console mostrava quatro linhas fixas no código ("Studio Navalha assinou
   * o plano Pro"), barbearias que nunca existiram em banco nenhum.
   */
  const [menuConta, setMenuConta] = useState(false);

  // O console não tinha saída: quem entrava aqui só saía limpando o navegador.
  async function sair() {
    await signOutApp();
    toast("Sessão encerrada.");
    router.push("/login");
  }

  const pendencias = [
    ...state.tenants
      .filter((t) => t.status === "pendente")
      .map((t) => ({ tenant: t, cor: c.amberText, texto: `${t.nome} — cadastro aguardando aprovação`, acao: "Aprovar" })),
    ...state.tenants
      .filter((t) => t.status === "atrasado")
      .map((t) => ({ tenant: t, cor: c.redText, texto: `${t.nome} — sem acesso (suspensa ou recusada)`, acao: "Ver" })),
  ];

  return (
    <div style={{ height: "100vh", overflow: "auto", background: c.bg, color: c.ink }}>
      <header className="oc-topbar" style={{ height: 72, gap: 18, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 30, borderBottom: `1px solid ${c.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Seal size={38} />
          <div>
            <div className="oc-wordmark" style={{ fontSize: 13.5, color: c.ink }}>O CARTEL</div>
            <div style={{ fontSize: 11, color: c.ink3, marginTop: 1 }}>Console SaaS</div>
          </div>
        </div>
        <div className="oc-seg oc-only-desktop" role="tablist">
          {navTabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === aba} onClick={() => setAba(t)}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="oc-only-desktop">
          <ThemeSwitch />
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuConta((m) => !m)}
            aria-expanded={menuConta}
            style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${c.border}`, background: c.surface, borderRadius: 999, cursor: "pointer", padding: "4px 10px 4px 4px", font: "inherit", boxShadow: "var(--oc-shadow-sm)" }}
          >
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: c.forest, color: c.neon, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 600 }}>{iniciaisDe(nomeSuper)}</span>
            <span className="oc-only-desktop" style={{ textAlign: "left", flexDirection: "column" }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: c.ink }}>{nomeSuper}</span>
              <span style={{ display: "block", fontSize: 10.5, color: c.ink3 }}>Super Admin</span>
            </span>
            <span style={{ color: c.ink3, transform: menuConta ? "rotate(180deg)" : undefined, transition: "transform .2s" }}>
              <Icon name="chevronBaixo" size={15} />
            </span>
          </button>

          {menuConta ? (
            <>
              {/* Captura o clique fora para fechar — sem isso o menu só fecharia pelo botão. */}
              <div onClick={() => setMenuConta(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div className="oc-menu oc-pop" style={{ position: "absolute", right: 0, top: "100%", marginTop: 10, minWidth: 220, zIndex: 41 }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: `1px solid ${c.border}`, marginBottom: 4 }}>
                  <div style={{ fontSize: 11.5, color: c.ink3 }}>Conectado como</div>
                  <div style={{ fontSize: 12.5, color: c.ink, fontWeight: 600, marginTop: 2, wordBreak: "break-all" }}>{profile?.email ?? nomeSuper}</div>
                </div>
                <div className="oc-only-mobile" style={{ padding: "6px 6px 8px" }}>
                  <ThemeSwitch />
                </div>
                <button onClick={sair} className="oc-menu-item" style={{ color: c.redText }}>
                  <Icon name="sair" size={16} style={{ color: c.redText }} /> Sair
                </button>
              </div>
            </>
          ) : null}
        </div>
      </header>

      <div className="oc-tela-inner" style={{ paddingTop: 26 }}>
        {/* Abas no celular (no desktop ficam no topo) */}
        <div className="oc-seg oc-only-mobile" role="tablist" style={{ marginBottom: 16, overflowX: "auto", maxWidth: "100%" }}>
          {navTabs.map((t) => (
            <button key={t} role="tab" aria-selected={t === aba} onClick={() => setAba(t)}>
              {t}
            </button>
          ))}
        </div>

        <PageHeader
          eyebrow="Console"
          title={aba === "Visão geral" ? `Olá, ${nomeSuper.split(" ")[0]}.` : `${aba}.`}
          subtitle={pendentes ? `${pendentes} cadastro${pendentes === 1 ? "" : "s"} esperando você.` : `${ativas} barbearia${ativas === 1 ? "" : "s"} ativa${ativas === 1 ? "" : "s"}.`}
          live={pendentes > 0}
        />

        {/* KPIs (sempre visíveis, dinâmicos): o MRR é o herói */}
        <div className="oc-kpis oc-stagger">
          <Kpi hero label="MRR" value={brl(mrrTotal)} sub={`${pro} no Pro · ${ativas - pro < 0 ? 0 : ativas - pro} no Básico`} />
          <Kpi label="Barbearias ativas" value={ativas} sub={`${state.tenants.length} no total`} />
          <Kpi label="Em trial" value={trials} sub={trials === 0 ? "nenhuma em teste" : "em período de teste"} />
          <Kpi
            label="Aguardando aprovação"
            value={pendentes}
            sub={pendentes === 0 ? "nada na fila" : "esperando sua decisão"}
            delta={pendentes > 0 ? { text: "ação", tone: "down" } : undefined}
          />
        </div>

        {aba === "Visão geral" ? (
          <>
            {/* O gráfico de "Crescimento de MRR — últimos 12 meses" saiu daqui: era uma
                série fixa no código. O sistema não guarda histórico de faturamento, então
                não há como desenhar isso de verdade — e um gráfico inventado num console
                de decisão é pior do que gráfico nenhum. */}
            <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, marginTop: 16 }}>
              <PlanosCard distrib={distribPlanos} ticketMedio={ticketMedioSaas} />
              <PendenciasCard itens={pendencias} onAbrir={setDrawer} />
            </div>
          </>
        ) : aba === "Barbearias" ? (
          <>
          {/* Cadastros esperando decisão. Fica acima da lista porque é a única coisa aqui
              que trava alguém do outro lado: enquanto ninguém aprova, a barbearia não entra. */}
          {pendentes > 0 ? (
            <button
              onClick={() => setFiltro("pendente")}
              style={{ width: "100%", textAlign: "left", marginTop: 16, display: "flex", alignItems: "center", gap: 12, background: c.amberBg, border: "none", borderRadius: 18, padding: "14px 18px", cursor: "pointer" }}
            >
              <span style={{ color: c.amber, flex: "none" }}><Icon name="alerta" size={18} /></span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: c.amberText }}>
                  {pendentes} barbearia{pendentes === 1 ? "" : "s"} esperando aprovação
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: c.ink3, marginTop: 2 }}>
                  Sem a sua aprovação, quem se cadastrou não entra no sistema.
                </span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: c.amberText }}>Ver <Icon name="seta" size={14} /></span>
            </button>
          ) : null}

          <div className="oc-card" style={{ marginTop: 16, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "18px 22px 12px", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.ink, flex: 1 }}>Barbearias</span>
              <button
                onClick={() => setNovaAberta(true)}
                disabled={criando}
                style={{ border: "none", cursor: criando ? "default" : "pointer", opacity: criando ? 0.6 : 1, fontSize: 11.5, fontWeight: 700, color: c.primaryBtnText, background: c.primaryBtnBg, borderRadius: 999, padding: "6px 13px" }}
              >
                + Nova barbearia
              </button>
              <button
                onClick={criarDemo}
                disabled={criando}
                style={{ border: "none", cursor: criando ? "default" : "pointer", opacity: criando ? 0.6 : 1, fontSize: 11.5, fontWeight: 700, color: c.primaryBtnText, background: c.primaryBtnBg, borderRadius: 999, padding: "6px 13px" }}
              >
                {criando ? "Criando…" : "+ Barbearia demo"}
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {filtrosStatus.map((f) => {
                  const on = f.status === filtro;
                  return (
                    <button
                      key={f.label}
                      onClick={() => setFiltro(f.status)}
                      style={{ cursor: "pointer", fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? "var(--oc-sel-text)" : c.ink2, background: on ? "var(--oc-sel-bg)" : c.surface, border: `1px solid ${on ? "transparent" : c.border}`, borderRadius: 999, padding: "5px 12px" }}
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
            {tenantsFiltrados.length === 0 ? (
              <div style={{ padding: "28px", textAlign: "center", color: c.ink3, fontSize: 13 }}>
                Nenhuma barbearia neste filtro.
                {state.tenants.length === 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={criarDemo} disabled={criando} style={{ border: "none", cursor: criando ? "default" : "pointer", opacity: criando ? 0.6 : 1, fontSize: 12.5, fontWeight: 700, color: c.primaryBtnText, background: c.primaryBtnBg, borderRadius: 999, padding: "8px 16px" }}>
                      {criando ? "Criando…" : "Criar barbearia demo"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          </>
        ) : aba === "Billing" ? (
          <>
            <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16, marginTop: 16 }}>
              <MiniKpi label="MRR total" value={brl(mrrTotal)} />
              <MiniKpi label="Receita anual projetada" value={brl(mrrTotal * 12)} />
              <MiniKpi label="Ticket médio" value={brl(ativas ? Math.round(mrrTotal / ativas) : 0)} />
            </div>
            <div className="oc-card" style={{ marginTop: 16, overflow: "hidden" }}>
              <div style={{ padding: "18px 22px 4px", fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.ink }}>Faturamento por barbearia</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 22px", fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600, borderBottom: `1px solid ${c.borderSoft}` }}>
                <span>Barbearia</span>
                <span>Plano</span>
                <span>Status</span>
                <span>MRR</span>
              </div>
              {state.tenants.map((t) => {
                const sm = tenantStatusMeta[t.status];
                return (
                  <div key={t.nome} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", alignItems: "center", padding: "13px 22px", borderBottom: `1px solid ${c.borderSoft}` }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{t.nome}</div>
                    <div style={{ fontSize: 13, color: c.ink3 }}>{t.plano}</div>
                    <div><span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span></div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{t.mrr}</div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Suporte */
          <div style={{ marginTop: 16 }}>
            <PendenciasCard itens={pendencias} onAbrir={setDrawer} titulo="Atividade & suporte" />
          </div>
        )}
      </div>

      <TenantDrawer open={drawer !== null} onClose={() => setDrawer(null)} tenant={drawer} />

      <Modal
        open={novaAberta}
        onClose={() => setNovaAberta(false)}
        title="Nova barbearia"
        footer={
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <Button variant="ghost" onClick={() => setNovaAberta(false)}>Cancelar</Button>
            <div style={{ flex: 1 }} />
            <Button onClick={criarBarbearia} loading={criando} disabled={!nomeNova.trim()}>Criar e abrir painel</Button>
          </div>
        }
      >
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>Nome da barbearia</span>
          <input
            autoFocus
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") criarBarbearia();
            }}
            placeholder="Cartel Barbearia"
            className="oc-input"
            style={fieldInput}
          />
        </label>
        <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 12, lineHeight: 1.5 }}>
          Ela já nasce ativa e vazia. Cadastre serviços, equipe e clientes pelo painel e, quando
          quiser, defina o administrador em Barbearias → abrir a barbearia.
        </div>
      </Modal>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="oc-card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 500, letterSpacing: "-0.04em", marginTop: 8, color: c.ink }}>{value}</div>
    </div>
  );
}

function PlanosCard({ distrib, ticketMedio }: { distrib: { nome: string; qtd: number; pct: number; cor: string }[]; ticketMedio: number }) {
  return (
    <div className="oc-card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.ink, marginBottom: 16 }}>Distribuição de planos</div>
      {distrib.map((p, i) => (
        <div key={p.nome} style={{ marginBottom: i === 0 ? 16 : 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: c.ink, fontWeight: 600 }}>{p.nome}</span>
            <span style={{ color: c.ink3, fontWeight: 600 }}>{p.qtd}</span>
          </div>
          <div style={{ height: 8, background: c.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 999, background: p.cor }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 18, paddingTop: 14 }}>
        <div style={{ fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>Ticket médio SaaS</div>
        <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em", color: c.ink, marginTop: 4 }}>
          {brl(ticketMedio)}<span style={{ fontSize: 12, fontFamily: font.sans, color: c.ink3, fontWeight: 500 }}>/barbearia</span>
        </div>
      </div>
    </div>
  );
}

/**
 * O que está parado esperando uma decisão sua.
 *
 * Não é um feed de eventos: é o estado atual das barbearias, lido do banco. Por isso
 * cada linha ABRE a barbearia em vez de ter um botão "Resolver" — resolver um cadastro
 * pendente é aprovar ou recusar, e isso acontece no painel dela.
 */
function PendenciasCard({
  itens,
  onAbrir,
  titulo = "Precisa de você",
}: {
  itens: { tenant: Tenant; cor: string; texto: string; acao: string }[];
  onAbrir: (t: Tenant) => void;
  titulo?: string;
}) {
  return (
    <div className="oc-card" style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.015em", color: c.ink, marginBottom: 6 }}>{titulo}</div>
      {itens.length === 0 ? (
        <div style={{ padding: "16px 0", fontSize: 13, color: c.ink3 }}>
          Nada esperando decisão. Cadastros novos aparecem aqui.
        </div>
      ) : (
        itens.map((it, i) => (
          <div key={it.tenant.id ?? it.texto} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: i === 0 ? "none" : `1px solid ${c.borderSoft}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.cor, flex: "none" }} />
            <span style={{ flex: 1, fontSize: 13.5, color: c.ink }}>{it.texto}</span>
            <button
              onClick={() => onAbrir(it.tenant)}
              style={{ border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: c.primaryBtnText, background: c.primaryBtnBg, borderRadius: 999, padding: "4px 12px" }}
            >
              {it.acao}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function TenantsHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "12px 22px", fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600, borderBottom: `1px solid ${c.borderSoft}`, borderTop: `1px solid ${c.borderSoft}` }}>
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
      className="oc-row"
      style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", background: "transparent", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", alignItems: "center", padding: "14px 22px", borderBottom: `1px solid ${c.borderSoft}` }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: c.forest, color: c.neon, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontSize: 11, fontWeight: 700, flex: "none" }}>
          {t.monograma}
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{t.nome}</div>
          <div style={{ fontSize: 11, color: c.ink3 }}>{t.cidade}</div>
        </div>
      </div>
      <div>
        <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: proPlan ? c.forest : c.surfaceAlt, color: proPlan ? c.neon : c.ink2 }}>{t.plano}</span>
      </div>
      <div>
        <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink }}>{t.mrr}</div>
      <div style={{ fontSize: 13.5, color: c.ink3 }}>{t.agendamentosMes}</div>
    </button>
  );
}
