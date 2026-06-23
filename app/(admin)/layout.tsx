"use client";

import { usePathname } from "next/navigation";
import { c } from "@/lib/theme";
import Sidebar from "@/components/admin/Sidebar";
import Topbar from "@/components/admin/Topbar";

const titles: Record<string, [string, string]> = {
  "/dashboard": ["Visão geral", "Bom dia, Marina"],
  "/agenda": ["Operação", "Agenda"],
  "/clientes": ["Relacionamento", "Clientes"],
  "/planos": ["Catálogo", "Planos & Serviços"],
  "/pagamentos": ["Financeiro", "Pagamentos"],
  "/configuracoes": ["Conta", "Configurações"],
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [eyebrow, title] = titles[path] ?? ["", ""];

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar active={path} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar eyebrow={eyebrow} title={title} />
        <div style={{ flex: 1, overflow: "auto", padding: "26px 30px", background: c.bg }}>{children}</div>
      </div>
    </div>
  );
}
