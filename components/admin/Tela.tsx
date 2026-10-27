"use client";

// Painel de uma aba do admin, que fica MONTADO mesmo quando não está visível.
//
// Antes, trocar de aba remontava a tela inteira: o DOM era jogado fora e
// recriado, os useState locais eram perdidos e todos os useEffect re-executavam.
// É isso que dava a sensação de reload. Aqui as telas são montadas uma vez
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
//
// 3. Montagem preguiçosa. Uma aba só é construída na primeira vez que é aberta —
//    abrir o painel não paga o custo de todas de uma vez. Depois disso ela nunca
//    mais é desmontada, e voltar nela é só o toggle de `display`.
//
// `header` é o PageHeader da aba (rola junto com o conteúdo). `cheia` é para as telas
// que ocupam a altura inteira com rolagem própria (Agenda, Clientes, WhatsApp): o
// conteúdo ganha exatamente o espaço que sobra abaixo do cabeçalho.

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function Tela({ ativa, header, cheia = false, children }: { ativa: boolean; header?: ReactNode; cheia?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<ReactNode>(null);
  const scroll = useRef(0);

  if (ativa) ultimo.current = children;
  const jaAberta = ultimo.current !== null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ativa) return;
    el.scrollTop = scroll.current;
    return () => {
      scroll.current = el.scrollTop;
    };
  }, [ativa]);

  if (!jaAberta) return null;

  return (
    <div ref={ref} hidden={!ativa} className="oc-tela" style={{ display: ativa ? "block" : "none" }}>
      <div
        className="oc-tela-inner"
        style={cheia ? { height: "100%", display: "flex", flexDirection: "column", paddingBottom: 24 } : undefined}
      >
        {header}
        {cheia ? <div style={{ flex: "1 1 0", minHeight: 0 }}>{ultimo.current}</div> : ultimo.current}
      </div>
    </div>
  );
}
