import { afterEach, describe, it, expect, vi } from "vitest";

// A rota grava no Firestore; aqui só interessa a verificação, que não toca no banco.
vi.mock("@/lib/whatsapp/cloud-espelho", () => ({ gravarMensagem: vi.fn(), gravarStatus: vi.fn(), tenantDoNumero: vi.fn() }));

import { GET } from "@/app/api/whatsapp/webhook/route";

const verificar = (token: string) =>
  GET(new Request(`https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=123`));

describe("GET /api/whatsapp/webhook (verificação da Meta)", () => {
  afterEach(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
  });

  it("devolve o challenge quando a senha bate, mesmo com quebra de linha no segredo", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "senhaDoWebhook\n";
    const r = await verificar("senhaDoWebhook");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("123");
  });

  it("recusa senha errada com 403", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "senhaDoWebhook";
    expect((await verificar("outra")).status).toBe(403);
  });

  it("sem segredo no servidor, diz isso com 500 — e não um 403 igual ao de senha errada", async () => {
    const r = await verificar("qualquer");
    expect(r.status).toBe(500);
    expect(await r.text()).toMatch(/não configurado/);
  });
});
