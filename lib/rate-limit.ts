// Freio do booking público.
//
// A tela /book/[slug] chama uma server action sem autenticação nenhuma — é o
// único ponto do sistema onde um anônimo escreve no banco. Sem limite, um
// script preenche a agenda de uma barbearia inteira em segundos.
//
// A DECISÃO é pura (testável, sem relógio nem banco); a persistência do
// contador fica em `consumirLimite`, que roda numa transação do Firestore para
// dois pedidos simultâneos não lerem o mesmo valor e ambos passarem.

import { createHash } from "node:crypto";

export interface Limite {
  /** Quantos pedidos cabem na janela. */
  max: number;
  /** Tamanho da janela, em segundos. */
  janelaSeg: number;
}

export interface EstadoContador {
  contagem: number;
  /** Início da janela corrente, em ms epoch. */
  inicioMs: number;
}

export interface DecisaoLimite {
  permitido: boolean;
  estado: EstadoContador;
}

/** No máximo 3 agendamentos por telefone por dia. */
export const LIMITE_TELEFONE: Limite = { max: 3, janelaSeg: 24 * 60 * 60 };

/**
 * 20 por hora por IP. Precisa ser folgado: clientes em NAT de operadora móvel
 * compartilham IP, e um limite apertado bloquearia gente de verdade.
 */
export const LIMITE_IP: Limite = { max: 20, janelaSeg: 60 * 60 };

/**
 * Janela fixa: ao expirar, o contador recomeça. Quando o limite já estourou, a
 * janela NÃO é estendida — senão quem insiste ficaria travado para sempre, e o
 * bloqueio deixaria de ter prazo.
 */
export function decidirLimite(estado: EstadoContador | null | undefined, limite: Limite, agoraMs: number): DecisaoLimite {
  const expirou = !estado || agoraMs - estado.inicioMs >= limite.janelaSeg * 1000;
  if (expirou) return { permitido: true, estado: { contagem: 1, inicioMs: agoraMs } };
  if (estado.contagem >= limite.max) return { permitido: false, estado };
  return { permitido: true, estado: { contagem: estado.contagem + 1, inicioMs: estado.inicioMs } };
}

/** Só os dígitos — "(11) 99999-8888" e "11999998888" são o mesmo telefone. */
export function chaveTelefone(telefone: string): string {
  return `tel-${(telefone ?? "").replace(/\D/g, "")}`;
}

/**
 * IP guardado como hash: o contador não precisa do endereço em claro, e assim
 * a coleção não vira um registro de quem visitou a página.
 */
export function chaveIp(ip: string): string {
  return `ip-${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * Primeiro IP de `x-forwarded-for` (o cliente; os seguintes são proxies).
 * Devolve "" quando não dá para determinar — aí o limite por IP é pulado, em
 * vez de todo mundo cair no mesmo balde "desconhecido".
 */
export function ipDeHeaders(headers: { get(nome: string): string | null }): string {
  const xff = headers.get("x-forwarded-for") ?? "";
  const primeiro = xff.split(",")[0]?.trim();
  return primeiro || headers.get("x-real-ip")?.trim() || "";
}

export interface SinaisFormulario {
  /** Campo oculto: humano nunca preenche; bot que preenche tudo, sim. */
  honeypot?: string;
  /** Quanto tempo o formulário ficou aberto, em ms, segundo o cliente. */
  duracaoPreenchimentoMs?: number;
}

/** Abaixo disto não houve preenchimento humano — houve submissão automática. */
export const PREENCHIMENTO_MINIMO_MS = 2500;

/**
 * Checagens baratas, antes de tocar no banco. O honeypot é a que vale: a de
 * tempo depende de um número que o próprio cliente envia e portanto só barra
 * bot ingênuo — serve para filtrar volume, não como garantia.
 */
export function pareceRobo(sinais: SinaisFormulario): boolean {
  if ((sinais.honeypot ?? "").trim() !== "") return true;
  const dur = sinais.duracaoPreenchimentoMs;
  return typeof dur === "number" && dur >= 0 && dur < PREENCHIMENTO_MINIMO_MS;
}

/**
 * Aplica um limite e devolve se o pedido passa. A transação é o que impede dois
 * pedidos concorrentes de lerem a mesma contagem e ambos serem aceitos.
 *
 * Falha do banco NÃO bloqueia o agendamento: o freio é proteção contra abuso,
 * não parte do fluxo de negócio — derrubar clientes de verdade por instabilidade
 * do contador seria pior que o abuso que ele previne.
 */
export async function consumirLimite(
  tenantRef: FirebaseFirestore.DocumentReference,
  chave: string,
  limite: Limite,
  agoraMs: number = Date.now(),
): Promise<boolean> {
  const ref = tenantRef.collection("rateLimits").doc(chave);
  try {
    return await tenantRef.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const atual = snap.exists ? (snap.data() as EstadoContador) : null;
      const { permitido, estado } = decidirLimite(atual, limite, agoraMs);
      if (permitido) tx.set(ref, estado);
      return permitido;
    });
  } catch {
    return true;
  }
}
