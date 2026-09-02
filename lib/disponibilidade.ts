// Que horários existem, e quais estão livres.
//
// A regra sempre esteve na página de agendamento público, escrita direto no componente.
// Agora o atendente automático precisa da MESMA resposta — e uma segunda cópia da regra
// seria a forma mais rápida de a IA oferecer um horário que a barbearia não tem.
//
// Puro e determinístico: nada de Firestore, nada de `new Date()` escondido. Quem chama
// passa o dia e os ocupados.

import { horaParaMin, horarioLivre, type IntervaloOcupado } from "@/lib/agenda";
import { indiceSegDom } from "@/lib/date";

/** De quanto em quanto tempo a agenda oferece início de atendimento. */
export const PASSO_MIN = 15;

/** Expediente da barbearia (`config/main.horario`). */
export interface Expediente {
  abre: string; // "09:00"
  fecha: string; // "19:00"
  /** 7 posições, Seg..Dom. Ausente/curto ⇒ a barbearia abre todo dia. */
  diasAtivos?: boolean[];
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Todos os inícios possíveis entre a abertura e o fechamento, de 15 em 15 minutos. */
export function gerarHorarios(abre: string, fecha: string): string[] {
  const out: string[] = [];
  for (let t = horaParaMin(abre); t < horaParaMin(fecha); t += PASSO_MIN) out.push(hhmm(t));
  return out;
}

/** A barbearia atende neste dia da semana? */
export function diaAberto(expediente: Expediente, dateISO: string): boolean {
  const dias = expediente.diasAtivos;
  if (!Array.isArray(dias) || dias.length !== 7) return true;
  return dias[indiceSegDom(dateISO)] !== false;
}

export interface ParamsSlots {
  expediente: Expediente;
  /** Intervalos já ocupados/bloqueados do barbeiro NAQUELE dia. */
  ocupados: IntervaloOcupado[];
  dateISO: string;
  duracaoMin: number;
  /** Hoje, para não oferecer horário que já passou. */
  hojeISO: string;
  /** Minutos desde a meia-noite, agora. Só usado quando `dateISO` é hoje. */
  agoraMin?: number;
  /** Folga mínima antes do próximo atendimento oferecido hoje. */
  antecedenciaMin?: number;
}

/**
 * Os horários que a barbearia consegue MESMO atender.
 *
 * Um slot só entra se: o dia está aberto, o atendimento inteiro cabe antes de fechar, não
 * está no passado (quando o dia é hoje) e não sobrepõe nada já marcado ou bloqueado.
 */
export function slotsLivres(p: ParamsSlots): string[] {
  if (!diaAberto(p.expediente, p.dateISO)) return [];

  const fecha = horaParaMin(p.expediente.fecha);
  const ehHoje = p.dateISO === p.hojeISO;
  const minimoHoje = ehHoje && p.agoraMin !== undefined ? p.agoraMin + (p.antecedenciaMin ?? 0) : -1;

  return gerarHorarios(p.expediente.abre, p.expediente.fecha).filter((h) => {
    const m = horaParaMin(h);
    if (m + p.duracaoMin > fecha) return false;
    if (minimoHoje >= 0 && m < minimoHoje) return false;
    return horarioLivre(p.ocupados, h, p.duracaoMin);
  });
}
