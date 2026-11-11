// Conectar o número de uma barbearia à API oficial — o que acontece depois que a pessoa
// termina a janela da Meta (Embedded Signup).
//
// A janela devolve duas coisas: os ids (número e conta) e um código que vale 30 segundos.
// Daqui em diante é servidor com servidor, como a Meta exige:
//
//   1. troca o código pelo token da barbearia;
//   2. inscreve o app na conta, senão o webhook nunca recebe nada dela;
//   3. registra o número na API — só quando NÃO é Coexistência (número que já está no app
//      WhatsApp Business já vem registrado, e registrar de novo é erro);
//   4. grava o vínculo e o índice, e o canal da barbearia passa a ser a API oficial;
//   5. na Coexistência, pede a agenda e o histórico do celular. Isso tem prazo: 24 horas
//      depois da conexão, e só uma vez — por isso é feito aqui, na mesma hora.
//
// Só servidor (Admin SDK).

import { randomInt } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { chamarGraph, trocarCodigo } from "./cloud";
import { refNumero } from "./cloud-espelho";

export interface PedidoConexao {
  /** O código que a janela da Meta devolveu ao clicar em Concluir. */
  code: string;
  phoneNumberId?: string;
  wabaId?: string;
  /** A janela disse que o número veio do app WhatsApp Business. */
  coexistencia?: boolean;
}

export type ResultadoConexao =
  | { ok: true; numero: string; coexistencia: boolean; avisos: string[] }
  | { ok: false; erro: string };

export async function conectarNumeroOficial(tenantId: string, p: PedidoConexao): Promise<ResultadoConexao> {
  const appId = (process.env.NEXT_PUBLIC_META_APP_ID ?? "").trim();
  const appSecret = (process.env.WHATSAPP_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) return { ok: false, erro: "O servidor não tem o ID ou a chave secreta do app da Meta." };
  if (!p.code) return { ok: false, erro: "A Meta não devolveu o código de acesso. Tente de novo." };
  if (!p.wabaId) return { ok: false, erro: "A Meta não informou a conta do WhatsApp. Tente de novo." };

  // 1. Antes de tudo: o código vence em 30 segundos.
  const troca = await trocarCodigo(appId, appSecret, p.code);
  if (!troca.ok) return troca;
  const token = troca.token;

  // A janela costuma mandar o número; se não mandou, é o primeiro da conta.
  let phoneNumberId = p.phoneNumberId ?? "";
  if (!phoneNumberId) {
    const numeros = await chamarGraph(token, "GET", `${p.wabaId}/phone_numbers?fields=id`);
    const primeiro = numeros.ok ? (numeros.dados.data as { id?: string }[] | undefined)?.[0]?.id : undefined;
    if (!primeiro) return { ok: false, erro: "Não encontrei o número nesta conta do WhatsApp." };
    phoneNumberId = primeiro;
  }

  // Um número, uma barbearia — conferido ANTES de mexer em qualquer coisa na Meta.
  const donoNovo = String((await refNumero(phoneNumberId).get()).get("tenantId") ?? "");
  if (donoNovo && donoNovo !== tenantId) {
    return { ok: false, erro: "Este número já está conectado a outra barbearia." };
  }

  // 2. Sem esta inscrição a conta fica muda para o webhook — foi exatamente o que travou o
  // número de teste.
  const inscricao = await chamarGraph(token, "POST", `${p.wabaId}/subscribed_apps`);
  if (!inscricao.ok) return { ok: false, erro: `Não consegui ligar o webhook à conta: ${inscricao.erro}` };

  const info = await chamarGraph(
    token,
    "GET",
    `${phoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
  );
  const dados = info.ok ? info.dados : {};
  const coexistencia = p.coexistencia === true || dados.is_on_biz_app === true;
  const numero = String(dados.display_phone_number ?? "").replace(/\D/g, "");

  // 3. Número novo, só da API, precisa ser registrado — com um PIN de 6 dígitos que vira a
  // verificação em duas etapas dele. Guardado junto do token: sem ele não dá para registrar
  // de novo num outro app.
  let pin: string | undefined;
  if (!coexistencia && dados.platform_type !== "CLOUD_API") {
    pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const registro = await chamarGraph(token, "POST", `${phoneNumberId}/register`, {
      messaging_product: "whatsapp",
      pin,
    });
    if (!registro.ok) return { ok: false, erro: `Não consegui ativar o número na API: ${registro.erro}` };
  }

  // 4. O vínculo. O número antigo (o de teste, por exemplo) solta a barbearia.
  const vinculoRef = adminDb.doc(`tenants/${tenantId}/private/whatsapp`);
  const antigo = String((await vinculoRef.get()).get("phoneNumberId") ?? "");

  const lote = adminDb.batch();
  lote.set(
    vinculoRef,
    {
      uid: uidDaBarbearia(tenantId),
      provedor: "cloud",
      phoneNumberId,
      wabaId: p.wabaId,
      coexistencia,
      ...(numero ? { numero } : {}),
      ...(dados.verified_name ? { nomeVerificado: String(dados.verified_name) } : {}),
      vinculadoEm: FieldValue.serverTimestamp(),
      sincronizacao: FieldValue.delete(),
    },
    { merge: true },
  );
  lote.set(adminDb.doc(`tenants/${tenantId}/private/whatsapp/credenciais/cloud`), {
    token,
    ...(pin ? { pin } : {}),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  lote.set(refNumero(phoneNumberId), { tenantId, vinculadoEm: FieldValue.serverTimestamp() });
  if (antigo && antigo !== phoneNumberId) lote.delete(refNumero(antigo));
  await lote.commit();

  // 5. Agenda e histórico do celular. Falhar aqui não desfaz a conexão — o número já está
  // funcionando —, mas a tela precisa avisar: depois de 24 horas não dá mais para pedir.
  const avisos: string[] = [];
  if (coexistencia) {
    const sincronizacao: Record<string, string> = {};
    for (const tipo of ["smb_app_state_sync", "history"] as const) {
      const r = await chamarGraph(token, "POST", `${phoneNumberId}/smb_app_data`, {
        messaging_product: "whatsapp",
        sync_type: tipo,
      });
      const nome = tipo === "history" ? "histórico" : "contatos";
      if (r.ok) sincronizacao[tipo] = String(r.dados.request_id ?? "pedido");
      else avisos.push(`Não consegui pedir os ${nome} do celular: ${r.erro}`);
    }
    await vinculoRef.set({ sincronizacao: { pedidos: sincronizacao, pedidoEm: new Date().toISOString() } }, { merge: true });
  }

  return { ok: true, numero, coexistencia, avisos };
}
