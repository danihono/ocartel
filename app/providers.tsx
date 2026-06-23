"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/firebase/auth";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <StoreProvider>
        <ToastProvider>{children}</ToastProvider>
      </StoreProvider>
    </AuthProvider>
  );
}
