"use client";

import { useEffect, type ReactNode } from "react";
import { c, font, shadow } from "@/lib/theme";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 440,
  dark = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
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

  const surface = dark ? c.darkSurface : c.surface;
  const border = dark ? c.darkLine : c.border;
  const titleColor = dark ? "#F2E6D2" : c.inkTitle;
  const closeColor = dark ? c.darkMuted : c.ink3;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(27,19,15,.46)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      className="oc-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="oc-pop"
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflow: "auto",
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 16,
          boxShadow: shadow.pop,
          padding: "22px 24px",
          color: dark ? c.darkText : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: titleColor, flex: 1 }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: closeColor, fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>
        {children}
        {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
