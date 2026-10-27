// Fica fora de lib/tema.ts (que é "use client") porque o app/layout.tsx, um server
// component, precisa da string em si, e não de uma referência de cliente.

export const CHAVE_TEMA = "ocartel.tema";

/**
 * Roda no <head>, antes da primeira pintura, para a página não piscar no tema errado.
 * Precisa ser autocontido (vira string inline).
 */
export const SCRIPT_TEMA = `(function(){try{var v=localStorage.getItem("${CHAVE_TEMA}");var s=window.matchMedia("(prefers-color-scheme: dark)").matches;var e=v==="dark"||((v===null||v==="system")&&s);var r=document.documentElement;r.setAttribute("data-theme",e?"dark":"light");r.style.colorScheme=e?"dark":"light";}catch(_){}})();`;
