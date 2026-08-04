"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { c, shadow } from "@/lib/theme";

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

  const toneColor: Record<Tone, string> = { success: c.accentDark, info: c.brass, error: c.red };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 60, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        {items.map((t) => (
          <div
            key={t.id}
            className="oc-toast"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              background: c.espresso,
              color: c.darkText,
              borderRadius: 11,
              padding: "12px 16px 12px 13px",
              boxShadow: shadow.pop,
              fontSize: 13.5,
              fontWeight: 600,
              maxWidth: 340,
              borderLeft: `3px solid ${toneColor[t.tone]}`,
            }}
          >
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action ? (
              <button
                onClick={() => {
                  t.action?.onClick();
                  setItems((list) => list.filter((x) => x.id !== t.id));
                }}
                style={{
                  flex: "none",
                  // accentDark é o hero sobre o shell escuro — o brass some no espresso.
                  border: `1px solid ${c.accentDark}`,
                  background: "transparent",
                  color: c.accentDark,
                  borderRadius: 8,
                  padding: "5px 11px",
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
