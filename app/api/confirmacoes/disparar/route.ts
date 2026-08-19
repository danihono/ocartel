// Disparo das confirmações do dia — chamado por um agendador externo (timer na VPS),
// de hora em hora. A rota é que decide QUAIS barbearias disparam naquela hora, olhando
// a config de cada uma: assim um único agendador atende todas, sem cron por barbearia.
//
// Protegida por segredo compartilhado. Não é rota de usuário.

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { canalDoTenant, WhatsAppNaoConfigurado } from "@/lib/canal";
import { linkConfirmacao, mensagemWhatsApp, montarCodigo } from "@/lib/confirmacao";
import { telefoneWhatsApp } from "@/lib/clientes-import";
import { agoraEmBrasilia, deveAvisar, deveDispararAgora } from "@/lib/confirmacao-disparo";

export const dynamic = "force-dynamic";

interface Resultado {
  tenantId: string;
  enviadas: number;
  falhas: number;
  motivo?: string;
}

export async function POST(req: Request) {
  const segredo = process.env.CONFIRMACOES_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "CONFIRMACOES_SECRET não configurado." }, { status: 500 });
  }
  if (req.headers.get("x-confirmacoes-secret") !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || new URL(req.url).origin;
  const { dataISO, hora } = agoraEmBrasilia();

  const tenants = await adminDb.collection("tenants").get();
  const resultados: Resultado[] = [];

  for (const tenantDoc of tenants.docs) {
    const tenantId = tenantDoc.id;
    const configSnap = await adminDb.doc(`tenants/${tenantId}/config/main`).get();
    const config = configSnap.data() ?? {};

    if (!deveDispararAgora(config.confirmacao, hora)) continue;

    try {
      resultados.push(await dispararTenant({ tenantId, nomeBarbearia: config.nome ?? "", dataISO, origin }));
    } catch (err) {
      resultados.push({
        tenantId,
        enviadas: 0,
        falhas: 0,
        motivo: err instanceof WhatsAppNaoConfigurado ? "sem WhatsApp vinculado" : String(err),
      });
    }
  }

  return NextResponse.json({ dataISO, hora, tenants: resultados });
}

async function dispararTenant(params: {
  tenantId: string;
  nomeBarbearia: string;
  dataISO: string;
  origin: string;
}): Promise<Resultado> {
  const { tenantId, nomeBarbearia, dataISO, origin } = params;
  const canal = await canalDoTenant(tenantId);

  const agendamentos = await adminDb
    .collection(`tenants/${tenantId}/agendamentos`)
    .where("date", "==", dataISO)
    .get();

  // Nome do profissional entra na mensagem; um get por barbeiro seria desperdício.
  const barbeiros = new Map<string, string>();
  for (const b of (await adminDb.collection(`tenants/${tenantId}/barbeiros`).get()).docs) {
    barbeiros.set(b.id, String(b.data()?.nome ?? ""));
  }

  let enviadas = 0;
  let falhas = 0;

  for (const doc of agendamentos.docs) {
    const ag = doc.data();
    if (!deveAvisar(ag)) continue;

    const telefone = telefoneWhatsApp(String(ag.clienteTelefone ?? ""));
    if (!telefone) continue; // cliente sem número utilizável — nada a fazer

    const texto = mensagemWhatsApp({
      cliente: String(ag.clienteNome ?? ""),
      barbearia: nomeBarbearia,
      servico: String(ag.servico ?? ""),
      profissional: barbeiros.get(String(ag.barbeiroId ?? "")) ?? "",
      dateISO: dataISO,
      hora: String(ag.inicio ?? ""),
      link: linkConfirmacao(
        origin,
        montarCodigo({ tenantId, agendamentoId: doc.id, token: String(ag.confirmToken) }),
      ),
      jaConfirmado: ag.status === "confirmado",
    });

    try {
      await canal.enviarMensagem(telefone, texto);
      // Só marca DEPOIS do envio: marcar antes faria uma falha de rede virar cliente
      // que nunca é avisado, silenciosamente.
      await doc.ref.set({ confirmacaoEnviadaEm: new Date().toISOString() }, { merge: true });
      enviadas += 1;
    } catch {
      // Uma falha não pode interromper o resto da fila do dia. Como `confirmacaoEnviadaEm`
      // continua ausente, a janela de retentativa (horas seguintes) pega este de novo.
      falhas += 1;
    }
  }

  return { tenantId, enviadas, falhas };
}
