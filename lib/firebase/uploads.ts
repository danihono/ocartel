// Upload de imagens (logo da barbearia, foto dos barbeiros) para o Storage.
//
// Os caminhos são sempre `tenants/{tenantId}/...` porque é assim que as regras
// do Storage escopam a escrita — e lá o tenant vem do custom claim, já que
// regras de Storage não conseguem consultar o Firestore.

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./config";

/** Mesmos limites das regras (storage.rules) — aqui só para avisar antes de subir. */
export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const TAMANHO_MAXIMO = 2 * 1024 * 1024;

/**
 * Valida antes de gastar a subida. As regras do Storage recusam de novo no
 * servidor — esta checagem existe para dar uma mensagem decente em vez de um
 * erro de permissão genérico.
 */
export function validarImagem(arquivo: File): string | null {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return "Envie uma imagem JPG, PNG, WEBP ou GIF.";
  if (arquivo.size > TAMANHO_MAXIMO) return "A imagem precisa ter menos de 2 MB.";
  return null;
}

function extensaoDe(arquivo: File): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[arquivo.type] ?? "jpg";
}

async function subir(caminho: string, arquivo: File): Promise<string> {
  const destino = ref(storage, caminho);
  await uploadBytes(destino, arquivo, { contentType: arquivo.type });
  return getDownloadURL(destino);
}

/**
 * Caminho fixo por barbeiro (sem timestamp no nome): substituir a foto
 * sobrescreve a anterior em vez de acumular órfãos no bucket. A extensão entra
 * no nome porque o tipo pode mudar entre um envio e outro.
 */
export function uploadFotoBarbeiro(tenantId: string, barbeiroId: string, arquivo: File): Promise<string> {
  return subir(`tenants/${tenantId}/barbeiros/${barbeiroId}.${extensaoDe(arquivo)}`, arquivo);
}

export function uploadLogoTenant(tenantId: string, arquivo: File): Promise<string> {
  return subir(`tenants/${tenantId}/logo.${extensaoDe(arquivo)}`, arquivo);
}

/**
 * Remove um arquivo já enviado. Silencia "não existe": remover o que já não
 * está lá é o resultado desejado, não um erro.
 */
export async function removerImagem(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    /* já não existe, ou o link não é do nosso bucket */
  }
}
