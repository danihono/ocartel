// A API oficial do WhatsApp (Cloud API da Meta) — a parte que não toca no Firestore.
//
// Aqui mora o que dá para testar sem banco nem rede: conferir a assinatura do webhook,
// traduzir o JSON da Meta para o formato do espelho, consertar o nono dígito e montar o
// pedido de envio. Quem grava no espelho é `cloud-espelho.ts`; quem decide por qual
// caminho a mensagem sai é `lib/canal`.
//
// Sem "use client" e sem firebase-admin: pode ser importado em qualquer lugar do servidor
// e nos testes.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Versão da Graph API. Troca por variável para não depender de redeploy de código. */
export function versaoGraph(): string {
  return process.env.WHATSAPP_GRAPH_VERSION || "v27.0";
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Confere o `X-Hub-Signature-256` que a Meta manda em todo POST do webhook.
 *
 * A rota é pública — a Meta precisa alcançá-la —, então esta é a única coisa que separa
 * uma mensagem de cliente de um JSON forjado por quem descobriu a URL. A conta é feita
 * sobre o corpo CRU: reserializar o JSON muda espaços e a assinatura deixa de bater.
 */
export function assinaturaConfere(corpoCru: string, cabecalho: string | null, appSecret: string): boolean {
  if (!cabecalho || !appSecret) return false;
  const recebida = cabecalho.startsWith("sha256=") ? cabecalho.slice("sha256=".length) : "";
  if (!/^[0-9a-f]{64}$/i.test(recebida)) return false;
  const esperada = createHmac("sha256", appSecret).update(corpoCru, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(recebida.toLowerCase(), "hex"), Buffer.from(esperada, "hex"));
}

// ---------------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------------

/**
 * O número como o resto do sistema guarda: com o nono dígito.
 *
 * A Meta identifica a pessoa pelo `wa_id`, e conta de WhatsApp criada antes de 2016 tem
 * `wa_id` brasileiro SEM o 9 (`551984487271`). O cadastro da barbearia tem o número com
 * ele (`5519984487271`) — e como o id da conversa sai do número (`wa_<digits>`), sem este
 * conserto a mesma pessoa viraria duas conversas.
 *
 * Só celular ganha o 9: os oito dígitos de celular começam de 6 a 9; fixo começa de 2 a 5
 * e fica como está.
 */
export function numeroDoWaId(waId: string): string {
  const d = String(waId ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4])) {
    return `${d.slice(0, 4)}9${d.slice(4)}`;
  }
  return d;
}

/** O id do documento da mensagem: o `wamid` com `/` trocado, como o daemon fazia. */
export function idDoc(wamid: string): string {
  return wamid.replace(/[/\\]/g, "_");
}

// ---------------------------------------------------------------------------
// Leitura do webhook
// ---------------------------------------------------------------------------

export type TipoMidia = "image" | "video" | "audio" | "document" | "sticker";

/** Uma mensagem já no formato do espelho (os mesmos campos que o daemon gravava). */
export interface MensagemCloud {
  /** `wamid` cru da Meta. */
  wamid: string;
  /** Número do cliente, com o nono dígito. */
  numero: string;
  /** `wa_id` como a Meta mandou — é para ele que a resposta deve sair. */
  waId: string;
  /** Mensagem escrita pela barbearia no celular (Coexistência), e não pelo cliente. */
  fromMe: boolean;
  sentAt: Date;
  /** Texto, ou o rótulo da mídia ("📷 Foto") quando não há legenda. */
  text: string;
  /** Nome de perfil do WhatsApp, quando a Meta manda. */
  nomePerfil?: string;
  mediaType?: TipoMidia;
  /** Id da mídia na Meta: o arquivo é baixado depois, com o token. */
  waMediaId?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
}

export type StatusEnvio = "sent" | "delivered" | "read" | "failed";

export interface StatusCloud {
  wamid: string;
  numero: string;
  status: StatusEnvio;
  em: Date;
  /** Código e texto do erro, só em `failed`. */
  erro?: { codigo: number; mensagem: string };
}

/** Tudo que um POST do webhook trouxe para UM número da barbearia. */
export interface LoteCloud {
  phoneNumberId: string;
  mensagens: MensagemCloud[];
  status: StatusCloud[];
}

const ROTULO_MIDIA: Record<TipoMidia, string> = {
  image: "📷 Foto",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
};

// O JSON da Meta é aninhado e cheio de opcionais. Tipar tudo seria fingir uma garantia que
// não existe; lemos com cuidado, campo a campo.
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

function dataDoTimestamp(v: unknown): Date {
  const s = Number(v);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : new Date();
}

/**
 * Traduz o corpo de uma mensagem da Meta. Devolve `null` para o que não é conversa
 * (reação, aviso de sistema, mensagem apagada) — isso não vira linha no espelho.
 */
function conteudo(m: Obj): Pick<MensagemCloud, "text" | "mediaType" | "waMediaId" | "mimeType" | "fileName" | "caption"> | null {
  const tipo = texto(m.type);

  if (tipo === "text") return { text: texto(obj(m.text).body) };

  if (tipo === "image" || tipo === "video" || tipo === "audio" || tipo === "document" || tipo === "sticker") {
    const midia = obj(m[tipo]);
    const caption = texto(midia.caption).trim();
    const fileName = texto(midia.filename);
    return {
      text: caption || (tipo === "document" && fileName ? `📄 ${fileName}` : ROTULO_MIDIA[tipo]),
      mediaType: tipo,
      ...(texto(midia.id) ? { waMediaId: texto(midia.id) } : {}),
      ...(texto(midia.mime_type) ? { mimeType: texto(midia.mime_type) } : {}),
      ...(fileName ? { fileName } : {}),
      ...(caption ? { caption } : {}),
    };
  }

  // Botão de template ("Confirmar", "Remarcar") e resposta de lista: o que importa para a
  // conversa — e para a IA — é o texto que a pessoa escolheu.
  if (tipo === "button") return { text: texto(obj(m.button).text) };
  if (tipo === "interactive") {
    const i = obj(m.interactive);
    const escolha = obj(i.button_reply).title || obj(i.list_reply).title;
    return { text: texto(escolha) };
  }

  if (tipo === "location") {
    const l = obj(m.location);
    const nome = texto(l.name) || texto(l.address);
    return { text: `📍 Localização${nome ? `: ${nome}` : ""}` };
  }
  if (tipo === "contacts") return { text: "👤 Contato compartilhado" };

  // `unsupported` é o que a Meta ainda não entrega pela API (enquete, mensagem de
  // visualização única...). Melhor um aviso na conversa do que a mensagem sumir calada.
  if (tipo === "unsupported") return { text: "Mensagem não suportada — veja no celular" };

  return null;
}

/**
 * Lê um POST do webhook e separa, por número da barbearia, o que é mensagem e o que é
 * atualização de status. Campos que não conhecemos são ignorados — a Meta acrescenta
 * eventos com frequência, e nenhum deles pode derrubar a rota.
 */
export function lerWebhook(corpo: unknown): LoteCloud[] {
  const lotes = new Map<string, LoteCloud>();
  const loteDe = (id: string) => {
    let l = lotes.get(id);
    if (!l) lotes.set(id, (l = { phoneNumberId: id, mensagens: [], status: [] }));
    return l;
  };

  for (const entry of lista(obj(corpo).entry)) {
    for (const change of lista(obj(entry).changes)) {
      const campo = texto(obj(change).field);
      const value = obj(obj(change).value);
      const phoneNumberId = texto(obj(value.metadata).phone_number_id);
      if (!phoneNumberId) continue;

      // Mensagem do cliente.
      if (campo === "messages") {
        const nomes = new Map<string, string>();
        for (const c of lista(value.contacts)) {
          const nome = texto(obj(obj(c).profile).name).trim();
          if (nome) nomes.set(texto(obj(c).wa_id), nome);
        }

        for (const bruto of lista(value.messages)) {
          const m = obj(bruto);
          const waId = texto(m.from);
          const c = conteudo(m);
          if (!waId || !texto(m.id) || !c) continue;
          loteDe(phoneNumberId).mensagens.push({
            wamid: texto(m.id),
            numero: numeroDoWaId(waId),
            waId,
            fromMe: false,
            sentAt: dataDoTimestamp(m.timestamp),
            ...(nomes.get(waId) ? { nomePerfil: nomes.get(waId) } : {}),
            ...c,
          });
        }

        for (const bruto of lista(value.statuses)) {
          const s = obj(bruto);
          const status = texto(s.status) as StatusEnvio;
          if (!["sent", "delivered", "read", "failed"].includes(status) || !texto(s.id)) continue;
          const e = obj(lista(s.errors)[0]);
          loteDe(phoneNumberId).status.push({
            wamid: texto(s.id),
            numero: numeroDoWaId(texto(s.recipient_id)),
            status,
            em: dataDoTimestamp(s.timestamp),
            ...(status === "failed"
              ? { erro: { codigo: Number(e.code ?? 0), mensagem: texto(obj(e.error_data).details) || texto(e.title) } }
              : {}),
          });
        }
      }

      // Coexistência: o que a barbearia escreveu pelo app do celular volta como "eco".
      // É assim que a conversa no sistema fica completa, como era com o daemon.
      if (campo === "smb_message_echoes") {
        for (const bruto of lista(value.message_echoes)) {
          const m = obj(bruto);
          const waId = texto(m.to);
          const c = conteudo(m);
          if (!waId || !texto(m.id) || !c) continue;
          loteDe(phoneNumberId).mensagens.push({
            wamid: texto(m.id),
            numero: numeroDoWaId(waId),
            waId,
            fromMe: true,
            sentAt: dataDoTimestamp(m.timestamp),
            ...c,
          });
        }
      }
    }
  }

  return [...lotes.values()];
}

/**
 * O FORMATO de um POST, sem o conteúdo: campo, número da barbearia, quantas mensagens e
 * status, os tipos e os NOMES dos campos de cada mensagem — nunca texto nem telefone.
 *
 * Vai para o log em toda entrega. A Meta muda o formato do webhook sem avisar (em 2026,
 * por exemplo, mensagem de quem usa nome de usuário pode vir sem o telefone), e uma
 * entrega aceita com 200 que não vira conversa é indistinguível de "não chegou nada" sem
 * saber o que veio.
 */
export function resumoWebhook(corpo: unknown) {
  return lista(obj(corpo).entry).flatMap((entry) =>
    lista(obj(entry).changes).map((change) => {
      const value = obj(obj(change).value);
      const mensagens = lista(value.messages).length ? lista(value.messages) : lista(value.message_echoes);
      return {
        campo: texto(obj(change).field),
        phoneNumberId: texto(obj(value.metadata).phone_number_id),
        chavesValue: Object.keys(value),
        mensagens: mensagens.length,
        tipos: mensagens.map((m) => texto(obj(m).type)),
        chavesMensagem: [...new Set(mensagens.flatMap((m) => Object.keys(obj(m))))],
        status: lista(value.statuses).map((st) => texto(obj(st).status)),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export interface CredenciaisCloud {
  phoneNumberId: string;
  token: string;
}

export type ResultadoEnvioCloud =
  | { ok: true; wamid: string; waId?: string }
  | { ok: false; codigo: number; erro: string };

/**
 * O que dizer para a barbearia quando a Meta recusa. Os códigos são os da documentação
 * de erros da Cloud API; o texto cru da Meta fica no log, não na tela.
 */
export function erroAmigavel(codigo: number, original: string): string {
  switch (codigo) {
    case 131047:
      // A regra das 24 horas: fora da janela, só template aprovado.
      return "Passaram 24 horas desde a última mensagem do cliente. O WhatsApp só deixa retomar a conversa com uma mensagem modelo aprovada.";
    case 131026:
      return "Este número não recebeu a mensagem — pode não ter WhatsApp.";
    case 131030:
      return "Número de teste: este destinatário não está na lista de números permitidos na Meta.";
    case 131056:
    case 130429:
    case 80007:
      return "Muitas mensagens em pouco tempo. Tente de novo em alguns instantes.";
    case 190:
      return "O acesso ao WhatsApp expirou. É preciso gerar um novo token na Meta.";
    case 131031:
      return "A conta do WhatsApp da barbearia está bloqueada pela Meta.";
    case 130497:
      // Trava da Meta contra golpe: número de outro país (o de teste é +1) falando com
      // brasileiro, em conta nova. Com o número brasileiro da barbearia ela não existe.
      return "A Meta bloqueou o envio para este país: o número que envia é estrangeiro ou a conta é nova. Use o número brasileiro da barbearia.";
    default:
      return original || "O WhatsApp recusou a mensagem.";
  }
}

/**
 * Manda um texto livre. Só funciona dentro da janela de 24 horas — fora dela a Meta
 * devolve 131047 e a mensagem precisa ser um template.
 *
 * `fetch` é injetável para os testes; em produção é o global.
 */
export async function enviarTexto(
  cred: CredenciaisCloud,
  para: string,
  corpo: string,
  f: typeof fetch = fetch,
): Promise<ResultadoEnvioCloud> {
  const resp = await f(`https://graph.facebook.com/${versaoGraph()}/${cred.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${cred.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: para,
      type: "text",
      // Link no texto vira prévia — é o que acontecia no WhatsApp normal também.
      text: { body: corpo, preview_url: true },
    }),
  });

  const dados = obj(await resp.json().catch(() => ({})));
  if (!resp.ok) {
    const e = obj(dados.error);
    const codigo = Number(e.code ?? resp.status);
    const original = texto(obj(e.error_data).details) || texto(e.message);
    return { ok: false, codigo, erro: erroAmigavel(codigo, original) };
  }

  const wamid = texto(obj(lista(dados.messages)[0]).id);
  if (!wamid) return { ok: false, codigo: 0, erro: "A Meta aceitou o pedido mas não devolveu o id da mensagem." };
  const waId = texto(obj(lista(dados.contacts)[0]).wa_id);
  return { ok: true, wamid, ...(waId ? { waId } : {}) };
}
