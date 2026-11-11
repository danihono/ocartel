// O aviso que a janela da Meta (Embedded Signup) manda para a página ao terminar.
//
// Fica num arquivo à parte porque roda no NAVEGADOR — é a página de Configurações que
// escuta a janela — e `cloud.ts` usa `node:crypto`, que não existe lá.

/** O que a janela da Meta avisou, já interpretado. */
export type SessaoEmbedded =
  | {
      tipo: "fim";
      phoneNumberId?: string;
      wabaId?: string;
      /** O número já era usado no app WhatsApp Business e continua nele (Coexistência). */
      coexistencia: boolean;
    }
  | { tipo: "cancelado"; etapa: string }
  | { tipo: "erro"; mensagem: string; codigo: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Lê o `message` que a janela da Meta posta para a página.
 *
 * Aceita os dois formatos em uso: o v5 (`messaging_account_ids`, `is_on_biz_app`) e o v4
 * (`waba_id`). Qualquer outra coisa — e chegam muitas, de outras partes do SDK — é `null`.
 */
export function lerSessaoEmbedded(dado: unknown): SessaoEmbedded | null {
  let d: Obj;
  try {
    d = obj(typeof dado === "string" ? JSON.parse(dado) : dado);
  } catch {
    return null;
  }
  if (texto(d.type) !== "WA_EMBEDDED_SIGNUP") return null;

  const evento = texto(d.event);
  const data = obj(d.data);

  if (evento.startsWith("FINISH")) {
    const contas = Array.isArray(data.messaging_account_ids) ? data.messaging_account_ids : [];
    const wabaId = texto(data.waba_id) || texto(contas[0]);
    return {
      tipo: "fim",
      ...(texto(data.phone_number_id) ? { phoneNumberId: texto(data.phone_number_id) } : {}),
      ...(wabaId ? { wabaId } : {}),
      coexistencia: evento === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || data.is_on_biz_app === true,
    };
  }
  if (evento === "CANCEL") return { tipo: "cancelado", etapa: texto(data.current_step) };
  if (evento === "ERROR") return { tipo: "erro", mensagem: texto(data.error_message), codigo: texto(data.error_code) };
  return null;
}
