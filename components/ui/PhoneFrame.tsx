"use client";

// Moldura de celular reutilizável — o mesmo "mockup" mobile-only da tela do
// cliente (/book), extraído para reuso na tela do barbeiro (/barbeiro). É uma
// restrição puramente visual (largura fixa 392×812 centralizada), sem media
// query nem detecção de dispositivo. Num celular real ocupa a tela toda.

import type { ReactNode } from "react";
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";

export function PhoneFrame({
  title,
  subtitle,
  right,
  bg = c.bg,
  children,
}: {
  /** Título do header escuro (ex.: nome da barbearia). Omita p/ esconder o header. */
  title?: string;
  subtitle?: string;
  /** Elemento à direita do header (ex.: avatar). */
  right?: ReactNode;
  /** Cor do "tampo" atrás da moldura (desktop). */
  bg?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "36px 20px" }}>
      <div style={{ width: 392, height: 812, background: c.espressoDeep, borderRadius: 46, padding: 11, boxShadow: shadow.phone }}>
        <div style={{ position: "relative", width: "100%", height: "100%", background: c.surfaceAlt, borderRadius: 36, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* status bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", zIndex: 5, color: c.darkText, fontSize: 12, fontWeight: 600 }}>
            <span>9:41</span>
            <div style={{ width: 120, height: 26, background: c.espressoDeep, borderRadius: "0 0 16px 16px", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0 }} />
            <span>● ● ●</span>
          </div>

          {/* header escuro (opcional) */}
          {title ? (
            <div style={{ background: c.espressoDeep, color: c.darkText, padding: "46px 22px 18px", flex: "none", display: "flex", alignItems: "center", gap: 11 }}>
              <Seal size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 14.5, letterSpacing: 1.5, color: c.darkText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                {subtitle ? <div style={{ fontSize: 11.5, color: c.darkMuted, marginTop: 2 }}>{subtitle}</div> : null}
              </div>
              {right}
            </div>
          ) : null}

          {/* corpo — preenche o restante; o consumidor controla scroll/rodapé */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
