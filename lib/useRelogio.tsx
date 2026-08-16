"use client";

// Relógio do app, SSR-safe e ÚNICO. Vive num provider na raiz (app/providers.tsx),
// então:
//   - resolve a data/hora reais uma só vez, no mount da árvore inteira;
//   - as telas leem um valor JÁ correto — antes, cada tela guardava seu próprio
//     estado começando na semente (HOJE_ISO/AGORA_HHMM) e trocava para a data real
//     num layout-effect, o que rendia DOIS renders por montagem, o primeiro deles
//     calculando tudo com a data errada;
//   - existe um único setInterval, e não um por tela.
//
// O 1º render (SSR + 1ª hidratação) continua determinístico: começa nas constantes
// da semente e só depois do mount passa para o relógio real.

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { AGORA_HHMM, HOJE_ISO, agoraHHMM, hojeLocalISO } from "./date";

export interface Relogio {
  hoje: string;
  agora: string;
}

// O 1º tick roda ANTES do paint (useLayoutEffect) — assim a data/hora-semente
// nunca chega a aparecer na tela. No servidor cai para useEffect (no-op visual),
// mantendo o 1º render determinístico.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const SEMENTE: Relogio = { hoje: HOJE_ISO, agora: AGORA_HHMM };
const RelogioContext = createContext<Relogio>(SEMENTE);

export function RelogioProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Relogio>(SEMENTE);

  useIsoLayoutEffect(() => {
    setT({ hoje: hojeLocalISO(), agora: agoraHHMM() });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const novo = { hoje: hojeLocalISO(), agora: agoraHHMM() };
      // Só dispara render quando o minuto realmente virou.
      setT((atual) => (atual.hoje === novo.hoje && atual.agora === novo.agora ? atual : novo));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return <RelogioContext.Provider value={t}>{children}</RelogioContext.Provider>;
}

export function useRelogio(): Relogio {
  return useContext(RelogioContext);
}

/** Conveniência quando só interessa a data de hoje (real, pós-mount). */
export function useHoje(): string {
  return useContext(RelogioContext).hoje;
}
