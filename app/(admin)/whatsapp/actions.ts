"use server";

// Server actions da tela de WhatsApp.
//
// A tela LÊ o espelho direto do Firestore (ao vivo, liberado por firestore.rules), mas
// ESCREVE só por aqui: enfileirar comando para o daemon e mexer no contato exigem o Admin
// SDK, e o navegador não pode ganhar essa caneta. Toda action passa por
// `exigirQuemGerencia` antes de qualquer efeito.

import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/canal/autorizacao";
import { canalDoTenant, garantirContato, pedirFotoDePerfil, type EnvioResultado } from "@/lib/canal";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { vincular } from "@/lib/canal/vinculo";
import { chaveTelefone, contactIdDoTelefone } from "@/lib/telefone";
import { pausarPorHumano } from "@/lib/ia/atender";

/** Quanto a tela espera pelo daemon antes de deixar o espelho terminar a história. */
const ESPERA_ENVIO_MS = 12_000;

/**
 * Cria a conversa de UM cliente do cadastro e grava o vínculo. Não envia nada.
 *
 * O telefone é lido do Firestore aqui dentro, e não recebido do navegador: uma action é
 * endpoint acessível, e aceitar telefone do cliente transformaria isto num jeito de criar
 * contato para qualquer número.
 *
 * Idempotente — o id do contato é determinístico, então clicar duas vezes não duplica.
 */
export async function acaoAdicionarConversa(
  idToken: string,
  tenantId: string,
  clienteId: string,
): Promise<Resultado & { contactId?: string }> {
  try {
    await exigirQuemGerencia(idToken, tenantId);

    const snap = await adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).get();
    if (!snap.exists) return { ok: false, erro: "Cliente não encontrado." };

    const chave = chaveTelefone(String(snap.get("telefone") ?? snap.get("telefoneNorm") ?? ""));
    if (!chave) return { ok: false, erro: "Este cliente não tem um telefone válido no cadastro." };

    const contactId = await garantirContato(uidDaBarbearia(tenantId), chave.wa, {
      nome: String(snap.get("nome") ?? ""),
      clienteId,
      tenantId,
    });
    await vincular(tenantId, clienteId, chave.wa);

    // A foto vem depois, sozinha: o daemon busca e grava, e a tela reage ao snapshot.
    await pedirFotoDePerfil(uidDaBarbearia(tenantId), contactId).catch(() => {});

    return { ok: true, contactId };
  } catch (err) {
    return comoResultado(err);
  }
}

/**
 * Manda uma mensagem escrita por uma pessoa.
 *
 * Espera a resposta do daemon por alguns segundos, ao contrário dos envios automáticos
 * (confirmação, cobrança), que são fire-and-forget: aqui tem alguém olhando a tela, e os
 * erros que importam — WhatsApp desconectado, número que não existe — voltam em menos de
 * um segundo. Se estourar a espera, `pendente` avisa que ainda pode dar certo, e a
 * mensagem aparece na conversa quando o daemon a gravar no espelho.
 */
export async function acaoEnviarMensagem(
  idToken: string,
  tenantId: string,
  telefone: string,
  texto: string,
  clienteId?: string,
): Promise<EnvioResultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);

    const corpo = texto.trim();
    if (!corpo) return { ok: false, erro: "Escreva a mensagem antes de enviar." };
    if (corpo.length > 4000) return { ok: false, erro: "Mensagem longa demais para o WhatsApp." };
    if (!chaveTelefone(telefone)) return { ok: false, erro: "Número inválido." };

    let nome: string | undefined;
    if (clienteId) {
      const snap = await adminDb.doc(`tenants/${tenantId}/clientes/${clienteId}`).get();
      if (snap.exists) {
        nome = String(snap.get("nome") ?? "");
        await vincular(tenantId, clienteId, telefone);
      }
    }

    // Uma pessoa assumiu a conversa: o atendente automático cala a boca aqui por algumas
    // horas. Duas vozes respondendo o mesmo cliente é pior do que nenhuma.
    const chave = chaveTelefone(telefone)!;
    await pausarPorHumano(tenantId, contactIdDoTelefone(chave.wa)).catch(() => {});

    const canal = await canalDoTenant(tenantId);
    return await canal.enviarMensagem(telefone, corpo, { nome, clienteId, aguardarMs: ESPERA_ENVIO_MS });
  } catch (err) {
    return comoResultado(err);
  }
}

/**
 * Pede a foto de perfil de uma conversa, no máximo UMA vez por contato.
 *
 * O marcador em `tenants/{t}/conversas/{contactId}` é o que impede a tela de pedir de novo
 * a cada abertura: quem não tem foto no WhatsApp (ou escondeu por privacidade) nunca vai
 * ter, e insistir a cada clique só gastaria a conexão. Se a busca falhar de vez, a
 * conversa segue com as iniciais — que é o que já acontecia.
 */
export async function acaoBuscarFoto(
  idToken: string,
  tenantId: string,
  contactId: string,
): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);

    const ref = adminDb.doc(`tenants/${tenantId}/conversas/${contactId}`);
    const snap = await ref.get();
    if (snap.get("fotoTentadaEm")) return { ok: true };

    await ref.set({ fotoTentadaEm: new Date().toISOString() }, { merge: true });
    await pedirFotoDePerfil(uidDaBarbearia(tenantId), contactId);
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}

/** Zera o contador de não lidas ao abrir a conversa (quem incrementa é o daemon). */
export async function acaoMarcarLida(idToken: string, tenantId: string, contactId: string): Promise<Resultado> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    await adminDb
      .doc(`users/${uidDaBarbearia(tenantId)}/contacts/${contactId}`)
      .set({ unreadCount: 0 }, { merge: true });
    return { ok: true };
  } catch (err) {
    return comoResultado(err);
  }
}
