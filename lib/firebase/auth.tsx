"use client";

// Contexto de autenticação: escuta onAuthStateChanged e mantém um listener no
// doc users/{uid} (para pegar role/tenantId reativamente — inclusive logo após o
// onboarding criar o doc). É a fonte da verdade de "está logado" e "qual tenant".

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./config";
import type { Role } from "@/lib/types";

export interface UserProfile {
  role: Role;
  tenantId: string;
  nome: string;
  email: string;
}

interface AuthValue {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  tenantId: string | null;
  /** true enquanto o estado de auth (e o 1º carregamento do perfil) não resolveu. */
  loading: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  const value: AuthValue = {
    user,
    profile,
    role: profile?.role ?? null,
    tenantId: profile?.tenantId ?? null,
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
  await signOut(auth);
}
