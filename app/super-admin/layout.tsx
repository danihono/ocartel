"use client";

import type { ReactNode } from "react";
import AuthGuard from "@/components/auth/AuthGuard";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <AuthGuard need="superAdmin">{children}</AuthGuard>;
}
