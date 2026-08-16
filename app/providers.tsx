"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/firebase/auth";
import { StoreProvider } from "@/lib/store";
import { RelogioProvider } from "@/lib/useRelogio";
import { ToastProvider } from "@/components/ui/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreProvider>
        <RelogioProvider>
          <ToastProvider>{children}</ToastProvider>
        </RelogioProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
