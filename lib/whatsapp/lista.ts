// Quem aparece na tela de WhatsApp, e com que nome.
//
// São duas fontes que precisam virar uma lista só: as CONVERSAS do espelho (quem já falou
// com a barbearia) e os CLIENTES do cadastro (a maioria, que nunca falou). Casar as duas
// é o que faz a conversa mostrar "Ricardo Alves" em vez de "+5519984487271", e é o que
// permite puxar um cliente para o WhatsApp sem sair procurando o número na mão.
//
// Tudo aqui é puro e determinístico — a tela só desenha o que sai daqui.

import type { Cliente } from "@/lib/types";
import { normaliza } from "@/lib/selectors";
import { chaveTelefone } from "@/lib/telefone";
import type { Conversa } from "./espelho";

export interface ItemConversa {
  conversa: Conversa;
  /** O cadastro por trás do número, quando existe. */
  cliente?: Cliente;
  /** Nome do cadastro, senão o que o WhatsApp informou, senão o próprio número. */
  nome: string;
  iniciais: string;
}

export interface ItemCliente {
  cliente: Cliente;
  /** Número em formato WhatsApp; `null` quando o cadastro não tem telefone discável. */
  wa: string | null;
}

export interface Lista {
  /** Conversas que existem, mais recentes primeiro, já filtradas pela busca. */
  conversas: ItemConversa[];
  /** Clientes do cadastro sem conversa, em ordem alfabética, já filtrados pela busca. */
  semConversa: ItemCliente[];
  /** Quantos clientes com telefone ainda não têm conversa — IGNORA a busca (é o contador). */
  totalSemConversa: number;
}

function iniciaisDoNome(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Número do cliente em formato WhatsApp, ou null se o cadastro não tiver um discável. */
export function waDoCliente(c: Cliente): string | null {
  return chaveTelefone(c.telefone || c.telefoneNorm || "")?.wa ?? null;
}

function combina(q: string, ...campos: (string | undefined)[]): boolean {
  if (!q) return true;
  return campos.some((v) => v && normaliza(v).includes(q));
}

/**
 * Monta as duas listas da tela.
 *
 * O casamento tenta primeiro o vínculo guardado (`clienteId`, escrito por
 * lib/canal/vinculo.ts) e só depois o telefone. A ordem importa: o vínculo é um fato
 * registrado, o telefone é uma coincidência de string — e é o telefone que já deu
 * problema antes, quando as duas pontas normalizavam diferente.
 */
export function montarLista(conversas: Conversa[], clientes: Cliente[], busca: string): Lista {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const porWa = new Map<string, Cliente>();
  for (const c of clientes) {
    const wa = waDoCliente(c);
    // Primeiro cadastro vence: dois clientes com o mesmo número é dado sujo, não é caso
    // de uso — e trocar o vencedor a cada render faria o nome da conversa piscar.
    if (wa && !porWa.has(wa)) porWa.set(wa, c);
  }

  const q = normaliza(busca.trim());
  const vinculados = new Set<string>();

  const itens: ItemConversa[] = conversas.map((conversa) => {
    const cliente =
      (conversa.clienteId ? porId.get(conversa.clienteId) : undefined) ?? porWa.get(conversa.whatsappDigits);
    if (cliente) vinculados.add(cliente.id);
    const nome = cliente?.nome || conversa.name || (conversa.whatsappDigits ? `+${conversa.whatsappDigits}` : "Sem número");
    return { conversa, cliente, nome, iniciais: iniciaisDoNome(nome) };
  });

  const semConversaTodos = clientes
    .filter((c) => !vinculados.has(c.id))
    .map((c): ItemCliente => ({ cliente: c, wa: waDoCliente(c) }));

  return {
    conversas: itens.filter((i) => combina(q, i.nome, i.conversa.whatsappDigits, i.conversa.name)),
    semConversa: semConversaTodos
      .filter((i) => combina(q, i.cliente.nome, i.cliente.telefone, i.cliente.email))
      // Quem tem telefone primeiro: são os que dá para adicionar de fato. Dentro de cada
      // grupo, ordem alfabética sem acento.
      .sort((a, b) => {
        if (!!a.wa !== !!b.wa) return a.wa ? -1 : 1;
        return normaliza(a.cliente.nome) < normaliza(b.cliente.nome) ? -1 : 1;
      }),
    // Só conta quem dá para adicionar — um contador que inclui cadastro sem telefone
    // promete uma ação que a tela não consegue cumprir.
    totalSemConversa: semConversaTodos.filter((i) => i.wa).length,
  };
}
