"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import Sidebar from "@/components/admin/Sidebar";
import Topbar from "@/components/admin/Topbar";
import { Tela } from "@/components/admin/Tela";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/lib/firebase/auth";
import { useRelogio } from "@/lib/useRelogio";
import { NavegacaoProvider, useNavegacao } from "@/components/admin/navegacao";
import { saudacaoCompleta } from "@/lib/pessoa";
import { TelaAgenda } from "@/components/admin/telas/Agenda";
import { TelaClientes } from "@/components/admin/telas/Clientes";
import { TelaConfiguracoes } from "@/components/admin/telas/Configuracoes";
import { TelaWhatsapp } from "@/components/admin/telas/Whatsapp";
import { TelaDashboard } from "@/components/admin/telas/Dashboard";
import { TelaPagamentos } from "@/components/admin/telas/Pagamentos";
import { TelaPlanos } from "@/components/admin/telas/Planos";

// O título do /dashboard é montado no render (saudação + quem está logado),
// por isso não entra neste mapa de rótulos fixos.
const titles: Record<string, [string, string]> = {
  "/agenda": ["Operação", "Agenda"],
  "/clientes": ["Relacionamento", "Clientes"],
  "/whatsapp": ["Relacionamento", "WhatsApp"],
  "/planos": ["Catálogo", "Planos & Serviços"],
  "/pagamentos": ["Financeiro", "Pagamentos"],
  "/configuracoes": ["Conta", "Configurações"],
};

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
  const { agora } = useRelogio();

  // O barbeiro é mobile-only: nunca cai no painel desktop — vai para /barbeiro.
  useEffect(() => {
    if (role === "barbeiro") router.replace("/barbeiro");
  }, [role, router]);

  const [eyebrow, title] =
    path === "/dashboard"
      ? ["Visão geral", saudacaoCompleta(agora, profile?.nome)]
      : (titles[path] ?? ["", ""]);

  if (role === "barbeiro") return <div style={{ height: "100vh", background: c.bg }} />;

  return (
    <AuthGuard need="tenant">
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar active={path} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar eyebrow={eyebrow} title={title} />
          {/* As telas ficam montadas o tempo todo; a rota só decide qual
              está visível. Ver components/admin/Tela.tsx. Os page.tsx de cada
              rota são stubs que renderizam null. */}
          <div style={{ flex: 1, minHeight: 0, background: c.bg }}>
            <Tela ativa={path === "/dashboard"}>
              <TelaDashboard />
            </Tela>
            <Tela ativa={path === "/agenda"}>
              <TelaAgenda />
            </Tela>
            <Tela ativa={path === "/clientes"}>
              <TelaClientes />
            </Tela>
            <Tela ativa={path === "/whatsapp"}>
              <TelaWhatsapp />
            </Tela>
            <Tela ativa={path === "/planos"}>
              <TelaPlanos />
            </Tela>
            <Tela ativa={path === "/pagamentos"}>
              <TelaPagamentos />
            </Tela>
            <Tela ativa={path === "/configuracoes"}>
              <TelaConfiguracoes />
            </Tela>
            {children}
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
