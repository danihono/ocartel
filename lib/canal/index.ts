// Canal de mensagens — a porta trocável entre O Cartel e o WhatsApp.
//
// TUDO que envia mensagem passa por aqui. Nada fora desta pasta pode saber COMO a
// mensagem sai: hoje é um daemon Baileys self-hosted, amanhã pode ser a API oficial da
// Meta. Trocar significa escrever outro arquivo nesta pasta e mudar a fábrica no fim —
// sem tocar em quem chama.
//
// Só servidor (Admin SDK). Nunca importe de um componente do cliente.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

export interface Canal {
  /** `telefone` em dígitos com DDI (ex.: "5519998887766"). */
  enviarMensagem(telefone: string, texto: string): Promise<void>;
}

/** Onde fica o vínculo entre a barbearia e a conta de WhatsApp que fala por ela. */
interface VinculoWhatsApp {
  /** uid sob o qual o daemon mantém a sessão desta barbearia. */
  uid: string;
  /** Número da barbearia, só para exibição/diagnóstico. */
  numero?: string;
}

export class WhatsAppNaoConfigurado extends Error {
  constructor(tenantId: string) {
    super(`Barbearia ${tenantId} não tem WhatsApp vinculado.`);
    this.name = "WhatsAppNaoConfigurado";
  }
}

async function vinculoDoTenant(tenantId: string): Promise<VinculoWhatsApp> {
  const snap = await adminDb.doc(`tenants/${tenantId}/private/whatsapp`).get();
  const uid = snap.exists ? String(snap.data()?.uid ?? "") : "";
  if (!uid) throw new WhatsAppNaoConfigurado(tenantId);
  return { uid, numero: snap.data()?.numero };
}

export function apenasDigitos(telefone: string): string {
  return String(telefone ?? "").replace(/\D/g, "");
}

/**
 * Adaptador do daemon self-hosted (Baileys).
 *
 * O daemon veio do CRM Titãs e sua ação `message.send` exige um contato no formato
 * DELE — `users/{uid}/contacts/{contactId}` com o telefone. O Cartel guarda clientes em
 * `tenants/{id}/clientes`, que é outra forma. Em vez de alterar o daemon (que roda
 * também para o Titãs, em produção), garantimos aqui o documento que ele espera.
 *
 * O efeito colateral é bem-vindo: a conversa fica espelhada em `users/{uid}/contacts`,
 * que é de onde o atendente com IA vai ler o histórico na etapa seguinte.
 */
class CanalDaemon implements Canal {
  constructor(private readonly uid: string) {}

  async enviarMensagem(telefone: string, texto: string): Promise<void> {
    const digits = apenasDigitos(telefone);
    if (digits.length < 10) throw new Error(`Telefone inválido para envio: "${telefone}"`);

    const contactId = `wa_${digits}`;
    const contactRef = adminDb.doc(`users/${this.uid}/contacts/${contactId}`);

    // merge: não sobrescreve nome/foto que o daemon já tenha resolvido.
    await contactRef.set(
      {
        whatsappDigits: digits,
        whatsapp: digits,
        waJid: `${digits}@s.whatsapp.net`,
        source: "whatsapp",
        // createdAt é obrigatório para o contato aparecer nas listas ordenadas do daemon.
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // O daemon escuta esta coleção por collection group query e devolve o resultado no
    // próprio doc. Aqui não esperamos a resposta: confirmação é fire-and-forget.
    await adminDb.collection(`users/${this.uid}/waCommands`).add({
      type: "message.send",
      args: { contactId, text: texto },
      status: "pending",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      // Casado com o TTL nativo configurado em `expireAt` do lado do daemon.
      expireAt: Timestamp.fromMillis(Date.now() + 3_600_000),
    });
  }
}

/** Devolve o canal da barbearia. Lança `WhatsAppNaoConfigurado` se não houver vínculo. */
export async function canalDoTenant(tenantId: string): Promise<Canal> {
  const { uid } = await vinculoDoTenant(tenantId);
  return new CanalDaemon(uid);
}
