// O gatilho do atendente automático — e nada além disso.
//
// Quando o daemon de WhatsApp grava uma mensagem no espelho, esta função acorda e avisa o
// site. Toda a inteligência (contexto, modelo, agenda, sugestão) mora lá, em
// app/api/ia/responder: é onde `lib/agenda`, `lib/booking-core` e `lib/canal` já existem e
// são testados. Uma segunda cópia da regra de horário livre aqui dentro seria a forma mais
// rápida de a IA oferecer um horário que a barbearia não tem.
//
// Por isso este arquivo não conhece Gemini, não conhece agenda e quase nunca muda. Ele só
// descarta o que não vale uma chamada HTTP e repassa o resto.

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";

const IA_SECRET = defineSecret("IA_SECRET");
const SITE_URL = defineString("SITE_URL");

/** Mensagem mais velha que isso é passado — o site confere de novo, aqui é só para não gastar. */
const IDADE_MAXIMA_MS = 5 * 60 * 1000;

export const atendenteWhatsapp = onDocumentCreated(
  {
    document: "users/{uid}/contacts/{contactId}/messages/{messageId}",
    region: "southamerica-east1",
    secrets: [IA_SECRET],
    // Sem instância parada: a fatura só existe quando alguém manda mensagem.
    minInstances: 0,
    maxInstances: 10,
  },
  async (event) => {
    const { uid, contactId, messageId } = event.params;

    // Só as sessões de barbearia. O espelho é por uid, e "barbearia-" é o prefixo que o
    // Cartel usa (ver lib/canal/uid.ts).
    if (!uid.startsWith("barbearia-")) return;

    const dados = event.data?.data();
    if (!dados) return;

    // Nunca responder a si mesmo — seria um laço com o próprio robô.
    if (dados.fromMe === true) return;

    // Importação de histórico despeja meses de conversa de uma vez. Sem esta linha, a
    // primeira sincronização faria a IA responder tudo aquilo, uma mensagem por vez.
    if (dados.importedFromHistory === true) return;

    const enviadaEm = dados.sentAt?.toMillis?.() ?? 0;
    if (enviadaEm && Date.now() - enviadaEm > IDADE_MAXIMA_MS) return;

    const base = SITE_URL.value();
    if (!base) {
      logger.error("SITE_URL não configurada — o atendente automático não tem para onde avisar.");
      return;
    }

    try {
      const resp = await fetch(`${base.replace(/\/$/, "")}/api/ia/responder`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ia-secret": IA_SECRET.value() },
        body: JSON.stringify({ uid, contactId, messageId }),
      });
      if (!resp.ok) logger.warn("site respondeu", resp.status, await resp.text());
    } catch (err) {
      // Falhar aqui não pode derrubar nada: a mensagem já está espelhada e visível na tela.
      logger.error("não foi possível avisar o site", err);
    }
  },
);
