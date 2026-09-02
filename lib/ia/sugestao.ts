// Onde uma alucinação morre.
//
// O modelo pode pedir qualquer coisa: serviço que não existe, barbeiro de outra
// barbearia, sexta que já passou, horário que ele "acha" que está livre. Nada do que ele
// propõe é aceito de olhos fechados — tudo passa por `validarProposta` antes de virar uma
// sugestão, e a sugestão ainda passa por `criarAgendamentoValidado` antes de virar
// agendamento, quando uma pessoa confirmar.
//
// A validação é pura de propósito: dá para testar cada recusa sem um projeto do Firebase.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { horaParaMin, type IntervaloOcupado } from "@/lib/agenda";
import { diaAberto, slotsLivres } from "@/lib/disponibilidade";
import { ISO_DATE, HORA } from "@/lib/booking-core";
import type { Contexto } from "./contexto";

export interface Proposta {
  servicoId: string;
  barbeiroId: string;
  date: string; // YYYY-MM-DD
  inicio: string; // HH:MM
}

export type Validacao =
  | { ok: true; servico: { id: string; nome: string; duracaoMin: number }; barbeiro: { id: string; nome: string } }
  | { ok: false; erro: string };

/**
 * A proposta do modelo bate com a realidade da barbearia?
 *
 * As mensagens de erro são escritas para o MODELO ler e se corrigir na mesma conversa —
 * por isso dizem o que está errado, e não só "inválido".
 */
export function validarProposta(ctx: Contexto, p: Proposta, ocupados: IntervaloOcupado[]): Validacao {
  const servico = ctx.servicos.find((s) => s.id === p.servicoId);
  if (!servico) return { ok: false, erro: "Esse servicoId não existe nesta barbearia." };

  const barbeiro = ctx.barbeiros.find((b) => b.id === p.barbeiroId);
  if (!barbeiro) return { ok: false, erro: "Esse barbeiroId não existe nesta barbearia." };

  if (!ISO_DATE.test(p.date)) return { ok: false, erro: "A data precisa estar no formato AAAA-MM-DD." };
  if (!HORA.test(p.inicio)) return { ok: false, erro: "O horário precisa estar no formato HH:MM." };
  if (p.date < ctx.hojeISO) return { ok: false, erro: "Essa data já passou." };
  if (!diaAberto(ctx.barbearia.expediente, p.date)) return { ok: false, erro: "A barbearia não atende nesse dia." };

  // Não basta "não estar ocupado": tem que ser um dos horários realmente ofertáveis
  // (cabe antes de fechar, não está no passado de hoje, não encosta em nada marcado).
  const livres = slotsLivres({
    expediente: ctx.barbearia.expediente,
    ocupados,
    dateISO: p.date,
    duracaoMin: servico.duracaoMin,
    hojeISO: ctx.hojeISO,
    agoraMin: ctx.agoraMin,
  });
  if (!livres.includes(p.inicio)) {
    return {
      ok: false,
      erro: `Esse horário não está disponível. Livres nesse dia: ${livres.slice(0, 12).join(", ") || "nenhum"}.`,
    };
  }

  // Guarda contra o caso em que os slots vieram certos mas a hora é lixo ("24:30").
  if (horaParaMin(p.inicio) < 0) return { ok: false, erro: "Horário inválido." };

  return { ok: true, servico, barbeiro };
}

/**
 * Grava a sugestão. NÃO é agendamento: não ocupa horário, não impede ninguém de pegar o
 * mesmo slot, e não aparece na agenda como marcado — aparece como proposta, esperando
 * alguém confirmar.
 */
export async function gravarSugestao(
  ctx: Contexto,
  p: Proposta,
  validacao: Extract<Validacao, { ok: true }>,
): Promise<string> {
  const ref = await adminDb.collection(`tenants/${ctx.tenantId}/sugestoes`).add({
    contactId: ctx.contactId,
    ...(ctx.cliente.id ? { clienteId: ctx.cliente.id } : {}),
    clienteNome: ctx.cliente.nome ?? "",
    clienteTelefone: ctx.cliente.telefone,
    servicoId: validacao.servico.id,
    servico: validacao.servico.nome,
    barbeiroId: validacao.barbeiro.id,
    barbeiro: validacao.barbeiro.nome,
    date: p.date,
    inicio: p.inicio,
    duracaoMin: validacao.servico.duracaoMin,
    status: "pendente",
    criadoEm: new Date().toISOString(),
    criadoPor: "ia",
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Já existe uma sugestão pendente igual nesta conversa? Evita repetir o card. */
export async function sugestaoPendenteIgual(ctx: Contexto, p: Proposta): Promise<boolean> {
  const snap = await adminDb
    .collection(`tenants/${ctx.tenantId}/sugestoes`)
    .where("contactId", "==", ctx.contactId)
    .where("status", "==", "pendente")
    .get();
  return snap.docs.some((d) => d.get("date") === p.date && d.get("inicio") === p.inicio);
}
