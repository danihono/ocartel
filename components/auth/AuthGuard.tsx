"use client";

// Protege as rotas autenticadas. Mostra um splash determinístico (igual no
// servidor e no cliente) enquanto o estado de auth resolve — assim os dados
// assíncronos do Firestore nunca dirigem o 1º paint (evita mismatch de hidratação).

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { useAuth } from "@/lib/firebase/auth";

function Splash() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: c.bg }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, opacity: 0.85 }}>
        <Seal size={52} />
        <div style={{ fontFamily: font.cinzel, fontSize: 13, letterSpacing: 3, color: c.ink3 }}>O CARTEL</div>
      </div>
    </div>
  );
}

// "Liberado nesta sessão" persistido fora do estado do React: sobrevive a
// remontagens do guard durante a navegação (o useState zera ao remontar). Só é
// escrito dentro de efeitos no cliente — nunca no servidor —, então o SSR
// continua determinístico (sempre splash) e o flag não vaza entre requests.
const SESSAO_KEY = "oc_sessao_liberada";
let sessaoLiberada = false;

export default function AuthGuard({ need, children }: { need: "tenant" | "superAdmin"; children: ReactNode }) {
  const { user, role, tenantId, loading } = useAuth();
  const router = useRouter();

  const semLogin = !loading && !user;
  const semPermissao = !loading && !!user && need === "superAdmin" && role !== "superAdmin";
  // superAdmin numa tela de tenant sem ter "entrado" numa barbearia → manda pro
  // console (não é onboarding pendente, é só falta de barbearia selecionada).
  const superSemTenant = !loading && !!user && need === "tenant" && role === "superAdmin" && !tenantId;
  // Logado (admin comum) mas tenant ainda não resolveu (ex.: logo após o
  // onboarding criar o perfil). Não redireciona na hora — espera uma carência.
  const tenantPendente = !loading && !!user && need === "tenant" && role !== "superAdmin" && !tenantId;

  const [carenciaVencida, setCarenciaVencida] = useState(false);
  useEffect(() => {
    if (!tenantPendente) {
      setCarenciaVencida(false);
      return;
    }
    const id = setTimeout(() => setCarenciaVencida(true), 5000);
    return () => clearTimeout(id);
  }, [tenantPendente]);

  // Acesso liberado: auth resolvida + usuário + permissão pro tipo de rota.
  const liberado = !loading && !!user && (need === "superAdmin" ? role === "superAdmin" : !!tenantId);

  // "Sticky": uma vez liberado nesta sessão, nunca mais voltamos a mostrar a
  // splash. Em produção as rotas são pré-renderizadas com loading=true (= splash),
  // e sem isso cada troca de aba pisca o logo por um instante. O guard vive no
  // layout (admin) (persiste entre abas), mas o `sessaoLiberada` de módulo cobre
  // também o caso de o guard remontar — aí o latch continua de pé.
  const [jaLiberou, setJaLiberou] = useState(false);

  // Restaura o latch de uma sessão já autenticada (reload duro / F5): um frame
  // após o paint determinístico, sem quebrar a hidratação.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSAO_KEY) === "1") {
        sessaoLiberada = true;
        setJaLiberou(true);
      }
    } catch {
      /* sem sessionStorage — ignora */
    }
  }, []);

  useEffect(() => {
    if (liberado) {
      sessaoLiberada = true;
      setJaLiberou(true);
      try {
        sessionStorage.setItem(SESSAO_KEY, "1");
      } catch {
        /* ignora */
      }
    }
  }, [liberado]);

  // Logout limpa o latch — senão o próximo usuário pularia a verificação.
  useEffect(() => {
    if (!loading && !user) {
      sessaoLiberada = false;
      try {
        sessionStorage.removeItem(SESSAO_KEY);
      } catch {
        /* ignora */
      }
    }
  }, [loading, user]);

  useEffect(() => {
    if (semLogin) router.replace("/login");
    else if (semPermissao) router.replace("/dashboard");
    else if (superSemTenant) router.replace("/super-admin");
    else if (tenantPendente && carenciaVencida) router.replace("/login");
  }, [semLogin, semPermissao, superSemTenant, tenantPendente, carenciaVencida, router]);

  // Logado e liberado (ou já liberado antes, inclusive via latch de módulo) →
  // conteúdo direto, sem splash. O `!!user` garante que logout (user=null) cai
  // pros redirects abaixo.
  if (!!user && (sessaoLiberada || jaLiberou || liberado)) return <>{children}</>;
  if (loading || semLogin || semPermissao || superSemTenant || tenantPendente) return <Splash />;
  return <>{children}</>;
}
