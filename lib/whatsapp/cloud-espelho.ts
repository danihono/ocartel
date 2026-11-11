// O espelho das conversas, alimentado pela API oficial.
//
// Com o daemon, era ELE quem gravava `users/{uid}/contacts/**`. Com a Cloud API, quem
// grava é o webhook (o que chega) e o canal (o que sai) — e os dois escrevem exatamente os
// campos que o daemon escrevia. É isso que deixa a tela de WhatsApp, as não lidas e o
// atendente com IA (que acorda em `onDocumentCreated` das mensagens) funcionando sem
// saber que o transporte mudou.
//
// Só servidor (Admin SDK).

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { iniciaisDe } from "@/lib/clientes-import";
import { contactIdDoTelefone } from "@/lib/telefone";
import { clienteDoTelefone } from "@/lib/canal/vinculo";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { erroAmigavel, idDoc, type ContatoCloud, type MensagemCloud, type StatusCloud } from "./cloud";

/** Índice `phone_number_id → barbearia`: o webhook só sabe o número que recebeu. */
export function refNumero(phoneNumberId: string) {
  return adminDb.doc(`whatsappNumeros/${phoneNumberId}`);
}

export async function tenantDoNumero(phoneNumberId: string): Promise<string | null> {
  const snap = await refNumero(phoneNumberId).get();
  const tenantId = snap.exists ? String(snap.get("tenantId") ?? "") : "";
  return tenantId || null;
}

/**
 * Acha a conversa deste número, ou cria.
 *
 * O id é o mesmo `wa_<digits>` que o daemon usava, então quem já conversava antes da
 * troca continua na mesma conversa, com o histórico. Conversa nova nasce com o nome do
 * cadastro quando o número é de um cliente — e já vinculada a ele.
 */
async function garantirConversa(tenantId: string, m: Pick<MensagemCloud, "numero" | "waId" | "nomePerfil" | "fromMe">) {
  const uid = uidDaBarbearia(tenantId);
  const contactId = contactIdDoTelefone(m.numero);
  const ref = adminDb.doc(`users/${uid}/contacts/${contactId}`);
  const snap = await ref.get();

  if (snap.exists && snap.get("createdAt") !== undefined) {
    // `waId` é para onde a resposta sai: guarda o que a Meta usa, que pode não ter o 9.
    if (snap.get("waId") !== m.waId) await ref.set({ waId: m.waId }, { merge: true });
    return { ref, contactId };
  }

  const [cliente, celular] = await Promise.all([
    clienteDoTelefone(tenantId, m.numero).catch(() => null),
    refAgenda(tenantId, m.numero)
      .get()
      .then((d) => String(d.get("nome") ?? ""))
      .catch(() => ""),
  ]);
  // Nome de perfil só vale para quem ESCREVEU: num eco, o perfil seria o da barbearia.
  const perfil = m.fromMe ? "" : (m.nomePerfil ?? "").trim();
  // O cadastro vence; depois o nome salvo no celular da barbearia; depois o perfil.
  const nome = cliente?.nome || celular || perfil || `+${m.numero}`;

  await ref.set(
    {
      name: nome,
      initials: iniciaisDe(nome) || "?",
      nameSource: cliente?.nome ? "agenda" : celular ? "celular" : perfil ? "profile" : "phone",
      phone: m.numero,
      whatsapp: m.numero,
      whatsappDigits: m.numero,
      waJid: `${m.numero}@s.whatsapp.net`,
      waId: m.waId,
      source: "whatsapp",
      status: "WhatsApp",
      lastMessage: "",
      tenantId,
      ...(cliente ? { clienteId: cliente.id } : {}),
      // createdAt é obrigatório para a conversa aparecer nas listas ordenadas.
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (cliente) {
    await adminDb
      .doc(`tenants/${tenantId}/clientes/${cliente.id}`)
      .update({ waContactId: contactId })
      .catch(() => {});
  }

  return { ref, contactId };
}

/** Os campos de uma mensagem no espelho — os mesmos que o daemon gravava. */
function camposMensagem(m: MensagemCloud) {
  return {
    fromMe: m.fromMe,
    text: m.text,
    sentAt: Timestamp.fromDate(m.sentAt),
    channel: "whatsapp",
    waMessageId: m.wamid,
    // Mídia: o arquivo ainda está na Meta. Fica `pending` até alguém baixar.
    pending: Boolean(m.mediaType),
    ...(m.mediaType
      ? {
          mediaType: m.mediaType,
          ...(m.waMediaId ? { waMediaId: m.waMediaId } : {}),
          ...(m.mimeType ? { mimeType: m.mimeType } : {}),
          ...(m.fileName ? { fileName: m.fileName } : {}),
          ...(m.caption ? { caption: m.caption } : {}),
        }
      : {}),
  };
}

/**
 * Grava uma mensagem que chegou pelo webhook (do cliente, ou eco do celular).
 *
 * Devolve `false` quando ela já estava gravada: a Meta reentrega o mesmo evento quando
 * não recebe 200 a tempo, e contar a mesma mensagem duas vezes nas não lidas — ou
 * acordar a IA duas vezes — seria o efeito.
 */
export async function gravarMensagem(tenantId: string, m: MensagemCloud): Promise<boolean> {
  const { ref: contato } = await garantirConversa(tenantId, m);
  const msgRef = contato.collection("messages").doc(idDoc(m.wamid));

  const sentAt = Timestamp.fromDate(m.sentAt);
  const novo = await adminDb.runTransaction(async (tx) => {
    if ((await tx.get(msgRef)).exists) return false;
    tx.set(msgRef, camposMensagem(m));
    tx.set(
      contato,
      {
        lastMessage: m.text,
        lastMessageAt: sentAt,
        // Só o que CHEGOU conta como não lida — o eco é a própria barbearia falando.
        ...(m.fromMe ? {} : { unreadCount: FieldValue.increment(1) }),
      },
      { merge: true },
    );
    return true;
  });

  return novo;
}

/** Quantas conversas do histórico são gravadas ao mesmo tempo. */
const CONVERSAS_EM_PARALELO = 8;
/** Abaixo do teto de 500 operações por lote do Firestore. */
const MENSAGENS_POR_LOTE = 400;

/**
 * Grava o histórico que a Meta entrega depois da conexão (Coexistência).
 *
 * É outro caminho que o da mensagem ao vivo porque o volume é outro: um único webhook pode
 * trazer milhares de mensagens, e uma transação por mensagem estouraria o tempo da rota.
 * Aqui vai em lotes, conversa por conversa, sem contar não lida — é conversa velha, já
 * vista no celular. O `importedFromHistory` é o que faz a Cloud Function do atendente
 * ignorá-las (ver functions/src/index.ts): sem ele a IA responderia meses de conversa.
 *
 * Idempotente: o id é o wamid, e a Meta reentrega o mesmo pedaço se não receber 200.
 */
export async function gravarHistorico(tenantId: string, mensagens: MensagemCloud[]): Promise<number> {
  const porNumero = new Map<string, MensagemCloud[]>();
  for (const m of mensagens) porNumero.set(m.numero, [...(porNumero.get(m.numero) ?? []), m]);
  const fila = [...porNumero.values()];
  let gravadas = 0;

  const trabalhador = async () => {
    for (let daConversa = fila.shift(); daConversa; daConversa = fila.shift()) {
      const { ref: contato } = await garantirConversa(tenantId, daConversa[0]);
      for (let i = 0; i < daConversa.length; i += MENSAGENS_POR_LOTE) {
        const lote = adminDb.batch();
        for (const m of daConversa.slice(i, i + MENSAGENS_POR_LOTE)) {
          lote.set(
            contato.collection("messages").doc(idDoc(m.wamid)),
            { ...camposMensagem(m), importedFromHistory: true },
            { merge: true },
          );
        }
        await lote.commit();
      }
      gravadas += daConversa.length;

      // O preview da lista só anda para a frente: o histórico chega fora de ordem, e uma
      // mensagem de três meses atrás não pode passar na frente da de hoje.
      const maisNova = daConversa.reduce((a, b) => (b.sentAt > a.sentAt ? b : a));
      await adminDb.runTransaction(async (tx) => {
        const atual = (await tx.get(contato)).get("lastMessageAt");
        if (atual instanceof Timestamp && atual.toMillis() >= maisNova.sentAt.getTime()) return;
        tx.set(
          contato,
          { lastMessage: maisNova.text, lastMessageAt: Timestamp.fromDate(maisNova.sentAt) },
          { merge: true },
        );
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONVERSAS_EM_PARALELO, fila.length) }, trabalhador));
  return gravadas;
}

/**
 * O nome que a barbearia deu ao contato no celular. Fica aninhado em `private/whatsapp`,
 * fora do alcance das regras do navegador, porque é a agenda inteira do aparelho — inclusive
 * quem nunca foi cliente.
 */
function refAgenda(tenantId: string, numero: string) {
  return adminDb.doc(`tenants/${tenantId}/private/whatsapp/agenda/${numero}`);
}

/**
 * Aplica a agenda do celular (Coexistência): guarda os nomes e renomeia as conversas que
 * ainda aparecem só com o número ou com o nome de perfil. Quem está no cadastro mantém o
 * nome do cadastro.
 *
 * A agenda chega ANTES do histórico — por isso os nomes ficam guardados: é de lá que
 * `garantirConversa` tira o nome das conversas que o histórico ainda vai criar.
 */
export async function aplicarContatos(tenantId: string, contatos: ContatoCloud[]): Promise<void> {
  const uid = uidDaBarbearia(tenantId);
  for (let i = 0; i < contatos.length; i += MENSAGENS_POR_LOTE) {
    const pedaco = contatos.slice(i, i + MENSAGENS_POR_LOTE);
    const conversas = await adminDb.getAll(
      ...pedaco.map((ct) => adminDb.doc(`users/${uid}/contacts/${contactIdDoTelefone(ct.numero)}`)),
    );
    const lote = adminDb.batch();
    pedaco.forEach((ct, j) => {
      if (ct.acao === "remove" || !ct.nome) {
        lote.delete(refAgenda(tenantId, ct.numero));
        return;
      }
      lote.set(refAgenda(tenantId, ct.numero), { nome: ct.nome, em: FieldValue.serverTimestamp() });
      const conversa = conversas[j];
      const fonte = conversa.get("nameSource");
      if (conversa.exists && (fonte === "profile" || fonte === "phone" || fonte === "celular")) {
        lote.set(conversa.ref, { name: ct.nome, initials: iniciaisDe(ct.nome) || "?", nameSource: "celular" }, { merge: true });
      }
    });
    await lote.commit();
  }
}

/**
 * Grava no espelho a mensagem que NÓS mandamos pela API. Com o daemon isso vinha de
 * graça (ele via a própria mensagem passar); aqui, se não gravarmos, a conversa na tela
 * fica sem a resposta.
 */
export async function gravarEnviada(
  tenantId: string,
  contactId: string,
  wamid: string,
  texto: string,
  waId?: string,
): Promise<string> {
  const contato = adminDb.doc(`users/${uidDaBarbearia(tenantId)}/contacts/${contactId}`);
  const id = idDoc(wamid);
  const agora = Timestamp.now();
  const batch = adminDb.batch();
  batch.set(
    contato.collection("messages").doc(id),
    { fromMe: true, text: texto, sentAt: agora, channel: "whatsapp", waMessageId: wamid, pending: false, waStatus: "accepted" },
    { merge: true },
  );
  batch.set(contato, { lastMessage: texto, lastMessageAt: agora, ...(waId ? { waId } : {}) }, { merge: true });
  await batch.commit();
  return id;
}

/**
 * Entregue, lida, falhou. Só ATUALIZA: status de mensagem que não está no espelho (uma
 * mandada por fora do sistema) não vira documento — nasceria sem texto nem data.
 */
export async function gravarStatus(tenantId: string, s: StatusCloud): Promise<void> {
  const ref = adminDb.doc(
    `users/${uidDaBarbearia(tenantId)}/contacts/${contactIdDoTelefone(s.numero)}/messages/${idDoc(s.wamid)}`,
  );
  await ref
    .update({
      waStatus: s.status,
      // A falha chega DEPOIS do envio (a Meta aceita e só então recusa), então é aqui, e
      // não no retorno do canal, que a tela fica sabendo — em português.
      ...(s.erro ? { erroEnvio: erroAmigavel(s.erro.codigo, s.erro.mensagem) } : {}),
    })
    .catch((err: { code?: number }) => {
      // 5 = NOT_FOUND. Qualquer outro erro é de verdade e sobe.
      if (err?.code !== 5) throw err;
    });
}
