# O Cartel — Worker do WhatsApp + IA

Serviço **sempre-ligado** que conecta o WhatsApp de cada barbearia (via Baileys,
igual ao WhatsApp Web) e roda a **IA de agendamento** (OpenAI, function calling).

> **Por que um serviço separado?** O Baileys mantém um WebSocket vivo e exige um
> processo que nunca dorme e com **uma única instância** por sessão. O app O Cartel
> roda no Firebase App Hosting (Cloud Run com CPU estrangulada entre requests e
> `maxInstances: 2`) — cenário que mata o socket e desloga o WhatsApp. Por isso o
> worker vive fora do app e conversa com ele **pelo mesmo Firestore**.

## Como conversa com o app

Tudo pelo Firestore (o worker usa o Admin SDK, ignora as regras):

| Caminho | Quem escreve | Para quê |
|---|---|---|
| `tenants/{t}/integrations/whatsapp` | worker (status/QR) · UI (comando) | conexão, QR, connect/disconnect |
| `tenants/{t}/waAuth/*` | worker | sessão do Baileys (creds + chaves) — **nunca exposto ao cliente** |
| `tenants/{t}/waPropostas/*` | worker (cria) · UI (aprova/recusa) | fila de aprovação da IA |
| `tenants/{t}/waConversas/{jid}` | worker | contexto curto da conversa |

## Rodar local (contra o emulador do Firestore)

```bash
cd whatsapp-worker
cp .env.example .env    # preencha OPENAI_API_KEY
npm install
# aponte para o emulador do app (rode `npm run emulators` no projeto raiz):
export FIRESTORE_EMULATOR_HOST=localhost:8080
export GOOGLE_CLOUD_PROJECT=ocartel-497f8
npm run dev
```

Na UI do O Cartel, vá em **WhatsApp & IA → Conectar** — o QR aparece na tela.
Escaneie no celular (WhatsApp → Aparelhos conectados). Reinicie o worker: ele
reconecta **sem** pedir QR (reidratação a partir de `waAuth`).

## Deploy — Cloud Run (1 instância, CPU sempre alocada)

Requisitos não-negociáveis do Baileys: **CPU não estrangulada** e **1 holder por
sessão**.

```bash
gcloud run deploy ocartel-whatsapp \
  --source . \
  --region southamerica-east1 \
  --no-cpu-throttling \
  --min-instances 1 \
  --max-instances 1 \
  --no-allow-unauthenticated \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=ocartel-497f8,OPENAI_MODEL=gpt-4o-mini
```

- `--no-cpu-throttling` + `--min-instances 1`: o socket nunca é estrangulado.
- `--max-instances 1`: garante um único holder por sessão (evita duplo-logout).
- No mesmo projeto GCP, as credenciais do Admin SDK são as do ambiente (ADC) — não
  precisa de service account. A service account do Cloud Run precisa do papel
  **Cloud Datastore User** (acesso ao Firestore).
- Crie o secret antes: `printf '%s' "sk-..." | gcloud secrets create OPENAI_API_KEY --data-file=-`.

Alternativa (Railway/Fly.io): mesma imagem; configure uma service account do
Firebase via `GOOGLE_APPLICATION_CREDENTIALS` e mantenha **1 réplica**.

## Pausar pra economizar (e religar)

Este worker roda **CPU sempre alocada, 24/7** — é o maior custo do projeto no
Cloud Run. Como o Baileys exige um socket sempre vivo, **não há** modo "ligado e
barato": ou está no ar (cobrando) ou pausado. Pausar **não perde nada** — a
sessão do WhatsApp fica salva no Firestore (`waAuth`) e volta sem pedir QR.

**Pausar (para de cobrar):**

```bash
gcloud run services delete ocartel-whatsapp --region southamerica-east1
```

**Religar:** rode de novo o `gcloud run deploy ...` da seção de deploy acima. Na
subida o worker reidrata a sessão a partir de `desiredState: connected` e
reconecta o WhatsApp automaticamente.

> Alternativa sem deletar: `gcloud run services update ocartel-whatsapp
> --region southamerica-east1 --min-instances 0`. Escala a zero quando ocioso,
> mas o WhatsApp cai junto (o socket precisa de instância viva), então na
> prática o efeito é o mesmo de pausar — porém mantém o serviço/URL criado.

## Restrições (do guia Baileys) já implementadas

- Auth no Firestore com `BufferJSON`, `creds` separado das chaves, leitura em lote,
  `makeCacheableSignalKeyStore`.
- `connection.update`: QR → Firestore; distingue `loggedOut` (não reconecta) de
  queda recuperável (backoff exponencial + jitter).
- Reidratação no boot a partir de `desiredState: connected`.
- `sock.end()` no SIGTERM (nunca `logout`) — deploy não pede QR de novo.
- `syncFullHistory: false`, `markOnlineOnConnect: false`, logger em `warn+`
  (nunca loga corpo de mensagem nem chaves).
