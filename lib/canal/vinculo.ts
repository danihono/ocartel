// O vínculo entre um número de WhatsApp e o cliente cadastrado.
//
// Casar por telefone na hora de exibir funciona, mas só enquanto os dois lados guardarem
// o número na mesma forma — e é justamente aí que o sistema já tropeçou (ver
// lib/telefone.ts). Guardar o vínculo dos dois lados resolve de vez: a partir da primeira
// vez que se souber quem é, ninguém mais precisa deduzir.
//
// Quem se beneficia: a tela mostra o nome do cadastro em vez do pushName do WhatsApp; o
// atendente com IA sabe com quem fala (plano, histórico, próximo horário); e a Agenda
// sabe por onde falar com quem tem horário marcado.
//
// Só servidor (Admin SDK).

import { adminDb } from "@/lib/firebase/admin";
import { chaveTelefone, contactIdDoTelefone } from "@/lib/telefone";
import { uidDaBarbearia } from "./uid";

/**
 * Amarra o contato do espelho ao cliente do cadastro, nos dois sentidos.
 *
 * Idempotente: os ids são determinísticos, então chamar de novo reescreve o mesmo valor.
 * O lado do cliente usa `update` de propósito — `set(merge)` num id que não existe criaria
 * um cliente pela metade, sem nome, que apareceria na lista da barbearia.
 */
export async function vincular(tenantId: string, clienteId: string, telefone: string): Promise<string | null> {
  const chave = chaveTelefone(telefone);
  if (!chave || !clienteId) return null;

  const contactId = contactIdDoTelefone(chave.wa);
  const uid = uidDaBarbearia(tenantId);

  await adminDb.doc(`users/${uid}/contacts/${contactId}`).set({ clienteId, tenantId }, { merge: true });
  await adminDb
    .doc(`tenants/${tenantId}/clientes/${clienteId}`)
    .update({ waContactId: contactId })
    // Cliente apagado no meio do caminho não é motivo para derrubar o envio.
    .catch(() => {});

  return contactId;
}

/**
 * Quem é o dono deste número, entre os clientes da barbearia.
 *
 * Procura na ordem do que é mais confiável: o vínculo já gravado, depois o id
 * determinístico do booking (`tel-<curto>`), depois `telefoneNorm`. O último passo existe
 * para o cadastro antigo, importado antes de haver vínculo.
 */
export async function clienteDoTelefone(
  tenantId: string,
  telefone: string,
): Promise<{ id: string; nome: string } | null> {
  const chave = chaveTelefone(telefone);
  if (!chave) return null;

  const porVinculo = await adminDb
    .collection(`tenants/${tenantId}/clientes`)
    .where("waContactId", "==", contactIdDoTelefone(chave.wa))
    .limit(1)
    .get();
  if (!porVinculo.empty) {
    const doc = porVinculo.docs[0];
    return { id: doc.id, nome: String(doc.get("nome") ?? "") };
  }

  const porId = await adminDb.doc(`tenants/${tenantId}/clientes/tel-${chave.curto}`).get();
  if (porId.exists) return { id: porId.id, nome: String(porId.get("nome") ?? "") };

  const porNorm = await adminDb
    .collection(`tenants/${tenantId}/clientes`)
    .where("telefoneNorm", "==", chave.curto)
    .limit(1)
    .get();
  if (!porNorm.empty) {
    const doc = porNorm.docs[0];
    return { id: doc.id, nome: String(doc.get("nome") ?? "") };
  }

  return null;
}
