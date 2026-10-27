"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { c, shadow } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";

type Tone = "success" | "info" | "error";
/** Ação opcional no toast (ex.: "Desfazer" logo depois de mudar um status). */
export interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  msg: string;
  tone: Tone;
  action?: ToastAction;
}

const ToastContext = createContext<{ toast: (msg: string, tone?: Tone, action?: ToastAction) => void } | null>(null);

// Com ação dá tempo de reagir; sem ação, some rápido.
const MS_SIMPLES = 2800;
const MS_COM_ACAO = 7000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((msg: string, tone: Tone = "success", action?: ToastAction) => {
    seq.current += 1;
    const id = seq.current;
    setItems((list) => [...list, { id, msg, tone, action }]);
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), action ? MS_COM_ACAO : MS_SIMPLES);
  }, []);

  // Pílula floresta (escura em qualquer tema) com o ícone do tom em neon/vermelho.
  const toneIcon: Record<Tone, { icon: IconName; cor: string }> = {
    success: { icon: "check", cor: c.neon },
    info: { icon: "info", cor: c.neon },
    error: { icon: "alerta", cor: "#FF8A9A" },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        style={{ position: "fixed", bottom: 22, left: 16, right: 16, zIndex: 60, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", pointerEvents: "none" }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="oc-toast"
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 11,
              background: c.forest,
              color: c.darkText,
              border: `1px solid ${c.espressoLine}`,
              borderRadius: 999,
              padding: "10px 12px 10px 14px",
              boxShadow: shadow.pop,
              fontSize: 13.5,
              fontWeight: 500,
              maxWidth: 440,
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(183,255,24,.14)", color: toneIcon[t.tone].cor, display: "grid", placeItems: "center", flex: "none" }}>
              <Icon name={toneIcon[t.tone].icon} size={13} stroke={2.4} />
            </span>
            <span style={{ flex: 1, paddingRight: t.action ? 0 : 6 }}>{t.msg}</span>
            {t.action ? (
              <button
                onClick={() => {
                  t.action?.onClick();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
                style={{
                  flex: "none",
                  border: "none",
                  background: c.neon,
                  color: c.onNeon,
                  borderRadius: 999,
                  padding: "6px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx.toast;
}
