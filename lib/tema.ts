"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAVE_TEMA as CHAVE } from "./tema-script";

// Tema claro/escuro. A preferência fica no navegador ("light" | "dark" | "system");
// sem preferência salva, segue o sistema. O tema efetivo vira `data-theme` no <html>,
// e as variáveis de app/globals.css fazem o resto.

export type Tema = "light" | "dark" | "system";

function ler(): Tema {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function sistemaEscuro(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function aplicar(tema: Tema) {
  const escuro = tema === "dark" || (tema === "system" && sistemaEscuro());
  const r = document.documentElement;
  r.setAttribute("data-theme", escuro ? "dark" : "light");
  r.style.colorScheme = escuro ? "dark" : "light";
}

export function useTema(): { tema: Tema; escuro: boolean; setTema: (t: Tema) => void } {
  // Começa em "system" no SSR e no primeiro render; o efeito lê o salvo.
  const [tema, setTemaState] = useState<Tema>("system");
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const t = ler();
    setTemaState(t);
    setEscuro(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  // Seguindo o sistema, acompanha a troca do SO ao vivo.
  useEffect(() => {
    if (tema !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      aplicar("system");
      setEscuro(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [tema]);

  const setTema = useCallback((t: Tema) => {
    try {
      if (t === "system") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, t);
    } catch {
      /* navegação privada: vale só nesta aba */
    }
    aplicar(t);
    setTemaState(t);
    setEscuro(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  return { tema, escuro, setTema };
}
