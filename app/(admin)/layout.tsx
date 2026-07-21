"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import Sidebar from "@/components/admin/Sidebar";
import Topbar from "@/components/admin/Topbar";
import AuthGuard from "@/components/auth/AuthGuard";
import { useAuth } from "@/lib/firebase/auth";

const titles: Record<string, [string, string]> = {
  "/dashboard": ["Visão geral", "Bom dia, Marina"],
  "/agenda": ["Operação", "Agenda"],
  "/clientes": ["Relacionamento", "Clientes"],
  "/planos": ["Catálogo", "Planos & Serviços"],
  "/pagamentos": ["Financeiro", "Pagamentos"],
  "/whatsapp": ["Atendimento", "WhatsApp & IA"],
  "/configuracoes": ["Conta", "Configurações"],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { role } = useAuth();

  // O barbeiro é mobile-only: nunca cai no painel desktop — vai para /barbeiro.
  useEffect(() => {
    if (role === "barbeiro") router.replace("/barbeiro");
  }, [role, router]);

  const [eyebrow, title] = titles[path] ?? ["", ""];

  if (role === "barbeiro") return <div style={{ height: "100vh", background: c.bg }} />;

  return (
    <AuthGuard need="tenant">
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar active={path} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar eyebrow={eyebrow} title={title} />
          <div style={{ flex: 1, overflow: "auto", padding: "26px 30px", background: c.bg }}>{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
