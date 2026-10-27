"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import Sidebar from "@/components/admin/Sidebar";
import Topbar from "@/components/admin/Topbar";
import { Tela } from "@/components/admin/Tela";
import AuthGuard from "@/components/auth/AuthGuard";
import { AguardandoAprovacao } from "@/components/auth/AguardandoAprovacao";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useRelogio } from "@/lib/useRelogio";
import { NavegacaoProvider, useNavegacao } from "@/components/admin/navegacao";
import { saudacaoCompleta } from "@/lib/pessoa";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatBRL, selectContagensCliente, selectKpiAgendamentosHoje, selectResumoFinanceiro } from "@/lib/selectors";
import type { AppState } from "@/lib/store";
import { TelaAgenda } from "@/components/admin/telas/Agenda";
import { TelaClientes } from "@/components/admin/telas/Clientes";
import { TelaConfiguracoes } from "@/components/admin/telas/Configuracoes";
import { TelaWhatsapp } from "@/components/admin/telas/Whatsapp";
import { TelaDashboard } from "@/components/admin/telas/Dashboard";
import { TelaPagamentos } from "@/components/admin/telas/Pagamentos";
import { TelaComissoes } from "@/components/admin/telas/Comissoes";
import { TelaPlanos } from "@/components/admin/telas/Planos";
import { TelaRelatorios } from "@/components/admin/telas/Relatorios";

// Cabeçalho de cada aba: eyebrow + título em dois tons. O subtítulo (o tom apagado)
// sai do estado ao vivo, então já diz alguma coisa sobre o dia em vez de repetir o nome.
type Cabecalho = { eyebrow: string; title: string; subtitle?: ReactNode; live?: boolean };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function cabecalhos(state: AppState, hoje: string, agora: string, nome?: string | null): Record<string, Cabecalho> {
  const ag = selectKpiAgendamentosHoje(state, hoje);
  const cli = selectContagensCliente(state, hoje);
  const fin = selectResumoFinanceiro(state, hoje);
  const sug = state.sugestoes.length;
  const hojeTxt = ag.total ? `${plural(ag.total, "horário", "horários")} hoje.` : "Agenda livre hoje.";
  return {
    "/dashboard": {
      eyebrow: "Visão geral",
      title: `${saudacaoCompleta(agora, nome)}.`,
      subtitle: ag.total ? `${hojeTxt.replace(".", "")}, ${plural(ag.aguardando, "aguardando", "aguardando")} confirmação.` : hojeTxt,
      live: true,
    },
    "/agenda": { eyebrow: "Operação", title: "Agenda.", subtitle: hojeTxt, live: ag.total > 0 },
    "/clientes": {
      eyebrow: "Relacionamento",
      title: "Clientes.",
      subtitle: cli.Todos ? `${plural(cli.Todos, "cliente", "clientes")} na base, ${cli.VIP} VIP.` : "Sua base começa aqui.",
    },
    "/whatsapp": {
      eyebrow: "Relacionamento",
      title: "WhatsApp.",
      subtitle: sug ? `${plural(sug, "sugestão esperando", "sugestões esperando")} você.` : "Conversas com os seus clientes.",
      live: sug > 0,
    },
    "/planos": {
      eyebrow: "Catálogo",
      title: "Planos & serviços.",
      subtitle: `${plural(state.planos.length, "plano", "planos")}, ${plural(state.servicos.length, "serviço", "serviços")}.`,
    },
    "/pagamentos": {
      eyebrow: "Financeiro",
      title: "Pagamentos.",
      subtitle: `${formatBRL(fin.recebidoMes)} recebidos no mês.`,
    },
    "/comissoes": {
      eyebrow: "Financeiro",
      title: "Comissões.",
      subtitle: `${plural(state.barbeiros.length, "barbeiro", "barbeiros")} no time.`,
    },
    "/relatorios": { eyebrow: "Análise", title: "Relatórios.", subtitle: "Como a barbearia foi no período." },
    "/configuracoes": { eyebrow: "Conta", title: "Configurações.", subtitle: state.config.nome ? `${state.config.nome}.` : undefined },
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <NavegacaoProvider>
      <PainelAdmin>{children}</PainelAdmin>
    </NavegacaoProvider>
  );
}

function PainelAdmin({ children }: { children: React.ReactNode }) {
  // `rota` vem do pushState, não do roteador do Next — ver components/admin/navegacao.tsx.
  const { rota: path } = useNavegacao();
  const router = useRouter();
  const { role, profile } = useAuth();
  const { agora, hoje } = useRelogio();
  const { state } = useStore();
  // Drawer do menu no celular.
  const [menuAberto, setMenuAberto] = useState(false);

  // O barbeiro é mobile-only: nunca cai no painel desktop — vai para /barbeiro.
  useEffect(() => {
    if (role === "barbeiro") router.replace("/barbeiro");
  }, [role, router]);

  const heads = cabecalhos(state, hoje, agora, profile?.nome);
  const head = (rota: string) => {
    const h = heads[rota];
    return h ? <PageHeader {...h} /> : null;
  };

  if (role === "barbeiro") return <div style={{ height: "100vh", background: c.bg }} />;

  // Barbearia cadastrada e ainda não aprovada: o painel inteiro fica atrás da espera.
  // O super admin não passa por aqui — ele entra por impersonação justamente para
  // conferir a barbearia ANTES de aprovar.
  const tenant = state.tenants[0];
  if (role !== "superAdmin" && tenant?.status === "pendente") {
    return <AguardandoAprovacao barbearia={tenant.nome} email={profile?.email} />;
  }

  return (
    <AuthGuard need="tenant">
      <div className="oc-shell">
        <Sidebar active={path} aberto={menuAberto} onFechar={() => setMenuAberto(false)} />
        {menuAberto ? (
          <div className="oc-only-mobile oc-fade" onClick={() => setMenuAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 65, background: "var(--oc-overlay)" }} />
        ) : null}
        <div className="oc-main">
          <Topbar title={path === "/dashboard" ? "Dashboard" : (heads[path]?.title.replace(/\.$/, "") ?? "")} onMenu={() => setMenuAberto(true)} />
          {/* As telas ficam montadas o tempo todo; a rota só decide qual
              está visível. Ver components/admin/Tela.tsx. Os page.tsx de cada
              rota são stubs que renderizam null. */}
          <div style={{ flex: 1, minHeight: 0, background: c.bg }}>
            <Tela ativa={path === "/dashboard"} header={head("/dashboard")}>
              <TelaDashboard />
            </Tela>
            <Tela ativa={path === "/agenda"} header={head("/agenda")} cheia>
              <TelaAgenda />
            </Tela>
            <Tela ativa={path === "/clientes"} header={head("/clientes")} cheia>
              <TelaClientes />
            </Tela>
            <Tela ativa={path === "/whatsapp"} header={head("/whatsapp")} cheia>
              <TelaWhatsapp />
            </Tela>
            <Tela ativa={path === "/planos"} header={head("/planos")}>
              <TelaPlanos />
            </Tela>
            <Tela ativa={path === "/pagamentos"} header={head("/pagamentos")}>
              <TelaPagamentos />
            </Tela>
            <Tela ativa={path === "/comissoes"} header={head("/comissoes")}>
              <TelaComissoes />
            </Tela>
            <Tela ativa={path === "/relatorios"} header={head("/relatorios")}>
              <TelaRelatorios />
            </Tela>
            <Tela ativa={path === "/configuracoes"} header={head("/configuracoes")}>
              <TelaConfiguracoes />
            </Tela>
            {children}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
