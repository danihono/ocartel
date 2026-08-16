"use client";

// Painel de uma aba do admin, que fica MONTADO mesmo quando não está visível.
//
// Antes, trocar de aba remontava a tela inteira: o DOM era jogado fora e
// recriado, os useState locais eram perdidos e todos os useEffect re-executavam.
// É isso que dava a sensação de reload. Aqui as seis telas são montadas uma vez
// e a troca vira um toggle de `display`.
//
// Dois detalhes fazem isso valer a pena:
//
// 1. Congelamento. Enquanto inativa, a tela re-renderiza o MESMO elemento React
//    da última vez que esteve ativa. Como o React compara elementos por
//    referência, ele descarta a subárvore inteira do trabalho de render — as
//    telas escondidas custam ~0 por atualização do store. (React.Activity, do
//    React 19.2+, faz isso nativamente; quando subirmos a versão, dá para trocar.)
//
// 2. Scroll próprio. Cada tela é o seu próprio container de rolagem, então cada
//    aba lembra onde estava. `display: none` descarta o scrollTop no navegador,
//    então salvamos ao esconder e restauramos antes do paint ao mostrar.

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function Tela({ ativa, children }: { ativa: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<ReactNode>(children);
  const scroll = useRef(0);

  if (ativa) ultimo.current = children;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (ativa) {
      el.scrollTop = scroll.current;
      return () => {
        scroll.current = el.scrollTop;
      };
    }
  }, [ativa]);

  return (
    <div
      ref={ref}
      hidden={!ativa}
      style={{
        display: ativa ? "block" : "none",
        height: "100%",
        overflow: "auto",
        padding: "26px 30px",
      }}
    >
      {ultimo.current}
    </div>
  );
}
