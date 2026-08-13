// Disparo automático das confirmações do dia.
//
// A regra é: a confirmação NÃO sai quando o agendamento é criado — sai na manhã do dia
// do atendimento. Quem marca na terça para sexta só é avisado na sexta. Quem marca no
// próprio dia, depois do disparo, não recebe nada (decisão de produto: já está com o
// horário fresco, e é uma mensagem a menos saindo do número).
//
// Lógica pura separada da rota para poder ser testada sem HTTP nem Firestore.

/** Fuso em que a barbearia (e o dono dela) pensa. A VPS que agenda o disparo roda em UTC. */
export const FUSO = "America/Sao_Paulo";

/**
 * Data e hora correntes NO FUSO DA BARBEARIA.
 *
 * Sem isto o disparo sai 3 h fora: o servidor está em UTC, e "hoje" às 23h de Brasília
 * já é o dia seguinte lá. Usa `en-CA` porque o formato dele é exatamente YYYY-MM-DD.
 */
export function agoraEmBrasilia(base: Date = new Date()): { dataISO: string; hora: number } {
  const dataISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);

  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(base),
  );

  return { dataISO, hora };
}

/** A hora configurada ("08:00", "8:00", "08h") em número. `null` se não der para ler. */
export function horaConfigurada(valor: unknown): number | null {
  const m = /^(\d{1,2})/.exec(String(valor ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}

/**
 * Horas APÓS a configurada em que o disparo ainda roda, para reprocessar quem falhou.
 * Sem esta janela, uma queda de rede às 08:00 deixaria o cliente sem aviso o dia todo:
 * na hora seguinte a barbearia já não casaria mais e só voltaria amanhã. Reprocessar é
 * seguro porque `confirmacaoEnviadaEm` torna o envio idempotente.
 */
const JANELA_RETENTATIVA_H = 2;

/**
 * Esta barbearia dispara agora?
 *
 * Compara apenas a HORA: o agendador bate na rota de hora em hora, então minutos não
 * entram na conta — e não devem, senão um atraso de dois minutos no timer pularia o dia
 * inteiro daquela barbearia.
 */
export function deveDispararAgora(
  confirmacao: { hora?: string; ativa?: boolean } | undefined,
  horaCorrente: number,
): boolean {
  if (!confirmacao?.ativa) return false;
  const h = horaConfigurada(confirmacao.hora);
  if (h === null) return false;
  // Sem dar a volta no dia: uma barbearia configurada às 23h não deve disparar à 1h da
  // manhã seguinte, quando "hoje" já é outro dia e a agenda é outra.
  return horaCorrente >= h && horaCorrente <= h + JANELA_RETENTATIVA_H && horaCorrente <= 23;
}

/** Status que ainda fazem sentido receber confirmação. */
const STATUS_CONFIRMAVEIS = new Set(["agendado", "confirmado"]);

/**
 * O agendamento deve receber a mensagem?
 *
 * `confirmacaoEnviadaEm` é o que garante idempotência — rodar o disparo duas vezes não
 * remanda nada. Bloqueio de agenda não é cliente e nunca recebe.
 */
export function deveAvisar(ag: {
  status?: string;
  confirmacaoEnviadaEm?: string;
  confirmToken?: string;
  servico?: string;
}): boolean {
  if (ag.confirmacaoEnviadaEm) return false;
  if (!ag.confirmToken) return false;
  if (!ag.status || !STATUS_CONFIRMAVEIS.has(ag.status)) return false;
  return true;
}
