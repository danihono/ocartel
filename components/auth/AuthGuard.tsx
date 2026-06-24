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

  useEffect(() => {
    if (semLogin) router.replace("/login");
    else if (semPermissao) router.replace("/dashboard");
    else if (superSemTenant) router.replace("/super-admin");
    else if (tenantPendente && carenciaVencida) router.replace("/login");
  }, [semLogin, semPermissao, superSemTenant, tenantPendente, carenciaVencida, router]);

  if (loading || semLogin || semPermissao || superSemTenant || tenantPendente) return <Splash />;
  return <>{children}</>;
}
