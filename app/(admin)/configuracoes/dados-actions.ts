"use server";

// Backup completo dos dados da barbearia (Configurações → Seus dados).
//
// Roda no servidor, com o Admin SDK, de propósito: o navegador só carrega uma JANELA dos
// dados (agendamentos dos últimos meses, as últimas cobranças) para a tela ficar leve.
// Um backup feito dali sairia incompleto sem avisar ninguém. Aqui sai tudo.
//
// Fica de fora o que é segredo e não é "dado da barbearia": `private/**` (chave do
// gateway de cobrança, regra de comissão crua, vínculo do WhatsApp) e os tokens de
// cartão. O e-mail de quem tem login também não entra.

import { adminDb } from "@/lib/firebase/admin";
import { comoResultado, exigirQuemGerencia, type Resultado } from "@/lib/autorizacao";
import { serializar } from "@/lib/serializar";
import { COLECOES_BACKUP, type DadosBackup } from "@/lib/backup";

export async function acaoBackupCompleto(
  idToken: string,
  tenantId: string,
): Promise<Resultado & { dados?: DadosBackup }> {
  try {
    await exigirQuemGerencia(idToken, tenantId);
    const tenant = adminDb.doc(`tenants/${tenantId}`);
    const lidas = await Promise.all(
      COLECOES_BACKUP.map(async (nome) => {
        const snap = await tenant.collection(nome).get();
        return [nome, snap.docs.map((d) => ({ id: d.id, ...(serializar(d.data()) as Record<string, unknown>) }))] as const;
      }),
    );
    return { ok: true, dados: Object.fromEntries(lidas) as unknown as DadosBackup };
  } catch (err) {
    return comoResultado(err);
  }
}
