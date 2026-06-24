"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { c, font, shadow } from "@/lib/theme";
import { isoParaLabel, HOJE_ISO } from "@/lib/date";
import { NovoAgendamentoModal } from "@/components/admin/NovoAgendamentoModal";

export default function Topbar({ eyebrow, title }: { eyebrow: string; title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);

  function buscar(valor: string) {
    setQ(valor);
    if (pathname === "/clientes") router.replace(`/clientes?q=${encodeURIComponent(valor)}`);
  }

  return (
    <header
      style={{
        height: 74,
        background: c.surface,
        borderBottom: `1px solid ${c.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 30px",
        gap: 18,
        flex: "none",
      }}
    >
      <div style={{ flex: "none" }}>
        <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: c.ink4, fontWeight: 600, whiteSpace: "nowrap" }}>
          {eyebrow}
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: c.inkTitle, marginTop: 1, whiteSpace: "nowrap" }}>
          {title}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/clientes?q=${encodeURIComponent(q)}`);
        }}
        style={{
          flex: 1,
          minWidth: 120,
          maxWidth: 230,
          display: "flex",
          alignItems: "center",
          background: c.surfaceWarm,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          padding: "9px 13px",
          gap: 9,
          color: c.ink4,
        }}
      >
        <span style={{ width: 13, height: 13, border: `1.6px solid ${c.ink4}`, borderRadius: "50%", display: "inline-block", flex: "none" }} />
        <input
          value={q}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Buscar cliente…"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: c.inkTitle, fontFamily: font.sans }}
        />
      </form>

      <div style={{ fontSize: 13, color: c.inkLabel, fontWeight: 600, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 13px", whiteSpace: "nowrap" }}>
        {isoParaLabel(HOJE_ISO)}
      </div>

      <button
        onClick={() => setNovo(true)}
        className="oc-btn oc-btn-primary"
        style={{
          border: "none",
          cursor: "pointer",
          background: c.primaryBtnBg,
          color: c.primaryBtnText,
          padding: "11px 16px",
          borderRadius: 12,
          fontSize: 13.5,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: shadow.glow,
        }}
      >
        + Novo agendamento
      </button>

      <NovoAgendamentoModal open={novo} onClose={() => setNovo(false)} />
    </header>
  );
}
