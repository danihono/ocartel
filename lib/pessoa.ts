// Como a pessoa logada é apresentada no painel: saudação, iniciais e papel.
//
// Isto existe porque esses valores eram literais do protótipo — "Bom dia,
// Marina", o avatar "MR" e "Dona · Admin" apareciam para qualquer conta, em
// qualquer barbearia e em qualquer hora do dia.

import { iniciaisDe } from "./clientes-import";
import type { Role } from "./types";

// Reexporta para as telas não precisarem saber que o helper mora no módulo de
// importação de clientes (é lá que ele nasceu, e continua sendo a mesma regra).
export { iniciaisDe };

export const PAPEL_LABEL: Record<Role, string> = {
  superAdmin: "Super admin",
  admin: "Admin",
  barbeiro: "Barbeiro",
  cliente: "Cliente",
};

/** "Daniel Honorato" -> "Daniel". */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Bom dia" / "Boa tarde" / "Boa noite" a partir de "HH:MM". */
export function saudacao(horaHHMM: string): string {
  const h = Number(horaHHMM.slice(0, 2));
  if (!Number.isFinite(h) || h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Título do Dashboard. Sem nome carregado ainda, mostra só a saudação — melhor
 * que piscar um nome errado ou uma vírgula solta.
 */
export function saudacaoCompleta(horaHHMM: string, nome: string | null | undefined): string {
  const p = primeiroNome(nome);
  const s = saudacao(horaHHMM);
  return p ? `${s}, ${p}` : s;
}
