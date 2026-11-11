import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const salvos: { caminho: string; bytes: Buffer; opcoes: Record<string, unknown> }[] = [];
  const db = {
    doc: (path: string) => ({
      get: async () => ({ exists: docs.has(path), get: (k: string) => docs.get(path)?.[k] }),
      update: async (d: Record<string, unknown>) => docs.set(path, { ...(docs.get(path) ?? {}), ...d }),
    }),
  };
  const bucket = {
    name: "ocartel-497f8.firebasestorage.app",
    file: (caminho: string) => ({
      save: async (bytes: Buffer, opcoes: Record<string, unknown>) => void salvos.push({ caminho, bytes, opcoes }),
    }),
  };
  return { docs, salvos, db, bucket };
});
vi.mock("@/lib/firebase/admin", () => ({ adminDb: fake.db }));
vi.mock("firebase-admin/storage", () => ({ getStorage: () => ({ bucket: () => fake.bucket }) }));
vi.mock("@/lib/canal", () => ({ tokenCloud: async () => "EAAtk" }));

import { baixarArquivoMeta, extensaoDoMime } from "@/lib/whatsapp/cloud";
import { baixarMidiaDaMensagem } from "@/lib/whatsapp/midia";

/** A Meta de mentira: primeiro o endereço da mídia, depois o arquivo. */
function meta(info: Record<string, unknown>, status = 200, arquivo = Buffer.from("JPEGDATA")) {
  const f = vi.fn(async (url: string) =>
    url.includes("lookaside")
      ? new Response(arquivo)
      : new Response(JSON.stringify(info), { status }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

const MSG = "users/barbearia-t1/contacts/wa_5519984487271/messages/wamid.1";

beforeEach(() => {
  fake.docs.clear();
  fake.salvos.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("extensaoDoMime", () => {
  it("tira os parâmetros e acha a extensão", () => {
    expect(extensaoDoMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensaoDoMime("image/jpeg")).toBe("jpg");
    expect(extensaoDoMime("application/vnd.ms-excel")).toBe("vndmsexcel");
    expect(extensaoDoMime("")).toBe("bin");
  });
});

describe("baixarArquivoMeta", () => {
  it("mídia vencida não adianta tentar de novo", async () => {
    meta({ error: { code: 100, message: "Unsupported get request" } }, 400);
    expect(await baixarArquivoMeta("tk", "m1")).toEqual({ ok: false, erro: expect.stringMatching(/expirada/), definitivo: true });
  });

  it("arquivo grande demais nem é baixado", async () => {
    const f = meta({ url: "https://lookaside.fbsbx.com/x", mime_type: "application/pdf", file_size: String(90 * 1024 * 1024) });
    expect(await baixarArquivoMeta("tk", "m1")).toMatchObject({ ok: false, definitivo: true });
    expect(f.mock.calls.some(([u]) => String(u).includes("lookaside"))).toBe(false);
  });
});

describe("baixarMidiaDaMensagem", () => {
  it("baixa, guarda no Storage com link de token e atualiza a mensagem", async () => {
    fake.docs.set(MSG, { waMediaId: "m1", mediaType: "image", pending: true });
    const f = meta({ url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg", file_size: "8" });

    expect(await baixarMidiaDaMensagem("t1", "wa_5519984487271", "wamid.1")).toBe("baixada");

    // O download leva o token da barbearia — sem ele a Meta recusa.
    const download = f.mock.calls.find(([u]) => String(u).includes("lookaside")) as unknown as [string, RequestInit];
    expect((download[1].headers as Record<string, string>).authorization).toBe("Bearer EAAtk");

    expect(fake.salvos[0].caminho).toBe("users/barbearia-t1/contacts/wa_5519984487271/wa/wamid.1.jpg");
    const tokenDownload = (fake.salvos[0].opcoes.metadata as { metadata: { firebaseStorageDownloadTokens: string } }).metadata
      .firebaseStorageDownloadTokens;
    const msg = fake.docs.get(MSG)!;
    expect(msg).toMatchObject({ pending: false, mimeType: "image/jpeg", sizeBytes: 8 });
    expect(msg.mediaUrl).toBe(
      `https://firebasestorage.googleapis.com/v0/b/ocartel-497f8.firebasestorage.app/o/${encodeURIComponent(
        "users/barbearia-t1/contacts/wa_5519984487271/wa/wamid.1.jpg",
      )}?alt=media&token=${tokenDownload}`,
    );
  });

  it("não baixa de novo o que já tem arquivo", async () => {
    fake.docs.set(MSG, { waMediaId: "m1", mediaUrl: "https://ja" });
    const f = meta({});
    expect(await baixarMidiaDaMensagem("t1", "wa_5519984487271", "wamid.1")).toBe("ja-tinha");
    expect(f).not.toHaveBeenCalled();
  });

  it("vencida: marca o erro e tira de pendente; passageira: deixa para a próxima", async () => {
    fake.docs.set(MSG, { waMediaId: "m1", pending: true });
    meta({ error: { code: 131052, message: "expired" } }, 400);
    expect(await baixarMidiaDaMensagem("t1", "wa_5519984487271", "wamid.1")).toBe("falhou");
    expect(fake.docs.get(MSG)).toMatchObject({ pending: false, mediaError: expect.stringMatching(/expirada/) });

    fake.docs.set(MSG, { waMediaId: "m1", pending: true });
    meta({ error: { code: 1, message: "temporário" } }, 500);
    expect(await baixarMidiaDaMensagem("t1", "wa_5519984487271", "wamid.1")).toBe("falhou");
    expect(fake.docs.get(MSG)).toEqual({ waMediaId: "m1", pending: true });
  });
});
