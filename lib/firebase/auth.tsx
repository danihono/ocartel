"use client";

// Contexto de autenticação: escuta onAuthStateChanged e mantém um listener no
// doc users/{uid} (para pegar role/tenantId reativamente — inclusive logo após o
// onboarding criar o doc). É a fonte da verdade de "está logado" e "qual tenant".

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./config";
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
