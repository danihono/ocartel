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
  /**
   * Veio do histórico que a Meta entrega ao conectar um número que já era usado no app
   * (Coexistência). É conversa velha: não conta como não lida, não acorda a IA e não passa
   * na frente da mensagem mais recente na lista.
   */
  importada?: true;
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

/** Um contato da agenda do celular da barbearia (Coexistência). */
export interface ContatoCloud {
  numero: string;
  /** Nome como está salvo no celular. Vazio quando o contato foi apagado. */
  nome: string;
  acao: "add" | "remove";
}

/** Tudo que um POST do webhook trouxe para UM número da barbearia. */
export interface LoteCloud {
  phoneNumberId: string;
  mensagens: MensagemCloud[];
  status: StatusCloud[];
  contatos: ContatoCloud[];
  /** A barbearia não autorizou compartilhar o histórico no app (erro 2593109). */
  historicoRecusado?: boolean;
  /** Progresso da importação do histórico, de 0 a 100. */
  historicoProgresso?: number;
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

  // No histórico, a mídia vem sem o arquivo: a Meta manda o conteúdo num webhook à parte
  // (só para os últimos 14 dias), que cai no MESMO documento e o completa.
  if (tipo === "media_placeholder") return { text: "📎 Mídia — veja no celular" };

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
    if (!l) lotes.set(id, (l = { phoneNumberId: id, mensagens: [], status: [], contatos: [] }));
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

      // Coexistência: o histórico de até 180 dias, entregue em pedaços depois da conexão.
      // A conversa é a `thread`; quem mandou cada mensagem se descobre comparando o `from`
      // com o número da própria barbearia.
      if (campo === "history") {
        const numeroBarbearia = texto(obj(value.metadata).display_phone_number);
        for (const pedaco of lista(value.history)) {
          const p = obj(pedaco);
          if (lista(p.errors).some((e) => Number(obj(e).code) === 2593109)) {
            loteDe(phoneNumberId).historicoRecusado = true;
          }
          const progresso = Number(obj(p.metadata).progress);
          if (Number.isFinite(progresso)) loteDe(phoneNumberId).historicoProgresso = progresso;

          for (const fio of lista(p.threads)) {
            // Sem o telefone do cliente (quem usa nome de usuário pode vir só com o id da
            // Meta), não há como casar com o cadastro nem responder: fica de fora.
            const waId = texto(obj(fio).id) || texto(obj(obj(fio).context).wa_id);
            if (!waId) continue;
            for (const bruto of lista(obj(fio).messages)) {
              const m = obj(bruto);
              const c = conteudo(m);
              if (!texto(m.id) || !c) continue;
              loteDe(phoneNumberId).mensagens.push({
                wamid: texto(m.id),
                numero: numeroDoWaId(waId),
                waId,
                fromMe: Boolean(texto(m.to)) || (Boolean(numeroBarbearia) && texto(m.from) === numeroBarbearia),
                sentAt: dataDoTimestamp(m.timestamp),
                importada: true,
                ...c,
              });
            }
          }
        }

        // O arquivo de uma mídia do histórico chega depois, como `messages` dentro do campo
        // `history`, com o mesmo wamid do marcador — e completa o mesmo documento.
        for (const bruto of lista(value.messages)) {
          const m = obj(bruto);
          const de = texto(m.from);
          const doCliente = de !== numeroBarbearia;
          const waId = doCliente ? de : texto(m.to);
          const c = conteudo(m);
          if (!waId || !texto(m.id) || !c) continue;
          loteDe(phoneNumberId).mensagens.push({
            wamid: texto(m.id),
            numero: numeroDoWaId(waId),
            waId,
            fromMe: !doCliente,
            sentAt: dataDoTimestamp(m.timestamp),
            importada: true,
            ...c,
          });
        }
      }

      // Coexistência: a agenda do celular da barbearia. Serve para dar nome a quem ainda
      // aparece só com o número.
      if (campo === "smb_app_state_sync") {
        for (const bruto of lista(value.state_sync)) {
          const item = obj(bruto);
          if (texto(item.type) !== "contact") continue;
          const ct = obj(item.contact);
          const numero = numeroDoWaId(texto(ct.phone_number));
          if (!numero) continue;
          loteDe(phoneNumberId).contatos.push({
            numero,
            nome: (texto(ct.full_name) || texto(ct.first_name)).trim(),
            acao: texto(item.action) === "remove" ? "remove" : "add",
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
      const historico = lista(value.history).map(obj);
      return {
        campo: texto(obj(change).field),
        phoneNumberId: texto(obj(value.metadata).phone_number_id),
        chavesValue: Object.keys(value),
        mensagens: mensagens.length,
        tipos: mensagens.map((m) => texto(obj(m).type)),
        chavesMensagem: [...new Set(mensagens.flatMap((m) => Object.keys(obj(m))))],
        status: lista(value.statuses).map((st) => texto(obj(st).status)),
        ...(historico.length
          ? {
              historico: historico.map((h) => ({
                progresso: obj(h.metadata).progress ?? null,
                conversas: lista(h.threads).length,
                mensagens: lista(h.threads).reduce((n: number, t) => n + lista(obj(t).messages).length, 0),
                erros: lista(h.errors).map((e) => obj(e).code),
              })),
            }
          : {}),
        ...(lista(value.state_sync).length ? { contatos: lista(value.state_sync).length } : {}),
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

// ---------------------------------------------------------------------------
// Conexão (Embedded Signup)
// ---------------------------------------------------------------------------

export type RespostaGraph = { ok: true; dados: Obj } | { ok: false; codigo: number; erro: string };

/** Uma chamada à Graph API, com o erro já traduzido. `fetch` injetável para os testes. */
export async function chamarGraph(
  token: string,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: Record<string, unknown>,
  f: typeof fetch = fetch,
): Promise<RespostaGraph> {
  const resp = await f(`https://graph.facebook.com/${versaoGraph()}/${caminho}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, ...(corpo ? { "content-type": "application/json" } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const dados = obj(await resp.json().catch(() => ({})));
  if (!resp.ok || dados.error) {
    const e = obj(dados.error);
    const codigo = Number(e.code ?? resp.status);
    return { ok: false, codigo, erro: erroAmigavel(codigo, texto(obj(e.error_data).details) || texto(e.message)) };
  }
  return { ok: true, dados };
}

/**
 * Troca o código da janela da Meta pelo token da barbearia ("business token").
 *
 * O código vale 30 segundos: esta é a primeira coisa a fazer quando ele chega, antes de
 * qualquer outra chamada.
 */
export async function trocarCodigo(
  appId: string,
  appSecret: string,
  code: string,
  f: typeof fetch = fetch,
): Promise<{ ok: true; token: string } | { ok: false; erro: string }> {
  const q = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  const resp = await f(`https://graph.facebook.com/${versaoGraph()}/oauth/access_token?${q}`);
  const dados = obj(await resp.json().catch(() => ({})));
  const token = texto(dados.access_token);
  if (resp.ok && token) return { ok: true, token };
  const e = obj(dados.error);
  return {
    ok: false,
    erro: texto(e.message)
      ? `A Meta recusou a conexão: ${texto(e.message)}`
      : "A Meta não devolveu o acesso. O código pode ter vencido — tente conectar de novo.",
  };
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

/**
 * Teto do que o sistema baixa. Foto, áudio e vídeo do WhatsApp ficam bem abaixo (16 MB no
 * máximo); só documento passa disso, e esse fica no celular — a rota não pode segurar um
 * arquivo de 100 MB na memória.
 */
export const MIDIA_MAX_BYTES = 25 * 1024 * 1024;

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

/** Extensão do arquivo pelo tipo — `audio/ogg; codecs=opus` vira `ogg`. */
export function extensaoDoMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  return EXTENSOES[base] ?? (base.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin");
}

export type ArquivoMeta =
  | { ok: true; bytes: Buffer; mime: string }
  | { ok: false; erro: string; definitivo: boolean };

/**
 * Baixa uma mídia da Meta: primeiro pergunta o endereço (que vale 5 minutos), depois baixa
 * com o token. A Meta guarda o arquivo por 30 dias — depois disso, só no celular.
 *
 * `definitivo` diz se adianta tentar de novo: mídia vencida ou grande demais não muda.
 */
export async function baixarArquivoMeta(token: string, mediaId: string, f: typeof fetch = fetch): Promise<ArquivoMeta> {
  const info = await chamarGraph(token, "GET", mediaId, undefined, f);
  if (!info.ok) {
    // 100 / 131052 / 404: a mídia não existe mais (vencida, ou apagada pelo remetente).
    const sumiu = info.codigo === 100 || info.codigo === 131052 || info.codigo === 404;
    return { ok: false, erro: sumiu ? "mídia expirada — veja no celular" : info.erro, definitivo: sumiu };
  }
  const url = texto(info.dados.url);
  const mime = texto(info.dados.mime_type) || "application/octet-stream";
  const tamanho = Number(info.dados.file_size ?? 0);
  if (!url) return { ok: false, erro: "a Meta não devolveu o endereço da mídia", definitivo: false };
  if (tamanho > MIDIA_MAX_BYTES) return { ok: false, erro: "arquivo grande demais — veja no celular", definitivo: true };

  const resp = await f(url, { headers: { authorization: `Bearer ${token}` } });
  if (!resp.ok) return { ok: false, erro: `download recusado (${resp.status})`, definitivo: false };
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > MIDIA_MAX_BYTES) return { ok: false, erro: "arquivo grande demais — veja no celular", definitivo: true };
  return { ok: true, bytes, mime };
}
