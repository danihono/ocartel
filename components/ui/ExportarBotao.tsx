"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import type { FormatoExportacao } from "@/lib/exportar";

/**
 * Botão "Exportar" com a escolha do formato. Quem usa passa só o que fazer com o formato
 * escolhido — montar as linhas acontece no clique, não a cada render.
 */
export function ExportarBotao({
  onExportar,
  label = "Exportar",
  disabled,
}: {
  onExportar: (formato: FormatoExportacao) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function exportar(f: FormatoExportacao) {
    setAberto(false);
    setOcupado(true);
    try {
      await onExportar(f);
    } catch {
      toast("Não foi possível exportar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        className="oc-btn oc-btn-ghost oc-btn-sm"
        onClick={() => setAberto((a) => !a)}
        disabled={disabled || ocupado}
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Icon name="download" size={15} />
        {ocupado ? "Gerando…" : label}
      </button>
      {aberto ? (
        <div className="oc-menu oc-pop" role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 200, zIndex: 30 }}>
          <button role="menuitem" className="oc-menu-item" onClick={() => exportar("xlsx")}>
            <Icon name="grafico" size={16} />
            <span style={{ flex: 1 }}>Excel</span>
            <span style={{ fontSize: 11, color: "var(--oc-muted)" }}>.xlsx</span>
          </button>
          <button role="menuitem" className="oc-menu-item" onClick={() => exportar("csv")}>
            <Icon name="copiar" size={16} />
            <span style={{ flex: 1 }}>CSV</span>
            <span style={{ fontSize: 11, color: "var(--oc-muted)" }}>.csv</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
