"use client";

// Casca das telas mobile-first (/book e /barbeiro). No celular ocupa a tela inteira,
// sem moldura nenhuma; no desktop vira um cartão alto centralizado sobre a página
// pontilhada. Antes era um "mockup" de iPhone com relógio 9:41 falso: num celular de
// verdade ele desenhava um celular dentro do celular.

import type { ReactNode } from "react";
import { Seal } from "@/components/ui/Seal";

export function PhoneFrame({
  title,
  subtitle,
  right,
  children,
}: {
  /** Título do cabeçalho floresta (ex.: nome da barbearia). Omita p/ esconder o cabeçalho. */
  title?: string;
  subtitle?: string;
  /** Elemento à direita do cabeçalho (ex.: avatar). */
  right?: ReactNode;
  /** Legado: a cor do fundo agora vem do tema. */
  bg?: string;
  children: ReactNode;
}) {
  return (
    <div className="oc-phone-wrap oc-public-bg">
      <div className="oc-phone">
        {title ? (
          <div className="oc-phone-head oc-card-hero">
            <Seal size={42} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="oc-wordmark" style={{ fontSize: 14.5, letterSpacing: "0.12em", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {title}
              </div>
              {subtitle ? (
                <div style={{ fontSize: 11.5, color: "var(--oc-on-forest-dim)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
              ) : null}
            </div>
            {right}
          </div>
        ) : null}

        {/* corpo — preenche o restante; o consumidor controla scroll/rodapé */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
    </div>
  );
}
