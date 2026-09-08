// Freio das portas públicas (booking e confirmação).
//
// As rotas públicas do sistema não têm login, não têm App Check e criam documento no
// Firestore. Sem freio, um script lota a agenda de uma barbearia, enche o cadastro de
// clientes falsos e infla a fatura — e nada disso exige talento nenhum.
//
// O contador vive no próprio Firestore, e não em memória, porque o SSR roda em Cloud
// Functions: cada instância teria o seu contador, e o limite valeria multiplicado pelo
// número de instâncias — ou seja, não valeria.
//
// É uma janela FIXA (não deslizante): simples, uma transação por chamada, e o pior caso
// (o dobro do limite na virada da janela) é irrelevante para o que se quer evitar aqui.
//
// Só servidor (Admin SDK).

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/** Onde os contadores moram. Sem regra em firestore.rules → invisível para o navegador. */
const COLECAO = "rateLimits";

export interface LimiteConfig {
  /** Quantas chamadas a mesma origem pode fazer dentro da janela. */
  max: number;
  /** Tamanho da janela, em segundos. */
  janelaSeg: number;
}

/**
 * O IP de quem chamou, atrás do proxy do Hosting. `x-forwarded-for` é uma lista e o
 * PRIMEIRO endereço é o do cliente. Não é identidade forte (dá para forjar, e vários
 * clientes compartilham IP), mas é o que existe numa porta anônima — por isso o limite é
 * uma barreira contra script, não um controle de acesso.
 */
export function origemDaRequisicao(headers: Headers): string {
  const encadeado = headers.get("x-forwarded-for") ?? "";
  const primeiro = encadeado.split(",")[0]?.trim();
  return primeiro || headers.get("x-real-ip") || "desconhecido";
}

/** Chave de balde: só caracteres seguros para id de documento do Firestore. */
function baldeId(escopo: string, origem: string, janelaSeg: number): string {
  const janela = Math.floor(Date.now() / (janelaSeg * 1000));
  const limpa = `${escopo}:${origem}`.replace(/[^\w.:-]/g, "_").slice(0, 180);
  return `${limpa}:${janela}`;
}

/**
 * Consome uma unidade do balde. Devolve `false` quando a cota da janela acabou.
 *
 * Falha ABERTA de propósito: se o Firestore não responder, a barbearia continua recebendo
 * agendamento. O freio existe contra abuso, e derrubar o booking legítimo por causa dele
 * seria trocar um problema hipotético por um prejuízo real.
 */
export async function consumir(escopo: string, origem: string, cfg: LimiteConfig): Promise<boolean> {
  const ref = adminDb.collection(COLECAO).doc(baldeId(escopo, origem, cfg.janelaSeg));
  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const atual = snap.exists ? Number(snap.get("n") ?? 0) : 0;
      if (atual >= cfg.max) return false;
      tx.set(
        ref,
        {
          n: FieldValue.increment(1),
          // Campo de TTL: configure a política em Firestore → TTL sobre `rateLimits.expireAt`
          // para o Google apagar os baldes vencidos sem custo de manutenção.
          expireAt: Timestamp.fromMillis(Date.now() + cfg.janelaSeg * 2000),
        },
        { merge: true },
      );
      return true;
    });
  } catch {
    return true;
  }
}
