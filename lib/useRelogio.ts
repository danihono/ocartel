"use client";

// Relógio do cliente, SSR-safe: começa com as constantes determinísticas
// (HOJE_ISO/AGORA_HHMM — iguais no servidor e no 1º render) e, após o mount,
// passa a refletir a data/hora REAIS do navegador, atualizando a cada minuto.
// Use isto em telas onde "hoje"/"agora" precisam ser reais (agenda, KPIs,
// atraso de cobrança) em vez da semente fixa.

import { useEffect, useState } from "react";
import { AGORA_HHMM, HOJE_ISO, agoraHHMM, hojeLocalISO } from "./date";

export function useRelogio(): { hoje: string; agora: string } {
  const [t, setT] = useState({ hoje: HOJE_ISO, agora: AGORA_HHMM });
  useEffect(() => {
    const tick = () => setT({ hoje: hojeLocalISO(), agora: agoraHHMM() });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

/** Conveniência quando só interessa a data de hoje (real, pós-mount). */
export function useHoje(): string {
  return useRelogio().hoje;
}
