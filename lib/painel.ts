// Números do Dashboard que alimentam os desenhos de barbearia (gráfico de movimento,
// "agora na cadeira", pictograma dos serviços). Funções puras sobre o AppState, testadas em
// tests/painel.test.ts — os componentes em components/ui/barbearia só desenham.
//
// Dinheiro vem das cobranças pagas; movimento (cortes, cadeira, régua) vem da agenda. Tudo
// sobre o que o navegador já tem carregado: a agenda dos últimos meses e as últimas
// cobranças (ver lib/firebase/repos.ts).

import { addDias, addMeses } from "./date";
import { horaParaMin } from "./agenda";
import { normaliza, statusCobranca, valorRecebido } from "./selectors";
import type { AppState } from "./store";
import type { Agendamento, AgendamentoStatus, Barbeiro } from "./types";

const doDia = (ags: Agendamento[], dia: string) => ags.filter((a) => a.date === dia);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "2026-10" do mês anterior ao de `hojeISO`. */
export function mesAnterior(hojeISO: string): string {
  return addMeses(`${hojeISO.slice(0, 7)}-01`, -1).slice(0, 7);
}

/**
 * Recebido num mês ("YYYY-MM"), pela data de pagamento.
 *
 * Lê só as cobranças carregadas (as mais recentes). Numa barbearia de movimento muito alto
 * o mês passado pode vir parcial — a tela fala em "do mês passado", sem prometer exatidão.
 */
export function recebidoNoMes(state: AppState, mes: string, hojeISO: string): number {
  let total = 0;
  for (const t of state.transacoes) {
    if (t.paidAt?.startsWith(mes) && statusCobranca(t, hojeISO) === "pago") total += valorRecebido(t);
  }
  return total;
}

export interface DiaMovimento {
  dia: string;
  /** Atendimentos concluídos na agenda. */
  cortes: number;
  /** Cobranças pagas naquele dia. */
  receita: number;
}

/** Cortes e receita por dia, dos últimos `dias` até hoje (inclusive), em ordem. */
export function movimentoPorDia(state: AppState, dias: number, hojeISO: string): DiaMovimento[] {
  const cortes = new Map<string, number>();
  for (const a of state.agendamentos) if (a.status === "concluido") cortes.set(a.date, (cortes.get(a.date) ?? 0) + 1);
  const receita = new Map<string, number>();
  for (const t of state.transacoes) {
    if (t.paidAt && statusCobranca(t, hojeISO) === "pago") {
      const d = t.paidAt.slice(0, 10);
      receita.set(d, (receita.get(d) ?? 0) + valorRecebido(t));
    }
  }
  return Array.from({ length: dias }, (_, i) => {
    const dia = addDias(hojeISO, i - dias + 1);
    return { dia, cortes: cortes.get(dia) ?? 0, receita: receita.get(dia) ?? 0 };
  });
}

/** Janela de atendimento do dia, em minutos desde 00:00. */
function janela(state: AppState): { abre: number; fecha: number } {
  const abre = horaParaMin(state.config.horario.abre || "09:00");
  const fecha = horaParaMin(state.config.horario.fecha || "19:00");
  return { abre, fecha: Math.max(abre + 60, fecha) };
}

export type EstadoCadeira =
  | { tipo: "ocupada"; cliente: string; servico: string; ate: string }
  | { tipo: "pausa"; motivo: string; ate: string }
  | { tipo: "livre"; ate: string | null }
  | { tipo: "fechada" };

/**
 * O que está acontecendo AGORA na cadeira de cada barbeiro.
 *
 * Ocupada: há um atendimento (não cancelado nem falta) cobrindo este minuto. Pausa: um
 * bloqueio cobre este minuto. Livre: nada agora — `ate` é o início do próximo horário, ou
 * null se o dia acabou para ele. Fechada: fora do horário de funcionamento.
 */
export function agoraNaCadeira(state: AppState, hojeISO: string, agora: string): { barbeiro: Barbeiro; estado: EstadoCadeira }[] {
  const { abre, fecha } = janela(state);
  const t = horaParaMin(agora);
  const hoje = doDia(state.agendamentos, hojeISO).filter((a) => a.status !== "cancelado" && a.status !== "noshow");
  return state.barbeiros.map((barbeiro) => {
    if (t < abre || t >= fecha) return { barbeiro, estado: { tipo: "fechada" } };
    const dele = hoje.filter((a) => a.barbeiroId === barbeiro.id).sort((a, b) => horaParaMin(a.inicio) - horaParaMin(b.inicio));
    const atual = dele.find((a) => horaParaMin(a.inicio) <= t && t < horaParaMin(a.inicio) + a.duracaoMin);
    if (atual) {
      const ate = hhmm(horaParaMin(atual.inicio) + atual.duracaoMin);
      return atual.status === "bloqueio"
        ? { barbeiro, estado: { tipo: "pausa", motivo: atual.clienteNome || "Pausa", ate } }
        : { barbeiro, estado: { tipo: "ocupada", cliente: atual.clienteNome, servico: atual.servico, ate } };
    }
    const prox = dele.find((a) => horaParaMin(a.inicio) > t);
    return { barbeiro, estado: { tipo: "livre", ate: prox ? prox.inicio : null } };
  });
}

export interface PontoRegua {
  /** Posição na régua, 0 (abertura) .. 1 (fechamento). */
  pos: number;
  status: AgendamentoStatus;
  hora: string;
  cliente: string;
}

/**
 * A régua do dia: cada atendimento de hoje como um ponto entre a abertura e o fechamento,
 * onde está a navalha (o "agora") e quem é o próximo.
 */
export function reguaDoDia(
  state: AppState,
  hojeISO: string,
  agora: string,
): { abre: string; fecha: string; pontos: PontoRegua[]; agoraPos: number; aberto: boolean; proximo: { hora: string; cliente: string } | null } {
  const { abre, fecha } = janela(state);
  const span = fecha - abre;
  const t = horaParaMin(agora);
  const pontos = doDia(state.agendamentos, hojeISO)
    .filter((a) => a.status !== "bloqueio" && a.status !== "cancelado")
    .sort((a, b) => horaParaMin(a.inicio) - horaParaMin(b.inicio))
    .map((a) => ({
      pos: Math.max(0, Math.min(1, (horaParaMin(a.inicio) - abre) / span)),
      status: a.status,
      hora: a.inicio,
      cliente: a.clienteNome,
    }));
  const prox = pontos.find((p) => horaParaMin(p.hora) >= t && (p.status === "agendado" || p.status === "confirmado"));
  return {
    abre: hhmm(abre),
    fecha: hhmm(fecha),
    pontos,
    // Fora do expediente a navalha fica estacionada na ponta (antes de abrir / depois de fechar).
    agoraPos: Math.max(0, Math.min(1, (t - abre) / span)),
    aberto: t >= abre && t <= fecha,
    proximo: prox ? { hora: prox.hora, cliente: prox.cliente } : null,
  };
}

export type IconeServico = "tesoura" | "navalha" | "combo" | "pincel" | "pente";

/** O desenho de cada serviço, pelo nome que a barbearia deu a ele. */
export function iconeDoServico(nome: string): IconeServico {
  const n = normaliza(nome);
  const temCorte = /corte|cabelo|degrad|social|maquina|tesoura|infantil/.test(n);
  const temBarba = /barba|navalha|bigode|raspa|cavanhaque/.test(n);
  if (temCorte && temBarba) return "combo";
  if (temBarba) return "navalha";
  if (/luz|luzes|quimic|pigment|tint|progress|color|relax|platinad|mecha/.test(n)) return "pincel";
  if (/sobrancel|pezinho|acabamento|hidrat|limpeza/.test(n)) return "pente";
  return "tesoura";
}

/**
 * Quanto vale cada desenho do pictograma para a fileira mais longa caber em `maxIcones`:
 * o menor de 1, 2, 5, 10, 20, 50… que dá conta.
 */
export function escalaPictograma(max: number, maxIcones = 12): number {
  for (let mag = 1; ; mag *= 10) {
    for (const m of [1, 2, 5]) {
      const u = m * mag;
      if (Math.ceil(max / u) <= maxIcones) return u;
    }
  }
}
