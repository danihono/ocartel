// Lógica pura de conflito/horário — ESPELHA lib/agenda.ts do app Next. Duplicada
// aqui de propósito para o worker ser um pacote autônomo (deploy independente).
// Se mexer numa, mexa na outra.

export interface IntervaloOcupado {
  inicio: string; // "HH:MM"
  duracaoMin: number;
}

/** "HH:MM" -> minutos desde 00:00. */
export function horaParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutos -> "HH:MM". */
export function minParaHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Os intervalos [iniA, iniA+durA) e [iniB, iniB+durB) se sobrepõem? */
export function intervalosSobrepoem(iniA: string, durA: number, iniB: string, durB: number): boolean {
  const a0 = horaParaMin(iniA);
  const a1 = a0 + durA;
  const b0 = horaParaMin(iniB);
  const b1 = b0 + durB;
  return a0 < b1 && b0 < a1;
}

/** O intervalo [inicio, inicio+duracaoMin) está livre? `ocupados` já filtrado por barbeiro+dia. */
export function horarioLivre(ocupados: IntervaloOcupado[], inicio: string, duracaoMin: number): boolean {
  return !ocupados.some((o) => intervalosSobrepoem(inicio, duracaoMin, o.inicio, o.duracaoMin));
}

/** Status que "ocupam a cadeira". */
export function ocupaHorario(status: string): boolean {
  return status !== "cancelado";
}

/** Índice 0..6 com Segunda=0 … Domingo=6 — alinha com config.horario.diasAtivos. */
export function indiceSegDom(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sáb
  return (dow + 6) % 7;
}

/**
 * Gera os horários de início livres para um serviço num dia, dado o expediente e
 * os intervalos já ocupados do barbeiro. Passo configurável (default 15 min).
 */
export function slotsLivres(
  opts: {
    abre: string;
    fecha: string;
    duracaoMin: number;
    ocupados: IntervaloOcupado[];
    passoMin?: number;
  },
): string[] {
  const passo = opts.passoMin ?? 15;
  const abreMin = horaParaMin(opts.abre);
  const fechaMin = horaParaMin(opts.fecha);
  const out: string[] = [];
  for (let t = abreMin; t + opts.duracaoMin <= fechaMin; t += passo) {
    const inicio = minParaHora(t);
    if (horarioLivre(opts.ocupados, inicio, opts.duracaoMin)) out.push(inicio);
  }
  return out;
}
