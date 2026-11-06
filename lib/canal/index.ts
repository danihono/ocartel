// Canal de mensagens — a porta trocável entre O Cartel e o WhatsApp.
//
// TUDO que envia mensagem passa por aqui. Nada fora desta pasta pode saber COMO a
// mensagem sai: hoje é um daemon Baileys self-hosted, amanhã pode ser a API oficial da
// Meta. Trocar significa escrever outro arquivo nesta pasta e mudar a fábrica no fim —
// sem tocar em quem chama.
//
// Só servidor (Admin SDK). Nunca importe de um componente do cliente.

import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { chaveTelefone, contactIdDoTelefone } from "@/lib/telefone";
import { iniciaisDe } from "@/lib/clientes-import";
import { enviarTexto, type CredenciaisCloud } from "@/lib/whatsapp/cloud";
import { gravarEnviada } from "@/lib/whatsapp/cloud-espelho";
import { uidDaBarbearia } from "./uid";

/** Resultado de um envio. `pendente` = o daemon ainda não respondeu (e pode dar certo). */
export interface EnvioResultado {
  ok: boolean;
  pendente?: boolean;
  erro?: string;
  /**
   * Id do documento da mensagem no espelho, quando o daemon confirmou o envio (exige
   * `aguardarMs`). Serve para marcar a mensagem depois — é assim que a resposta escrita
   * pelo atendente automático ganha o selo de IA.
   */
  mensagemId?: string;
}

/** Quem é o destinatário, para o contato espelhado nascer com nome em vez de número. */
export interface OpcoesEnvio {
  /** Nome do cadastro. Sem ele a conversa fica com o número no lugar do nome. */
  nome?: string;
  /** Id do cliente em `tenants/{t}/clientes` — o vínculo que a IA usa para saber quem é. */
  clienteId?: string;
  /** Espera o daemon confirmar (ms). Omitido = enfileira e segue (comportamento padrão). */
  aguardarMs?: number;
}

export interface Canal {
  /** `telefone` em qualquer formato; a normalização é aqui dentro. */
  enviarMensagem(telefone: string, texto: string, opcoes?: OpcoesEnvio): Promise<EnvioResultado>;
}

/** Onde fica o vínculo entre a barbearia e a conta de WhatsApp que fala por ela. */
interface VinculoWhatsApp {
  /** uid sob o qual o daemon mantém a sessão desta barbearia. */
  uid: string;
  /** Número da barbearia, só para exibição/diagnóstico. */
  numero?: string;
  /** Por onde a mensagem sai. Sem o campo é o daemon — o que toda barbearia antiga usa. */
  provedor: "daemon" | "cloud";
  /** Id do número na Meta (só `cloud`). */
  phoneNumberId?: string;
}

export class WhatsAppNaoConfigurado extends Error {
  constructor(tenantId: string) {
    super(`Barbearia ${tenantId} não tem WhatsApp vinculado.`);
    this.name = "WhatsAppNaoConfigurado";
  }
}

export async function vinculoDoTenant(tenantId: string): Promise<VinculoWhatsApp> {
  const snap = await adminDb.doc(`tenants/${tenantId}/private/whatsapp`).get();
  const uid = snap.exists ? String(snap.data()?.uid ?? "") : "";
  if (!uid) throw new WhatsAppNaoConfigurado(tenantId);
  const provedor = snap.get("provedor") === "cloud" ? "cloud" : "daemon";
  const phoneNumberId = String(snap.get("phoneNumberId") ?? "");
  return { uid, numero: snap.data()?.numero, provedor, ...(phoneNumberId ? { phoneNumberId } : {}) };
}

/** true quando a barbearia fala pela API oficial — e não há daemon para pedir nada. */
export async function usaApiOficial(tenantId: string): Promise<boolean> {
  return vinculoDoTenant(tenantId)
    .then((v) => v.provedor === "cloud")
    .catch(() => false);
}

export function apenasDigitos(telefone: string): string {
  return String(telefone ?? "").replace(/\D/g, "");
}

/** Validade do doc de comando — casada com o TTL nativo esperado pelo daemon. */
const COMANDO_TTL_MS = 3_600_000;

/**
 * Garante o documento de contato que o daemon exige, e devolve o id dele.
 *
 * O daemon veio do CRM Titãs e sua ação `message.send` exige um contato no formato DELE —
 * `users/{uid}/contacts/{contactId}` com o telefone. O Cartel guarda clientes em
 * `tenants/{id}/clientes`, que é outra forma. Em vez de alterar o daemon (que roda também
 * para o Titãs, em produção), garantimos aqui o documento que ele espera.
 *
 * O id é o MESMO que o daemon geraria sozinho (`wa_<digits>`, ver `resolveContact` lá):
 * é isso que faz a resposta do cliente cair nesta conversa em vez de abrir uma segunda.
 *
 * O `nome` não é enfeite. O daemon só preenche nome de contato que ainda não tem
 * `createdAt` (`healGhostContact`), e este aqui já nasce com um — sem passar o nome, a
 * conversa fica com o número para sempre.
 */
export async function garantirContato(
  uid: string,
  wa: string,
  opcoes: { nome?: string; clienteId?: string; tenantId?: string } = {},
): Promise<string> {
  const contactId = contactIdDoTelefone(wa);
  const nome = opcoes.nome?.trim();

  await adminDb.doc(`users/${uid}/contacts/${contactId}`).set(
    {
      whatsappDigits: wa,
      whatsapp: wa,
      phone: wa,
      waJid: `${wa}@s.whatsapp.net`,
      source: "whatsapp",
      ...(nome ? { name: nome, initials: iniciaisDe(nome) || "?", nameSource: "agenda" } : {}),
      ...(opcoes.clienteId ? { clienteId: opcoes.clienteId } : {}),
      ...(opcoes.tenantId ? { tenantId: opcoes.tenantId } : {}),
      status: "WhatsApp",
      // createdAt é obrigatório para o contato aparecer nas listas ordenadas do daemon.
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return contactId;
}

/** Caminho do doc de uma mensagem no espelho — o daemon usa o id do WhatsApp sanitizado. */
export function caminhoMensagem(uid: string, contactId: string, mensagemId: string): string {
  return `users/${uid}/contacts/${contactId}/messages/${mensagemId}`;
}

/**
 * Pede ao daemon a foto de perfil do contato no WhatsApp.
 *
 * Contato que o daemon cria sozinho (alguém escreveu para a barbearia) já nasce com foto —
 * ele busca na criação. O que ele NÃO faz é buscar para contato que já existe, e todo
 * contato criado por `garantirContato` cai nesse caso: quando a mensagem chega, o daemon
 * encontra o documento pronto e segue em frente. Por isso quem puxamos do cadastro ficava
 * eternamente com as iniciais.
 *
 * Fire-and-forget: a foto aparece sozinha na tela quando o daemon gravar. Falhar não pode
 * atrapalhar o envio de mensagem — foto é enfeite, conversa não é.
 */
export async function pedirFotoDePerfil(uid: string, contactId: string): Promise<void> {
  // A API oficial não entrega foto de perfil. Sem este corte o pedido ficaria na fila de
  // um daemon que não existe até o TTL apagá-lo.
  if (uid.startsWith("barbearia-") && (await usaApiOficial(uid.slice("barbearia-".length)))) return;
  await adminDb.collection(`users/${uid}/waCommands`).add({
    type: "contact.photoRefresh",
    args: { contactId },
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + COMANDO_TTL_MS),
  });
}

/** Espera o daemon gravar o resultado no próprio doc do comando. */
async function aguardarComando(ref: DocumentReference, limiteMs: number): Promise<EnvioResultado> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 500));
    const snap = await ref.get();
    const status = snap.get("status");
    if (status === "done") {
      // O daemon devolve o id do WhatsApp em `result.id` e grava a mensagem sob esse id
      // com "/" e "\\" trocados por "_" (sanitizeId, do lado dele).
      const bruto = snap.get("result")?.id;
      const mensagemId = typeof bruto === "string" ? bruto.replace(/[/\\]/g, "_") : undefined;
      return { ok: true, ...(mensagemId ? { mensagemId } : {}) };
    }
    if (status === "error") {
      return { ok: false, erro: String(snap.get("error")?.message ?? "Falha ao enviar pelo WhatsApp.") };
    }
  }
  // Sem resposta a tempo não é fracasso: os erros que importam (não conectado, número
  // inexistente) voltam em menos de um segundo. Quem termina a história é o espelho da
  // conversa, quando a mensagem enviada aparecer nele.
  return { ok: true, pendente: true };
}

/**
 * Adaptador do daemon self-hosted (Baileys).
 *
 * O efeito colateral de espelhar em `users/{uid}/contacts` é bem-vindo: é de lá que a tela
 * de WhatsApp lê a conversa, e é de lá que o atendente com IA lê o histórico.
 */
class CanalDaemon implements Canal {
  constructor(
    private readonly uid: string,
    private readonly tenantId: string,
  ) {}

  async enviarMensagem(telefone: string, texto: string, opcoes: OpcoesEnvio = {}): Promise<EnvioResultado> {
    const chave = chaveTelefone(telefone);
    if (!chave) throw new Error(`Telefone inválido para envio: "${telefone}"`);

    const contactId = await garantirContato(this.uid, chave.wa, {
      nome: opcoes.nome,
      clienteId: opcoes.clienteId,
      tenantId: this.tenantId,
    });

    // O daemon escuta esta coleção por collection group query e devolve o resultado no
    // próprio doc.
    const ref = await adminDb.collection(`users/${this.uid}/waCommands`).add({
      type: "message.send",
      args: { contactId, text: texto },
      status: "pending",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + COMANDO_TTL_MS),
    });

    if (!opcoes.aguardarMs) return { ok: true, pendente: true };
    return aguardarComando(ref, opcoes.aguardarMs);
  }
}

/**
 * O token da Meta desta barbearia.
 *
 * Mora num documento ANINHADO em `private/whatsapp`, que não casa com
 * `match /private/{doc}` e cai no deny padrão das regras — nem o dono da barbearia o lê
 * pelo navegador (mesmo raciocínio do token do cartão). Sem token próprio, usa o da
 * variável de ambiente: é o caso do número de teste e do token de usuário do sistema.
 */
async function tokenCloud(tenantId: string): Promise<string> {
  const snap = await adminDb.doc(`tenants/${tenantId}/private/whatsapp/credenciais/cloud`).get();
  return String(snap.get("token") ?? "") || process.env.WHATSAPP_TOKEN || "";
}

/**
 * Adaptador da API oficial (Cloud API da Meta).
 *
 * O envio é síncrono — a Meta responde na hora com o id da mensagem —, então `aguardarMs`
 * não tem o que esperar e o `mensagemId` volta sempre. Quem grava a mensagem no espelho é
 * este adaptador, logo depois do envio: não há daemon vendo a mensagem passar.
 *
 * Texto livre só sai dentro das 24 horas desde a última mensagem do cliente. Fora disso a
 * Meta recusa e o erro explica — mensagem de iniciativa da barbearia (confirmação,
 * cobrança) precisa de template, que é a próxima etapa.
 */
class CanalCloud implements Canal {
  constructor(
    private readonly tenantId: string,
    private readonly cred: CredenciaisCloud,
  ) {}

  async enviarMensagem(telefone: string, texto: string, opcoes: OpcoesEnvio = {}): Promise<EnvioResultado> {
    const chave = chaveTelefone(telefone);
    if (!chave) throw new Error(`Telefone inválido para envio: "${telefone}"`);

    const contactId = await garantirContato(uidDaBarbearia(this.tenantId), chave.wa, {
      nome: opcoes.nome,
      clienteId: opcoes.clienteId,
      tenantId: this.tenantId,
    });

    // O `wa_id` que a Meta usou da última vez pode não ter o nono dígito. Mandar para ele é
    // mandar para a conta exatamente como o WhatsApp a conhece.
    const contato = await adminDb.doc(`users/${uidDaBarbearia(this.tenantId)}/contacts/${contactId}`).get();
    const para = String(contato.get("waId") ?? "") || chave.wa;

    const envio = await enviarTexto(this.cred, para, texto);
    if (!envio.ok) {
      console.warn("[canal/cloud] envio recusado", this.tenantId, envio.codigo);
      return { ok: false, erro: envio.erro };
    }

    const mensagemId = await gravarEnviada(this.tenantId, contactId, envio.wamid, texto, envio.waId);
    return { ok: true, mensagemId };
  }
}

/** Devolve o canal da barbearia. Lança `WhatsAppNaoConfigurado` se não houver vínculo. */
export async function canalDoTenant(tenantId: string): Promise<Canal> {
  const vinculo = await vinculoDoTenant(tenantId);
  if (vinculo.provedor === "cloud") {
    const token = await tokenCloud(tenantId);
    if (!vinculo.phoneNumberId || !token) throw new WhatsAppNaoConfigurado(tenantId);
    return new CanalCloud(tenantId, { phoneNumberId: vinculo.phoneNumberId, token });
  }
  return new CanalDaemon(vinculo.uid, tenantId);
}
