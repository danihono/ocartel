"use client";

// Renderiza listas longas em blocos, em vez de despejar tudo de uma vez.
//
// As telas do painel ficam montadas o tempo todo (ver components/admin/Tela.tsx),
// então uma lista sem corte não custa caro só no primeiro render: os nós ficam
// no documento para sempre e encarecem cada recálculo de estilo/layout do
// navegador — inclusive o de mostrar/esconder outra aba. Medindo com 800
// clientes e 8000 cobranças, o painel ia a ~96 mil nós no DOM.
//
// `chave` é a identidade do recorte atual (filtro + busca + tipo): quando ela
// muda, o corte volta ao início.

import { useState } from "react";

const PAGINA = 60;

export function useListaProgressiva<T>(lista: T[], chave: string, pagina: number = PAGINA) {
  // Ajuste de estado durante o render (padrão recomendado pelo React para
  // "resetar quando um prop muda"): evita o render extra de um useEffect.
  const [ctrl, setCtrl] = useState({ chave, limite: pagina });
  if (ctrl.chave !== chave) setCtrl({ chave, limite: pagina });
  const limite = ctrl.chave === chave ? ctrl.limite : pagina;

  const visiveis = limite >= lista.length ? lista : lista.slice(0, limite);
  return {
    visiveis,
    restantes: lista.length - visiveis.length,
    mostrarMais: () => setCtrl((a) => ({ ...a, limite: a.limite + pagina * 4 })),
  };
}
