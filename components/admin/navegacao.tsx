"use client";

// Navegação entre as abas do painel SEM passar pelo roteador do Next.
//
// Por quê: em produção, clicar numa aba disparava uma RECARGA COMPLETA da
// página. O roteador tentava a navegação interna (os prefetches `?_rsc=` saíam e
// voltavam 200) e desistia, caindo para `window.location`. Medido no site
// publicado: 29 requisições por clique, 12 chunks de JS baixados de novo, o
// login reconferido em `identitytoolkit` e todos os listeners do Firestore
// reabertos — ~300 ms de tela vazia a cada troca de aba.
//
// Como as seis telas já ficam montadas ao mesmo tempo (components/admin/Tela.tsx),
// trocar de aba não precisa de navegação nenhuma: basta trocar qual está visível
// e atualizar a URL com `history.pushState`. Sem requisição RSC, não há o que a
// CDN atrapalhar — a troca fica instantânea independente de como o Hosting se
// comporta.
//
// A URL continua sendo a fonte da verdade: F5, link direto e os botões
// voltar/avançar do navegador seguem funcionando (o `popstate` abaixo cuida
// disso). Navegações que SAEM do painel (/login, /super-admin, /barbeiro)
// continuam usando o roteador do Next normalmente.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface Navegacao {
  /** Rota da aba visível. */
  rota: string;
  /** Troca de aba: atualiza a URL e a tela, sem navegação do Next. */
  ir: (href: string) => void;
}

const NavegacaoContext = createContext<Navegacao | null>(null);

export function NavegacaoProvider({ children }: { children: ReactNode }) {
  // O 1º render usa o pathname do Next (correto no SSR e na hidratação); a
  // partir daí o estado local manda.
  const pathNext = usePathname();
  const [rota, setRota] = useState(pathNext);

  // Botões voltar/avançar do navegador.
  useEffect(() => {
    const onPop = () => setRota(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Se uma navegação de verdade do Next acontecer (ex.: um redirect do
  // AuthGuard), acompanha.
  useEffect(() => {
    setRota(pathNext);
  }, [pathNext]);

  const ir = useCallback((href: string) => {
    if (window.location.pathname === href) return;
    window.history.pushState(null, "", href);
    setRota(href);
  }, []);

  const value = useMemo<Navegacao>(() => ({ rota, ir }), [rota, ir]);
  return <NavegacaoContext.Provider value={value}>{children}</NavegacaoContext.Provider>;
}

export function useNavegacao(): Navegacao {
  const ctx = useContext(NavegacaoContext);
  if (!ctx) throw new Error("useNavegacao precisa estar dentro de <NavegacaoProvider>");
  return ctx;
}

/**
 * Link de aba. Continua sendo um `<a href>` de verdade — abrir em nova aba
 * (ctrl/cmd/meio), "copiar endereço" e o preview da URL no rodapé do navegador
 * seguem funcionando. Só o clique simples é interceptado.
 */
export function LinkAba({
  href,
  children,
  style,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  style?: React.CSSProperties;
  onNavigate?: () => void;
}) {
  const { ir } = useNavegacao();
  return (
    <a
      href={href}
      style={{ textDecoration: "none", color: "inherit", ...style }}
      onClick={(e) => {
        // Deixa o navegador cuidar de ctrl/cmd/shift/alt-clique e do botão do meio.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onNavigate?.();
        ir(href);
      }}
    >
      {children}
    </a>
  );
}
