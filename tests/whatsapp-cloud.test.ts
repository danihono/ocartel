import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { assinaturaConfere, enviarTexto, idDoc, lerWebhook, numeroDoWaId, resumoWebhook } from "@/lib/whatsapp/cloud";

const SEGREDO = "segredo-do-app";
const assinar = (corpo: string, segredo = SEGREDO) =>
  `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;

/** Um POST de webhook como a Meta manda, com o mínimo que importa. */
function webhook(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1445942491935699" }, ...value } }] }],
  };
}

describe("assinaturaConfere", () => {
  const corpo = JSON.stringify(webhook("messages", {}));

  it("aceita a assinatura feita com o App Secret", () => {
    expect(assinaturaConfere(corpo, assinar(corpo), SEGREDO)).toBe(true);
  });

  it("recusa corpo alterado, segredo errado, cabeçalho ausente ou malformado", () => {
    expect(assinaturaConfere(corpo + " ", assinar(corpo), SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, assinar(corpo, "outro"), SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, null, SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, "sha256=abc", SEGREDO)).toBe(false);
    expect(assinaturaConfere(corpo, assinar(corpo).slice("sha256=".length), SEGREDO)).toBe(false);
  });

  it("sem segredo configurado, nada passa", () => {
    expect(assinaturaConfere(corpo, assinar(corpo, ""), "")).toBe(false);
  });
});

describe("numeroDoWaId", () => {
  it("devolve o nono dígito ao celular antigo", () => {
    expect(numeroDoWaId("551984487271")).toBe("5519984487271");
  });

  it("não mexe em quem já tem 13 dígitos", () => {
    expect(numeroDoWaId("5519984487271")).toBe("5519984487271");
  });

  it("não mexe em fixo (oito dígitos começando de 2 a 5)", () => {
    expect(numeroDoWaId("551932345678")).toBe("551932345678");
  });

  it("não mexe em número de fora do Brasil", () => {
    expect(numeroDoWaId("15551808369")).toBe("15551808369");
  });
});

describe("idDoc", () => {
  it("troca barra do wamid, que o Firestore não aceita em id", () => {
    expect(idDoc("wamid.HBg/abc\\def==")).toBe("wamid.HBg_abc_def==");
  });
});

describe("lerWebhook", () => {
  it("lê texto do cliente com nome de perfil e conserta o número", () => {
    const [lote] = lerWebhook(
      webhook("messages", {
        contacts: [{ wa_id: "551984487271", profile: { name: "Daniel" } }],
        messages: [{ id: "wamid.1", from: "551984487271", timestamp: "1762430400", type: "text", text: { body: "oi, tem horário?" } }],
      }),
    );
    expect(lote.phoneNumberId).toBe("1445942491935699");
    expect(lote.mensagens).toEqual([
      {
        wamid: "wamid.1",
        numero: "5519984487271",
        waId: "551984487271",
        fromMe: false,
        sentAt: new Date(1762430400 * 1000),
        nomePerfil: "Daniel",
        text: "oi, tem horário?",
      },
    ]);
  });

  it("mídia vira rótulo, ou a legenda quando há", () => {
    const [lote] = lerWebhook(
      webhook("messages", {
        messages: [
          { id: "w1", from: "5519984487271", timestamp: "1", type: "image", image: { id: "m1", mime_type: "image/jpeg" } },
          { id: "w2", from: "5519984487271", timestamp: "1", type: "image", image: { id: "m2", caption: "esse corte" } },
          { id: "w3", from: "5519984487271", timestamp: "1", type: "document", document: { id: "m3", filename: "tabela.pdf" } },
        ],
      }),
    );
    expect(lote.mensagens.map((m) => [m.text, m.mediaType, m.waMediaId])).toEqual([
      ["📷 Foto", "image", "m1"],
      ["esse corte", "image", "m2"],
      ["📄 tabela.pdf", "document", "m3"],
    ]);
    expect(lote.mensagens[1].caption).toBe("esse corte");
  });

  it("botão de template e resposta interativa viram o texto escolhido", () => {
    const [lote] = lerWebhook(
      webhook("messages", {
        messages: [
          { id: "w1", from: "5519984487271", timestamp: "1", type: "button", button: { text: "Confirmar" } },
          { id: "w2", from: "5519984487271", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { title: "Remarcar" } } },
        ],
      }),
    );
    expect(lote.mensagens.map((m) => m.text)).toEqual(["Confirmar", "Remarcar"]);
  });

  it("reação e evento de sistema não viram mensagem", () => {
    const lotes = lerWebhook(
      webhook("messages", {
        messages: [
          { id: "w1", from: "5519984487271", timestamp: "1", type: "reaction", reaction: { emoji: "👍" } },
          { id: "w2", from: "5519984487271", timestamp: "1", type: "system", system: {} },
        ],
      }),
    );
    expect(lotes.flatMap((l) => l.mensagens)).toEqual([]);
  });

  it("lê status, com o erro quando falha", () => {
    const [lote] = lerWebhook(
      webhook("messages", {
        statuses: [
          { id: "w1", status: "read", timestamp: "2", recipient_id: "551984487271" },
          { id: "w2", status: "failed", timestamp: "2", recipient_id: "551984487271", errors: [{ code: 131047, title: "Re-engagement message" }] },
          { id: "w3", status: "deleted", timestamp: "2", recipient_id: "551984487271" },
        ],
      }),
    );
    expect(lote.status).toEqual([
      { wamid: "w1", numero: "5519984487271", status: "read", em: new Date(2000) },
      {
        wamid: "w2",
        numero: "5519984487271",
        status: "failed",
        em: new Date(2000),
        erro: { codigo: 131047, mensagem: "Re-engagement message" },
      },
    ]);
  });

  it("eco da Coexistência entra como mensagem da barbearia, sem nome de perfil", () => {
    const [lote] = lerWebhook(
      webhook("smb_message_echoes", {
        message_echoes: [{ id: "e1", from: "15551808369", to: "551984487271", timestamp: "3", type: "text", text: { body: "fechado, até sexta" } }],
      }),
    );
    expect(lote.mensagens).toEqual([
      { wamid: "e1", numero: "5519984487271", waId: "551984487271", fromMe: true, sentAt: new Date(3000), text: "fechado, até sexta" },
    ]);
  });

  it("ignora o que não conhece sem quebrar", () => {
    expect(lerWebhook(null)).toEqual([]);
    expect(lerWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([]);
    expect(lerWebhook(webhook("message_template_status_update", { event: "APPROVED" }))).toEqual([]);
  });
});

describe("enviarTexto", () => {
  const cred = { phoneNumberId: "1445942491935699", token: "tk" };

  it("manda o pedido certo e devolve o wamid", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ contacts: [{ wa_id: "551984487271" }], messages: [{ id: "wamid.X" }] }), { status: 200 }),
    );
    const r = await enviarTexto(cred, "5519984487271", "oi", f as unknown as typeof fetch);

    expect(r).toEqual({ ok: true, wamid: "wamid.X", waId: "551984487271" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1445942491935699\/messages$/);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tk");
    expect(JSON.parse(String(init.body))).toMatchObject({ messaging_product: "whatsapp", to: "5519984487271", type: "text", text: { body: "oi" } });
  });

  it("fora das 24 horas, explica em português", async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 }),
    );
    const r = await enviarTexto(cred, "5519984487271", "oi", f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe(131047);
      expect(r.erro).toMatch(/24 horas/);
    }
  });
});

describe("resumoWebhook", () => {
  it("descreve o formato sem texto nem telefone", () => {
    const resumo = resumoWebhook(
      webhook("messages", {
        contacts: [{ wa_id: "551984487271", profile: { name: "Daniel" } }],
        messages: [{ id: "wamid.1", from: "551984487271", timestamp: "1", type: "text", text: { body: "segredo" } }],
        statuses: [{ id: "w9", status: "read", recipient_id: "551984487271" }],
      }),
    );
    expect(resumo).toEqual([
      {
        campo: "messages",
        phoneNumberId: "1445942491935699",
        chavesValue: ["messaging_product", "metadata", "contacts", "messages", "statuses"],
        mensagens: 1,
        tipos: ["text"],
        chavesMensagem: ["id", "from", "timestamp", "type", "text"],
        status: ["read"],
      },
    ]);
    const cru = JSON.stringify(resumo);
    expect(cru).not.toContain("segredo");
    expect(cru).not.toContain("551984487271");
  });
});
