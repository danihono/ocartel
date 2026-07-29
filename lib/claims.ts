// Custom claims do Firebase Auth — espelho do doc `users/{uid}`.
//
// Por que existir: as regras do Firestore resolviam papel/tenant com
// `get(users/{uid})`, que é uma LEITURA COBRADA a cada operação. Com o papel no
// próprio token, a regra lê `request.auth.token.role` de graça. E as regras do
// Storage, que não conseguem ler o Firestore de jeito nenhum, só têm como
// escopar por barbearia através daqui.
//
// Este módulo é PURO de propósito (não importa firebase): a decisão de "precisa
// ressincronizar?" é testável e roda dos dois lados (cliente e servidor).

import type { Role } from "./types";

export const ROLES: readonly Role[] = ["superAdmin", "admin", "barbeiro", "cliente"];

/** Claims que o app grava no token. `barbeiroId` só existe para papel `barbeiro`. */
export interface ClaimsApp {
  role: Role;
  tenantId: string;
  barbeiroId?: string;
}

export function ehRole(valor: unknown): valor is Role {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

/**
 * Traduz um doc `users/{uid}` nos claims correspondentes. Devolve `null` quando o
 * perfil não tem papel reconhecido — nesse caso é melhor não gravar claim nenhum
 * do que gravar um papel inventado.
 */
export function claimsDoPerfil(perfil: Record<string, unknown> | null | undefined): ClaimsApp | null {
  if (!perfil || !ehRole(perfil.role)) return null;
  const tenantId = typeof perfil.tenantId === "string" ? perfil.tenantId : "";
  const barbeiroId = typeof perfil.barbeiroId === "string" && perfil.barbeiroId ? perfil.barbeiroId : undefined;
  return { role: perfil.role, tenantId, ...(barbeiroId ? { barbeiroId } : {}) };
}

/**
 * O token em mãos ainda reflete o perfil? Compara só os campos que as regras
 * usam. Trata ausente e vazio como equivalentes — `setCustomUserClaims` não
 * guarda `undefined`, então um perfil sem `barbeiroId` vira token sem a chave.
 */
export function claimsDesatualizados(token: Record<string, unknown> | null | undefined, alvo: ClaimsApp): boolean {
  if (!token) return true;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    texto(token.role) !== alvo.role ||
    texto(token.tenantId) !== alvo.tenantId ||
    texto(token.barbeiroId) !== (alvo.barbeiroId ?? "")
  );
}
