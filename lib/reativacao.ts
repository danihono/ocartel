// Reativação de clientes: quem sumiu e quem faz aniversário. Regras puras, testáveis.
//
// "Sumido" é quem não volta há DIAS_SUMIDO dias ou mais, contado do último atendimento
// CONCLUÍDO (`ultimoAtendimentoISO`). Quem já tem horário marcado para frente não é
// sumido — é cliente que vai voltar, e mandar "sentimos sua falta" para ele seria
// constrangedor. Cliente sem nenhum atendimento registrado também fica de fora: não dá
// para dizer que sumiu quem nunca veio.

import { diasEntre } from "./date";
import type { Agendamento, Cliente } from "./types";

export const DIAS_SUMIDO = 45;
/** Janela da lista de aniversariantes: hoje e os próximos dias. */
export const DIAS_ANIVERSARIO = 7;

/** Dias desde o último atendimento concluído; `null` se nunca veio. */
export function diasSemVir(c: Cliente, hojeISO: string): number | null {
  if (!c.ultimoAtendimentoISO) return null;
  return diasEntre(c.ultimoAtendimentoISO.slice(0, 10), hojeISO);
}

/** Ids (e nomes, para agendamentos sem vínculo) de quem tem horário de hoje em diante. */
export function comHorarioMarcado(ags: Agendamento[], hojeISO: string): { ids: Set<string>; nomes: Set<string> } {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const a of ags) {
    if (a.date < hojeISO || a.status === "cancelado" || a.status === "bloqueio" || a.status === "noshow" || a.status === "concluido") continue;
    if (a.clienteId) ids.add(a.clienteId);
    nomes.add(a.clienteNome.trim().toLowerCase());
  }
  return { ids, nomes };
}

export function estaSumido(c: Cliente, hojeISO: string, marcados: { ids: Set<string>; nomes: Set<string> }, dias = DIAS_SUMIDO): boolean {
  const d = diasSemVir(c, hojeISO);
  if (d === null || d < dias) return false;
  return !marcados.ids.has(c.id) && !marcados.nomes.has(c.nome.trim().toLowerCase());
}

/** Sumidos, do que está há mais tempo longe para o mais recente. */
export function clientesSumidos(clientes: Cliente[], ags: Agendamento[], hojeISO: string, dias = DIAS_SUMIDO): Cliente[] {
  const marcados = comHorarioMarcado(ags, hojeISO);
  return clientes
    .filter((c) => estaSumido(c, hojeISO, marcados, dias))
    .sort((a, b) => (diasSemVir(b, hojeISO) ?? 0) - (diasSemVir(a, hojeISO) ?? 0));
}

/**
 * Dias até o próximo aniversário (0 = hoje); `null` sem data. Quem nasceu em 29/02 faz
 * aniversário em 28/02 nos anos que não são bissextos.
 */
export function diasAteAniversario(nascimento: string | undefined, hojeISO: string): number | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(nascimento ?? "");
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const ano = Number(hojeISO.slice(0, 4));
  const naData = (y: number) => {
    const ultimo = new Date(Date.UTC(y, mes, 0)).getUTCDate();
    return `${y}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
  };
  let alvo = naData(ano);
  if (alvo < hojeISO) alvo = naData(ano + 1);
  return diasEntre(hojeISO, alvo);
}

/** Aniversariantes de hoje até `janela` dias, do mais próximo ao mais distante. */
export function aniversariantes(clientes: Cliente[], hojeISO: string, janela = DIAS_ANIVERSARIO): Cliente[] {
  return clientes
    .map((c) => ({ c, d: diasAteAniversario(c.nascimento, hojeISO) }))
    .filter((x): x is { c: Cliente; d: number } => x.d !== null && x.d <= janela)
    .sort((a, b) => a.d - b.d || a.c.nome.localeCompare(b.c.nome))
    .map((x) => x.c);
}

/** "dd/mm" do aniversário (o ano pode ser desconhecido). */
export function aniversarioCurto(nascimento: string | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(nascimento ?? "");
  return m ? `${m[2]}/${m[1]}` : "";
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export function mensagemReativacao(d: { cliente: string; barbearia: string; link?: string }): string {
  return [
    `Fala, ${primeiroNome(d.cliente)}! Aqui é da ${d.barbearia || "barbearia"}.`,
    `Faz um tempo que você não aparece — bora dar aquele trato no visual?`,
    d.link ? `Escolhe o melhor horário aqui: ${d.link}` : `É só responder esta mensagem que a gente marca.`,
  ].join("\n");
}

export function mensagemAniversario(d: { cliente: string; barbearia: string; hoje: boolean; link?: string }): string {
  return [
    d.hoje
      ? `Parabéns, ${primeiroNome(d.cliente)}! 🎉 Toda a equipe da ${d.barbearia || "barbearia"} te deseja um ótimo aniversário.`
      : `Fala, ${primeiroNome(d.cliente)}! Seu aniversário está chegando 🎉 — a equipe da ${d.barbearia || "barbearia"} já está na torcida.`,
    `Que tal chegar no dia com o visual em dia?`,
    d.link ? `Marca seu horário: ${d.link}` : `Responde aqui que a gente encaixa você.`,
  ].join("\n");
}
