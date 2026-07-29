// Regras de "o cliente ainda pode mexer neste agendamento?".
//
// Puro e sem dependência de servidor de propósito: a mesma decisão precisa
// valer na tela (para esconder botão que não vai funcionar) e na server action
// (que é onde ela é AUTORITATIVA — a tela é só conveniência).

/** Token de gestão: 16 bytes em hex. Gerado no servidor (lib/booking-core.ts). */
export const GESTAO_TOKEN_RE = /^[a-f0-9]{32}$/;

export type MotivoBloqueio = "cancelado" | "finalizado" | "passado";

export interface Gerenciavel {
  ok: boolean;
  motivo?: MotivoBloqueio;
}

export const MENSAGEM_BLOQUEIO: Record<MotivoBloqueio, string> = {
  cancelado: "Este agendamento já foi cancelado.",
  finalizado: "Este atendimento já foi realizado.",
  passado: "O horário já passou. Fale com a barbearia para remarcar.",
};

/** Status em que o atendimento já aconteceu (ou já foi dado como perdido). */
const FINALIZADOS = ["concluido", "atendimento", "noshow"];

/**
 * O corte é o início do atendimento: até lá o cliente cancela ou remarca
 * sozinho; depois disso é conversa com a barbearia. Cancelar em cima da hora
 * ainda é melhor que não aparecer — a vaga pelo menos volta para a agenda.
 */
export function podeGerenciar(
  agendamento: { date: string; inicio: string; status: string },
  agoraISO: string,
  agoraHHMM: string,
): Gerenciavel {
  if (agendamento.status === "cancelado") return { ok: false, motivo: "cancelado" };
  if (FINALIZADOS.includes(agendamento.status)) return { ok: false, motivo: "finalizado" };

  // "YYYY-MM-DD" e "HH:MM" comparam lexicograficamente na ordem cronológica.
  if (agendamento.date < agoraISO) return { ok: false, motivo: "passado" };
  if (agendamento.date === agoraISO && agendamento.inicio <= agoraHHMM) return { ok: false, motivo: "passado" };

  return { ok: true };
}
