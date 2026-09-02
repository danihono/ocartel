// Quem é a barbearia dentro do daemon de WhatsApp.
//
// Fica sozinho num arquivo porque as DUAS pontas precisam da mesma resposta: o servidor,
// para enfileirar comando, e o navegador, para escutar o espelho da conversa. O resto de
// `lib/canal/` importa firebase-admin e não pode ser carregado no cliente — se esta função
// morasse lá, o navegador teria que refazer a regra por conta própria, e a hora em que as
// duas divergissem seria a hora em que a tela ficaria vazia sem explicação.

/**
 * O `uid` da sessão da barbearia no daemon. NÃO é um usuário do Firebase Auth: o daemon
 * usa isso apenas como chave de caminho (`users/{uid}/...`), e quem escreve na fila é
 * sempre o Admin SDK.
 */
export function uidDaBarbearia(tenantId: string): string {
  return `barbearia-${tenantId}`;
}
