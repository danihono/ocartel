/*
 * Liga uma barbearia a um número da API oficial do WhatsApp (Cloud API da Meta).
 *
 * Grava os dois lados que o sistema precisa:
 *   - `tenants/{t}/private/whatsapp`   → por onde a mensagem SAI (lib/canal);
 *   - `whatsappNumeros/{phoneNumberId}` → de quem é a mensagem que CHEGA (o webhook).
 *
 * O token NÃO passa por aqui de propósito: argumento de linha de comando fica no
 * histórico do shell. Enquanto for o número de teste (ou um token de usuário do sistema),
 * ele vem da variável WHATSAPP_TOKEN do servidor.
 *
 * Para voltar ao daemon: `--desfazer`. Apaga o índice e o `provedor`; o pareamento por QR
 * volta a valer.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
 *   npm run whatsapp:cloud-vincular -- <tenantId> <phoneNumberId> [numero]
 *
 *   npm run whatsapp:cloud-vincular -- <tenantId> --desfazer
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { uidDaBarbearia } from "@/lib/canal/uid";

async function main() {
  const [tenantId, segundo, numero] = process.argv.slice(2);
  if (!tenantId || !segundo) {
    console.error("uso: npm run whatsapp:cloud-vincular -- <tenantId> <phoneNumberId> [numero]");
    console.error("     npm run whatsapp:cloud-vincular -- <tenantId> --desfazer");
    process.exit(1);
  }

  const tenant = await adminDb.doc(`tenants/${tenantId}`).get();
  if (!tenant.exists) {
    console.error(`Barbearia "${tenantId}" não existe neste projeto.`);
    process.exit(1);
  }

  const vinculoRef = adminDb.doc(`tenants/${tenantId}/private/whatsapp`);

  if (segundo === "--desfazer") {
    const antigo = String((await vinculoRef.get()).get("phoneNumberId") ?? "");
    if (antigo) await adminDb.doc(`whatsappNumeros/${antigo}`).delete();
    await vinculoRef.set({ provedor: FieldValue.delete(), phoneNumberId: FieldValue.delete() }, { merge: true });
    console.log(`↩️  ${tenantId} voltou para o daemon.`);
    return;
  }

  const phoneNumberId = segundo;
  if (!/^\d{6,}$/.test(phoneNumberId)) {
    console.error(`"${phoneNumberId}" não parece um Phone Number ID (só dígitos, copiado do painel da Meta).`);
    process.exit(1);
  }

  // Um número, uma barbearia: o webhook precisa de uma resposta só para "de quem é".
  const dono = String((await adminDb.doc(`whatsappNumeros/${phoneNumberId}`).get()).get("tenantId") ?? "");
  if (dono && dono !== tenantId) {
    console.error(`Este número já está ligado à barbearia "${dono}". Desfaça lá antes.`);
    process.exit(1);
  }

  await vinculoRef.set(
    {
      uid: uidDaBarbearia(tenantId),
      provedor: "cloud",
      phoneNumberId,
      ...(numero ? { numero: numero.replace(/\D/g, "") } : {}),
      vinculadoEm: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await adminDb.doc(`whatsappNumeros/${phoneNumberId}`).set({ tenantId, vinculadoEm: FieldValue.serverTimestamp() });

  console.log(`✅ ${tenantId} agora fala pela API oficial (Phone Number ID ${phoneNumberId}).`);
  console.log("   Se o daemon ainda tiver sessão desta barbearia, desconecte-a: os dois juntos duplicam a conversa.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
