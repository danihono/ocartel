// Helpers de data em JS puro — sem dependências e sem `toLocaleDateString`
// (que difere entre Node e navegador e quebraria a hidratação).
// Tudo trafega como string ISO "YYYY-MM-DD"; o objeto Date só é usado em UTC
// dentro destes helpers, nunca vazando timezone.

// "Hoje" e "agora" são constantes determinísticas da semente, batendo com o
// design ("Seg, 23 jun" / linha do agora às 14:24). Não use `new Date()` no
// render nem na semente do store — só dentro de event handlers.
export const HOJE_ISO = "2026-06-23";
export const AGORA_HHMM = "14:24";

const DIAS_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function utc(iso: string): Date {
  const { y, m, d } = parse(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dia da semana 0..6 (Dom..Sáb). */
export function diaSemana(iso: string): number {
  return utc(iso).getUTCDay();
}

/** "Seg", "Ter"… a partir do calendário real. */
export function diaSemanaCurtoLabel(iso: string): string {
  return DIAS_CURTO[diaSemana(iso)];
}

/** Índice 0..6 com Segunda=0 … Domingo=6 — alinha com `config.horario.diasAtivos`. */
export function indiceSegDom(iso: string): number {
  return (diaSemana(iso) + 6) % 7; // diaSemana: 0=Dom..6=Sáb
}

/** "Seg, 23 jun" */
export function isoParaLabel(iso: string): string {
  const { d } = parse(iso);
  return `${DIAS_CURTO[diaSemana(iso)]}, ${d} ${MESES_CURTO[parse(iso).m - 1]}`;
}

/** "Segunda, 23 jun" */
export function isoParaLabelLongo(iso: string): string {
  const { d, m } = parse(iso);
  return `${DIAS_LONGO[diaSemana(iso)]}, ${d} ${MESES_CURTO[m - 1]}`;
}

/** "23 jun" */
export function isoParaDiaMes(iso: string): string {
  const { d, m } = parse(iso);
  return `${d} ${MESES_CURTO[m - 1]}`;
}

/** "Junho 2026" */
export function mesLabel(iso: string): string {
  const { y, m } = parse(iso);
  return `${MESES_LONGO[m - 1]} ${y}`;
}

/** Adiciona n dias (n pode ser negativo). */
export function addDias(iso: string, n: number): string {
  const dt = utc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toISO(dt);
}

/** Adiciona n meses preservando o dia (clamp no fim do mês). */
export function addMeses(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  const base = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimoDia));
  return toISO(base);
}

/** Segunda-feira da semana que contém `iso`. */
export function inicioDaSemana(iso: string): string {
  const dow = diaSemana(iso); // 0 = domingo
  const recuo = dow === 0 ? 6 : dow - 1; // segunda como início
  return addDias(iso, -recuo);
}

/** As 7 datas (segunda a domingo) da semana de `iso`. */
export function diasDaSemana(iso: string): string[] {
  const ini = inicioDaSemana(iso);
  return Array.from({ length: 7 }, (_, i) => addDias(ini, i));
}

/** Rótulo de intervalo da semana: "23–29 jun" (ou "30 jun–6 jul"). */
export function labelSemana(iso: string): string {
  const dias = diasDaSemana(iso);
  const ini = parse(dias[0]);
  const fim = parse(dias[6]);
  if (ini.m === fim.m) return `${ini.d}–${fim.d} ${MESES_CURTO[ini.m - 1]}`;
  return `${ini.d} ${MESES_CURTO[ini.m - 1]}–${fim.d} ${MESES_CURTO[fim.m - 1]}`;
}

/** Grade 6×7 (segunda a domingo) cobrindo o mês de `iso`. */
export function diasDoMes(iso: string): { iso: string; dia: number; foraDoMes: boolean }[] {
  const { y, m } = parse(iso);
  const primeiro = `${y}-${String(m).padStart(2, "0")}-01`;
  const inicioGrade = inicioDaSemana(primeiro);
  return Array.from({ length: 42 }, (_, i) => {
    const cur = addDias(inicioGrade, i);
    const p = parse(cur);
    return { iso: cur, dia: p.d, foraDoMes: p.m !== m };
  });
}

/** Compara "HH:MM" para ordenação. */
export function comparaHora(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Hora atual "HH:MM" — só usar em efeitos no cliente, nunca no render. */
export function agoraHHMM(): string {
  const dt = new Date();
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/** ISO de hoje no fuso local — só usar em efeitos/handlers no cliente. */
export function hojeLocalISO(): string {
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "jun/26" — usado em "Cliente desde". */
export function mesAnoCurto(iso: string): string {
  const { y, m } = parse(iso);
  return `${MESES_CURTO[m - 1]}/${String(y).slice(2)}`;
}

/** Diferença em dias inteiros entre duas datas ISO (ate - de). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate).getTime() - utc(de).getTime()) / 86_400_000);
}

/**
 * "hoje" / "ontem" / "há 3 dias" / "há 1 semana"… a partir de uma data ISO,
 * relativa a `hoje` (default HOJE_ISO — determinístico, seguro no SSR).
 */
export function tempoRelativo(iso: string, hoje: string = HOJE_ISO): string {
  const d = diasEntre(iso, hoje);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  if (d < 14) return "há 1 semana";
  if (d < 30) return `há ${Math.floor(d / 7)} semanas`;
  if (d < 60) return "há 1 mês";
  if (d < 365) return `há ${Math.floor(d / 30)} meses`;
  const anos = Math.floor(d / 365);
  return anos === 1 ? "há 1 ano" : `há ${anos} anos`;
}
