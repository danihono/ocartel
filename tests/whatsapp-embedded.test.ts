import { describe, it, expect } from "vitest";
import { lerSessaoEmbedded } from "@/lib/whatsapp/embedded";

const evento = (event: string, data: Record<string, unknown>) =>
  JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data });

describe("lerSessaoEmbedded", () => {
  it("v5 com número do app WhatsApp Business (Coexistência)", () => {
    expect(
      lerSessaoEmbedded(
        evento("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", {
          phone_number_id: "111",
          is_on_biz_app: true,
          messaging_account_ids: ["222"],
          business_id: "333",
        }),
      ),
    ).toEqual({ tipo: "fim", phoneNumberId: "111", wabaId: "222", coexistencia: true });
  });

  it("v4, número novo só da API", () => {
    expect(lerSessaoEmbedded(evento("FINISH", { phone_number_id: "111", waba_id: "222" }))).toEqual({
      tipo: "fim",
      phoneNumberId: "111",
      wabaId: "222",
      coexistencia: false,
    });
  });

  it("aceita o objeto já lido, além da string", () => {
    expect(lerSessaoEmbedded({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } })).toEqual({
      tipo: "cancelado",
      etapa: "PHONE_NUMBER_SETUP",
    });
  });

  it("erro relatado na janela", () => {
    expect(lerSessaoEmbedded(evento("ERROR", { error_message: "nome inválido", error_code: "524126" }))).toEqual({
      tipo: "erro",
      mensagem: "nome inválido",
      codigo: "524126",
    });
  });

  it("ignora o resto do que o SDK posta", () => {
    expect(lerSessaoEmbedded("cb=f123&domain=x")).toBeNull();
    expect(lerSessaoEmbedded(JSON.stringify({ type: "outra coisa" }))).toBeNull();
    expect(lerSessaoEmbedded(null)).toBeNull();
  });
});
