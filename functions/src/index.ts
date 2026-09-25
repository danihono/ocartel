// Os gatilhos do O Cartel — e nada além deles.
//
// Duas funções, o mesmo desenho: acordam por um motivo (mensagem nova, hora cheia) e
// avisam uma rota do site, que é onde mora toda a regra. Elas não sabem nada de agenda, de
// cobrança nem de Gemini, e quase nunca mudam.
//
// ---- atendenteWhatsapp ----
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
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) initializeApp();

const IA_SECRET = defineSecret("IA_SECRET");
// O MESMO segredo que o site lê (declarado no firebase.json). Um segredo só, dos dois
// lados: não há como os valores divergirem.
const COBRANCAS_SECRET = defineSecret("COBRANCAS_SECRET");
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

    // Mensagem NOSSA: nunca responder a si mesmo — seria um laço com o próprio robô.
    //
    // Mas ela carrega uma informação que o CRM não tinha: alguém respondeu essa conversa,
    // provavelmente pelo celular. O daemon incrementa `unreadCount` no que chega e não tem
    // como zerá-lo quando a resposta sai por fora do sistema — então o Cartel mostrava
    // "não lidas" numa conversa que já tinha sido lida E respondida.
    //
    // Aqui é o único lugar que vê esse evento no instante em que ele acontece, então é
    // aqui que o contador se acerta.
    if (dados.fromMe === true) {
      if (dados.importedFromHistory !== true) {
        await getFirestore()
          .doc(`users/${uid}/contacts/${contactId}`)
          .set({ unreadCount: 0 }, { merge: true })
          .catch((err) => logger.warn("não consegui zerar as não lidas", err));
      }
      return;
    }

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

      // Registra SEMPRE, e não só no erro. O site responde 200 tanto quando atende quanto
      // quando decide calar a boca (conversa pausada, teto do dia, chegou mensagem mais
      // nova, atendente desligado...) — e o motivo vem no corpo. Logando só o erro, um
      // silêncio proposital ficava indistinguível de um silêncio quebrado, e não havia
      // onde olhar.
      const corpo = await resp.text();
      if (resp.ok) logger.info("site respondeu", resp.status, corpo);
      else logger.warn("site respondeu", resp.status, corpo);
    } catch (err) {
      // Falhar aqui não pode derrubar nada: a mensagem já está espelhada e visível na tela.
      logger.error("não foi possível avisar o site", err);
    }
  },
);

// ---- cicloCobranca ----
//
// O relógio da cobrança automática.
//
// O site não tem relógio: ele só roda quando alguém acessa. Mas o ciclo de cobrança —
// gerar as mensalidades, avisar quem vence, debitar o cartão, emitir o boleto — precisa
// acontecer sozinho. Então esta função bate na rota `/api/cobrancas/ciclo` de hora em hora,
// com o segredo no header, e é só isso que ela faz.
//
// Quem decide QUAIS barbearias rodam naquela hora é a rota, olhando a configuração de cada
// uma (`config.cobranca.hora`). Por isso aqui não há lista de barbearias nem horário por
// cliente: uma barbearia nova, ou uma que muda a hora do ciclo, não exige redeploy.
//
// Antes, o desenho era um timer numa máquina externa. Mora aqui para não depender de
// máquina nenhuma ficar ligada: se o ciclo parar, a cobrança para calada.
export const cicloCobranca = onSchedule(
  {
    // Minuto 5, não 0: longe da virada da hora, que é onde o "que horas são em Brasília"
    // da rota teria menos folga. A rota calcula o fuso sozinha — este timeZone é só para o
    // agendamento ser legível no console.
    schedule: "5 * * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [COBRANCAS_SECRET],
    // Sem retentativa aqui: a próxima hora É a retentativa. A rota tem janela de 2 horas e
    // travas gravadas em cada etapa, então repetir é seguro — mas repetir na mesma hora
    // não ganha nada.
    retryCount: 0,
    // O ciclo percorre todas as barbearias e fala com o gateway (15s de teto por chamada).
    timeoutSeconds: 300,
  },
  async () => {
    const base = SITE_URL.value();
    if (!base) {
      // Lança para o erro aparecer como falha no agendador, e não como um sucesso mudo.
      throw new Error("SITE_URL não configurada — o ciclo de cobrança não tem onde rodar.");
    }

    const resp = await fetch(`${base.replace(/\/$/, "")}/api/cobrancas/ciclo`, {
      method: "POST",
      headers: { "x-cobrancas-secret": COBRANCAS_SECRET.value() },
      signal: AbortSignal.timeout(280_000),
    });

    // A rota devolve, por barbearia, o que fez: mensalidades geradas, avisos, cartões
    // cobrados, recusas, boletos, falhas. Logar SEMPRE é o que faz o console do Firebase
    // responder "a cobrança rodou? o que ela fez?" sem ninguém precisar reproduzir nada.
    const corpo = await resp.text();
    if (resp.ok) {
      logger.info("ciclo de cobrança", corpo);
      return;
    }

    // 401 = segredo diferente entre a função e o site; 500 = segredo ausente no site.
    // Lança para marcar a execução como falha — um ciclo quebrado não pode parecer ok.
    logger.error("ciclo de cobrança falhou", resp.status, corpo);
    throw new Error(`ciclo de cobrança respondeu ${resp.status}`);
  },
);
