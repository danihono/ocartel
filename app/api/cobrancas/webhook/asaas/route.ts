// Baixa automática — o Asaas avisa aqui quando um boleto é pago, e a cobrança fica "Pago"
// sozinha. É a ponta que fecha o ciclo: ninguém precisa clicar em "Registrar pagamento"
// para o dinheiro que entra por boleto.
//
// A rota é PÚBLICA (o Asaas precisa alcançá-la), então a autenticação é o token que ele
// devolve no header `asaas-access-token`, comparado com o que a barbearia guardou em
// `tenants/{id}/private/asaas`. Sem isso, quem descobrisse a URL marcaria qualquer
// cobrança como paga.

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { credenciaisDoTenant, CobradorNaoConfigurado } from "@/lib/cobrador";
import { lerReferencia } from "@/lib/cobranca-ciclo";
import { tokenConfere } from "@/lib/confirmacao";

export const dynamic = "force-dynamic";

/** Eventos em que o dinheiro já é da barbearia. `PENDING`/`CREATED` não dão baixa. */
const EVENTOS_DE_BAIXA = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);

interface EventoAsaas {
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    externalReference?: string;
    paymentDate?: string;
    clientPaymentDate?: string;
    confirmedDate?: string;
  };
}

export async function POST(req: Request) {
  let corpo: EventoAsaas;
  try {
    corpo = (await req.json()) as EventoAsaas;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  const ref = lerReferencia(corpo.payment?.externalReference ?? "");
  if (!ref) {
    // Sem referência não há como saber de quem é o pagamento. 200 de propósito: devolver
    // erro faria o Asaas reenfileirar para sempre um evento que nunca vai ser processável
    // (ex.: cobrança criada à mão no painel dele).
    return NextResponse.json({ ignorado: "sem externalReference reconhecível" });
  }

  let webhookToken: string | undefined;
  try {
    webhookToken = (await credenciaisDoTenant(ref.tenantId)).webhookToken;
  } catch (err) {
    if (err instanceof CobradorNaoConfigurado) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
    throw err;
  }

  // Sem token configurado a rota RECUSA — não é o mesmo que "liberar quando não há senha".
  const enviado = req.headers.get("asaas-access-token") ?? "";
  if (!webhookToken || !tokenConfere(enviado, webhookToken)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  if (!EVENTOS_DE_BAIXA.has(String(corpo.event ?? ""))) {
    return NextResponse.json({ ignorado: corpo.event ?? null });
  }

  const docRef = adminDb.doc(`tenants/${ref.tenantId}/transacoes/${ref.transacaoId}`);
  const snap = await docRef.get();
  if (!snap.exists) return NextResponse.json({ ignorado: "cobrança inexistente" });

  const atual = snap.data() ?? {};
  // Reprocessar o mesmo evento é seguro: o Asaas reenvia quando não recebe 200, e uma
  // cobrança já quitada não pode ter a data do pagamento reescrita.
  if (atual.status === "pago") return NextResponse.json({ ok: true, jaEstavaPago: true });

  const pagamento = corpo.payment ?? {};
  const paidAt = pagamento.paymentDate ?? pagamento.clientPaymentDate ?? pagamento.confirmedDate;

  await docRef.set(
    {
      status: "pago",
      // Os três campos que a tela e a auditoria exigem para um "pago" — os mesmos que
      // `transacaoUpdateValida()` cobra nas regras do Firestore.
      paidAt: paidAt ?? new Date().toISOString().slice(0, 10),
      amountReceived: typeof pagamento.value === "number" ? pagamento.value : (atual.amount ?? atual.valor ?? 0),
      forma: "boleto",
      source: "gateway",
      confirmedBy: "Asaas (automático)",
    },
    { merge: true },
  );

  // NÃO incrementa `totalGasto`/`atendimentos` do cliente: esses contadores são de
  // atendimento concluído e têm um dono único (`repos.agendamentos.concluir`). Mensalidade
  // não passa por lá — e mexer nisso aqui faria a ficha do cliente contar corte que não houve.
  return NextResponse.json({ ok: true, transacaoId: ref.transacaoId });
}
