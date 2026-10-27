"use client";

import { useEffect, type ReactNode } from "react";
import { c, shadow } from "@/lib/theme";
import { Icon } from "./Icon";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Legado: o console era escuro fixo. O tema agora é global, então é ignorado. */
  dark?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--oc-overlay)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      className="oc-fade"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="oc-pop"
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "92vh",
          overflow: "auto",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 22,
          boxShadow: shadow.modal,
          padding: "22px 24px 24px",
          color: c.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.03em", color: c.ink, flex: 1, minWidth: 0 }}>{title}</span>
          <button onClick={onClose} aria-label="Fechar" className="oc-icon-btn">
            <Icon name="fechar" size={16} />
          </button>
        </div>
        {children}
        {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, flexWrap: "wrap" }}>{footer}</div> : null}
      </div>
    </div>
  );
}
