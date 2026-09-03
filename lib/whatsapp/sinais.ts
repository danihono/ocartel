// Os SELOS da lista de conversas: o que dá para saber de uma conversa sem abri-la.
//
// São dois, e os dois já existiam — só que escondidos dentro da conversa aberta. Quem
// olha a lista precisa ver de fora quem o atendente automático está conduzindo e onde há
// um horário esperando um "confirmar", senão a única forma de descobrir é clicar em cada
// nome.
//
// Puro de propósito: a tela só desenha o que sai daqui (mesmo espírito de lista.ts).

import type { Sugestao } from "@/lib/types";
import type { EstadoConversa } from "@/lib/firebase/repos";

/**
 * Por quanto tempo, depois de falar, a IA continua "em contato".
 *
 * O selo fala do presente — é o que responde "quem está atendendo esta pessoa agora?".
 * Sem um teto, uma conversa que a IA respondeu mês passado ficaria marcada para sempre e
 * o selo viraria histórico, que a própria conversa já conta melhor.
 */
export const JANELA_EM_CONTATO_MS = 6 * 60 * 60 * 1000;

/**
 * A IA está conduzindo esta conversa agora?
 *
 * Três coisas precisam ser verdade: ela já falou aqui (senão não há contato nenhum),
 * ninguém assumiu no lugar dela (`iaPausadaAte` no futuro é gente atendendo) e isso foi
 * agora há pouco.
 *
 * O interruptor da barbearia (`config.ia.ativa`) NÃO entra aqui: ele é de quem chama —
 * desligar o atendente não apaga o que ele já respondeu, só impede a próxima resposta.
 */
export function iaEmContato(estado: EstadoConversa | undefined, agora: number): boolean {
  if (!estado?.ultimaRespostaIa) return false;
  if ((estado.iaPausadaAte ?? 0) > agora) return false;
  const quando = Date.parse(estado.ultimaRespostaIa);
  return Number.isFinite(quando) && agora - quando >= 0 && agora - quando <= JANELA_EM_CONTATO_MS;
}

/**
 * Agrupa as sugestões pendentes por conversa, a mais próxima primeiro.
 *
 * A mais próxima primeiro porque a lista mostra UMA (não cabe mais numa linha), e a que
 * importa é a que vence antes — é a que pode perder o horário para outra pessoa.
 */
export function sugestoesPorConversa(sugestoes: Sugestao[]): Map<string, Sugestao[]> {
  const mapa = new Map<string, Sugestao[]>();
  for (const s of sugestoes) {
    const atual = mapa.get(s.contactId);
    if (atual) atual.push(s);
    else mapa.set(s.contactId, [s]);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => (`${a.date} ${a.inicio}` < `${b.date} ${b.inicio}` ? -1 : 1));
  }
  return mapa;
}
