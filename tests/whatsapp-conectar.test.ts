import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// Um Firestore de mentira, do tamanho do que conectar.ts usa: doc().get/set e batch.
const banco = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const snap = (path: string) => ({
    exists: docs.has(path),
    get: (k: string) => docs.get(path)?.[k],
    data: () => docs.get(path),
  });
  const ref = (path: string) => ({
    path,
    get: async () => snap(path),
    set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => {
      docs.set(path, o?.merge ? { ...(docs.get(path) ?? {}), ...d } : d);
    },
  });
  const db = {
    doc: ref,
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) =>
          ops.push(() => docs.set(r.path, o?.merge ? { ...(docs.get(r.path) ?? {}), ...d } : d)),
        delete: (r: { path: string }) => ops.push(() => docs.delete(r.path)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { docs, db };
});
vi.mock("@/lib/firebase/admin", () => ({ adminDb: banco.db }));

import { conectarNumeroOficial } from "@/lib/whatsapp/conectar";

/** Graph API de mentira: responde por trecho de URL e anota cada chamada. */
function graph(respostas: Record<string, unknown>) {
  const chamadas: { url: string; corpo?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, corpo: init?.body ? JSON.parse(String(init.body)) : undefined });
      const chave = Object.keys(respostas).find((k) => url.includes(k));
      return new Response(JSON.stringify(chave ? respostas[chave] : {}), { status: 200 });
    }),
  );
  return chamadas;
}

const T = "barb1";

beforeEach(() => {
  banco.docs.clear();
  process.env.NEXT_PUBLIC_META_APP_ID = "app";
  process.env.WHATSAPP_APP_SECRET = "seg";
});
afterEach(() => vi.unstubAllGlobals());

describe("conectarNumeroOficial", () => {
  it("Coexistência: troca o código primeiro, inscreve, NÃO registra e pede agenda e histórico", async () => {
    // A barbearia estava no número de teste.
    banco.docs.set(`tenants/${T}/private/whatsapp`, { phoneNumberId: "teste" });
    banco.docs.set("whatsappNumeros/teste", { tenantId: T });
    const chamadas = graph({
      "oauth/access_token": { access_token: "EAAbiz" },
      subscribed_apps: { success: true },
      "999?fields": { display_phone_number: "55 19 3333-4444", verified_name: "O Cartel", is_on_biz_app: true, platform_type: "CLOUD_API" },
      smb_app_data: { request_id: "req" },
    });

    const r = await conectarNumeroOficial(T, { code: "cod", phoneNumberId: "999", wabaId: "888", coexistencia: true });

    expect(r).toEqual({ ok: true, numero: "551933334444", coexistencia: true, avisos: [] });
    expect(chamadas[0].url).toContain("oauth/access_token");
    expect(chamadas.some((c) => c.url.includes("/register"))).toBe(false);
    expect(chamadas.filter((c) => c.url.includes("smb_app_data")).map((c) => (c.corpo as { sync_type: string }).sync_type)).toEqual([
      "smb_app_state_sync",
      "history",
    ]);
    expect(banco.docs.get(`tenants/${T}/private/whatsapp`)).toMatchObject({
      provedor: "cloud",
      phoneNumberId: "999",
      wabaId: "888",
      coexistencia: true,
      numero: "551933334444",
    });
    expect(banco.docs.get(`tenants/${T}/private/whatsapp/credenciais/cloud`)).toMatchObject({ token: "EAAbiz" });
    expect(banco.docs.get("whatsappNumeros/999")).toMatchObject({ tenantId: T });
    expect(banco.docs.has("whatsappNumeros/teste")).toBe(false);
  });

  it("número novo, só da API: registra com PIN de 6 dígitos e não pede histórico", async () => {
    const chamadas = graph({
      "oauth/access_token": { access_token: "EAAbiz" },
      "999?fields": { display_phone_number: "5519988887777", is_on_biz_app: false, platform_type: "NOT_APPLICABLE" },
      "/register": { success: true },
    });

    const r = await conectarNumeroOficial(T, { code: "cod", phoneNumberId: "999", wabaId: "888" });

    expect(r.ok).toBe(true);
    const registro = chamadas.find((c) => c.url.includes("/register"));
    expect((registro?.corpo as { pin: string }).pin).toMatch(/^\d{6}$/);
    expect(chamadas.some((c) => c.url.includes("smb_app_data"))).toBe(false);
    expect(banco.docs.get(`tenants/${T}/private/whatsapp/credenciais/cloud`)).toMatchObject({ pin: (registro?.corpo as { pin: string }).pin });
  });

  it("número de outra barbearia: recusa antes de mexer em qualquer coisa na Meta", async () => {
    banco.docs.set("whatsappNumeros/999", { tenantId: "outra" });
    const chamadas = graph({ "oauth/access_token": { access_token: "EAAbiz" } });

    const r = await conectarNumeroOficial(T, { code: "cod", phoneNumberId: "999", wabaId: "888" });

    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/outra barbearia/) });
    expect(chamadas.map((c) => c.url).filter((u) => !u.includes("oauth"))).toEqual([]);
    expect(banco.docs.has(`tenants/${T}/private/whatsapp`)).toBe(false);
  });

  it("sem a chave secreta no servidor, nem tenta", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const chamadas = graph({});
    const r = await conectarNumeroOficial(T, { code: "cod", wabaId: "888" });
    expect(r.ok).toBe(false);
    expect(chamadas).toEqual([]);
  });
});
