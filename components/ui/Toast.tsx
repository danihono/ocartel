"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { c, shadow } from "@/lib/theme";

type Tone = "success" | "info" | "error";
interface ToastItem {
  id: number;
  msg: string;
  tone: Tone;
}

const ToastContext = createContext<{ toast: (msg: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((msg: string, tone: Tone = "success") => {
    seq.current += 1;
    const id = seq.current;
    setItems((list) => [...list, { id, msg, tone }]);
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 2800);
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
              color: "#E8DAC0",
              borderRadius: 11,
              padding: "12px 16px 12px 13px",
              boxShadow: shadow.pop,
              fontSize: 13.5,
              fontWeight: 600,
              maxWidth: 340,
              borderLeft: `3px solid ${toneColor[t.tone]}`,
            }}
          >
            {t.msg}
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
