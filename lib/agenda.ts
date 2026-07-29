// Lógica pura de conflito de horário — compartilhada entre a tela do barbeiro
// (cliente) e a server action do booking público (Admin SDK). NÃO importa o
// store de cliente (lib/store.tsx é "use client"), só tipos — assim pode ser
// usada com segurança no servidor.

import type { Agendamento } from "./types";

/**
 * Grade de horários ofertáveis entre abertura e fechamento, de 15 em 15 min.
 * Usada pelo booking público e pela tela de remarcação — as duas precisam
 * oferecer exatamente a mesma grade.
 */
export function gerarHorarios(abre: string, fecha: string, passoMin = 15): string[] {
  const ini = horaParaMin(abre);
  const fim = horaParaMin(fecha);
  const out: string[] = [];
  for (let t = ini; t < fim; t += passoMin) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

/** "HH:MM" -> minutos desde 00:00. */
export function horaParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Os intervalos [iniA, iniA+durA) e [iniB, iniB+durB) se sobrepõem? */
export function intervalosSobrepoem(iniA: string, durA: number, iniB: string, durB: number): boolean {
  const a0 = horaParaMin(iniA);
  const a1 = a0 + durA;
  const b0 = horaParaMin(iniB);
  const b1 = b0 + durB;
  return a0 < b1 && b0 < a1;
}

export type IntervaloOcupado = Pick<Agendamento, "inicio" | "duracaoMin">;

/**
 * O intervalo [inicio, inicio+duracaoMin) está livre?
 * `ocupados` deve vir JÁ filtrado pelo barbeiro+dia e só com agendamentos ativos
 * (bloqueios incluídos, cancelados fora).
 */
export function horarioLivre(ocupados: IntervaloOcupado[], inicio: string, duracaoMin: number): boolean {
  return !ocupados.some((o) => intervalosSobrepoem(inicio, duracaoMin, o.inicio, o.duracaoMin));
}

/** Status que "ocupam a cadeira" (logo, bloqueiam um novo agendamento no horário). */
export function ocupaHorario(status: Agendamento["status"]): boolean {
  return status !== "cancelado";
}
