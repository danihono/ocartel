"use client";

// Contexto de autenticação: escuta onAuthStateChanged e mantém um listener no
// doc users/{uid} (para pegar role/tenantId reativamente — inclusive logo após o
// onboarding criar o doc). É a fonte da verdade de "está logado" e "qual tenant".

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./config";
import { claimsDesatualizados, claimsDoPerfil } from "@/lib/claims";
import { sincronizarClaims } from "@/app/actions/claims";
import type { Role } from "@/lib/types";

// Chave do localStorage para a "impersonação" do superAdmin: a barbearia cujo
// painel ele está visualizando (ferramenta de dev para ver todas as telas).
const IMPERSONATE_KEY = "oc_impersonate";

export interface UserProfile {
  role: Role;
  tenantId: string;
  nome: string;
  email: string;
  /** Vínculo opcional para usuários de papel `barbeiro` → doc em tenants/{t}/barbeiros. */
  barbeiroId?: string;
}

interface AuthValue {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  /** Tenant EFETIVO: o do próprio perfil ou, p/ superAdmin, a barbearia que ele entrou. */
  tenantId: string | null;
  /** Tenant real do perfil (null para superAdmin, que não tem barbearia própria). */
  ownTenantId: string | null;
  /** superAdmin visualizando o painel de uma barbearia (impersonação). */
  impersonating: boolean;
  /** Entra no painel de uma barbearia — só tem efeito para superAdmin. */
  enterTenant: (tenantId: string) => void;
  /** Sai da impersonação e volta a ser superAdmin puro. */
  exitTenant: () => void;
  /** true enquanto o estado de auth (e o 1º carregamento do perfil) não resolveu. */
  loading: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonatedTenantId, setImpersonatedTenantId] = useState<string | null>(null);

  // Hidrata a impersonação salva — só no cliente, para o 1º render continuar
  // determinístico (igual ao servidor) e não quebrar a hidratação.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(IMPERSONATE_KEY);
      if (saved) setImpersonatedTenantId(saved);
    } catch {
      /* sem localStorage — ignora */
    }
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      unsubProfile?.();
      unsubProfile = undefined;

      if (u) {
        setLoading(true);
        unsubProfile = onSnapshot(
          doc(db, "users", u.uid),
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
            setLoading(false);
          },
          () => {
            setProfile(null);
            setLoading(false);
          },
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  // Mantém os custom claims em dia com o doc users/{uid}. Roda aqui (e não só no
  // login) para que as contas que já existiam ganhem claims sozinhas no primeiro
  // acesso — sem depender de alguém lembrar de rodar o backfill. A assinatura
  // evita repetir a chamada a cada snapshot do perfil.
  const claimsSincronizados = useRef("");
  useEffect(() => {
    if (!user || !profile) return;
    const alvo = claimsDoPerfil(profile as unknown as Record<string, unknown>);
    if (!alvo) return;

    const assinatura = `${user.uid}:${alvo.role}:${alvo.tenantId}:${alvo.barbeiroId ?? ""}`;
    if (claimsSincronizados.current === assinatura) return;
    claimsSincronizados.current = assinatura;

    let cancelado = false;
    void (async () => {
      try {
        const atual = await user.getIdTokenResult();
        if (!claimsDesatualizados(atual.claims as Record<string, unknown>, alvo)) return;
        const { atualizado } = await sincronizarClaims(await user.getIdToken());
        // Claim só entra no token numa nova emissão — sem isto as regras só
        // enxergariam o papel novo no próximo refresh (até 1h depois).
        if (atualizado && !cancelado) await user.getIdToken(true);
      } catch {
        // Não pode derrubar a sessão: as regras ainda resolvem o papel pelo doc
        // users/{uid}, então no pior caso seguimos no caminho antigo.
        claimsSincronizados.current = "";
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [user, profile]);

  const enterTenant = useCallback((tenantId: string) => {
    setImpersonatedTenantId(tenantId);
    try {
      localStorage.setItem(IMPERSONATE_KEY, tenantId);
    } catch {
      /* ignora */
    }
  }, []);

  const exitTenant = useCallback(() => {
    setImpersonatedTenantId(null);
    try {
      localStorage.removeItem(IMPERSONATE_KEY);
    } catch {
      /* ignora */
    }
  }, []);

  const role = profile?.role ?? null;
  const ownTenantId = profile?.tenantId ?? null;
  const isSuper = role === "superAdmin";
  // Só o superAdmin (que não tem barbearia própria) pode impersonar.
  const impersonating = isSuper && !ownTenantId && !!impersonatedTenantId;
  const effectiveTenantId = ownTenantId ?? (isSuper ? impersonatedTenantId : null);

  const value: AuthValue = {
    user,
    profile,
    role,
    tenantId: effectiveTenantId,
    ownTenantId,
    impersonating,
    enterTenant,
    exitTenant,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

export async function signOutApp() {
  try {
    localStorage.removeItem(IMPERSONATE_KEY);
  } catch {
    /* ignora */
  }
  await signOut(auth);
}
