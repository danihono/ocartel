# WhatsApp pela API oficial (Cloud API da Meta)

O Cartel nasceu falando pelo daemon Baileys (WhatsApp Web, pareado por QR). Esta é a
troca para a API oficial da Meta, **uma barbearia por vez**: cada uma escolhe o caminho
em `tenants/{t}/private/whatsapp.provedor` (`"cloud"`, ou ausente = daemon).

## O que muda e o que não muda

O espelho das conversas continua o mesmo (`users/barbearia-{t}/contacts/**`, os mesmos
campos). Por isso a tela de WhatsApp, as não lidas, o vínculo com o cadastro e o atendente
com IA funcionam sem saber que o transporte mudou.

| | Daemon | API oficial |
|---|---|---|
| Chegada | o daemon grava | `POST /api/whatsapp/webhook` grava (`lib/whatsapp/cloud-espelho.ts`) |
| Saída | fila `waCommands` | `CanalCloud` em `lib/canal/index.ts` → Graph API, e grava no espelho |
| Conexão | QR em Configurações | feita na Meta; a tela mostra "conectado" |
| Foto de perfil | sim | **não existe na API** (fica com as iniciais) |
| Texto livre | sempre | só **até 24 h** depois da última mensagem do cliente |
| Mídia recebida | baixada | **gravada como "📷 Foto" pendente** (`waMediaId` guardado; download é a próxima etapa) |

**Regra das 24 horas.** Fora da janela a Meta recusa texto livre (erro 131047) e a tela
mostra o motivo em português. Mensagens de iniciativa da barbearia — **confirmação da
manhã e cobrança** — precisam de **template aprovado**. Isso é a próxima etapa; até lá,
numa barbearia em `cloud`, elas só saem para quem falou nas últimas 24 horas.

**Nono dígito.** Conta de WhatsApp antiga tem `wa_id` brasileiro sem o 9. O webhook
devolve o 9 (`numeroDoWaId`) para casar com o cadastro, e guarda o `waId` cru no contato:
a resposta sai para ele.

## Configurar (uma vez por projeto)

### 1. Segredos

Três segredos no Secret Manager. Eles estão em `firebase.json`
(`frameworksBackend.secrets`): **sem criá-los, o `firebase deploy` falha.**

```bash
firebase functions:secrets:set WHATSAPP_APP_SECRET
```

```bash
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
```

```bash
firebase functions:secrets:set WHATSAPP_TOKEN
```

| Segredo | De onde vem |
|---|---|
| `WHATSAPP_APP_SECRET` | painel do app na Meta → Configurações do app → Básico → **Chave secreta do app** |
| `WHATSAPP_VERIFY_TOKEN` | **você inventa** (uma senha longa qualquer); é repetida no painel da Meta no passo 3 |
| `WHATSAPP_TOKEN` | o token de acesso. O de teste vence em 24 h; para valer, gere um **token de usuário do sistema** (Business Manager → Usuários do sistema) |

Opcional, sem ser segredo: `WHATSAPP_GRAPH_VERSION` (padrão `v27.0`).

Token por barbearia (quando cada uma conectar o próprio número) vai em
`tenants/{t}/private/whatsapp/credenciais/cloud.token` — documento aninhado, fora do
alcance das regras do navegador. Sem ele, vale o `WHATSAPP_TOKEN`.

### 2. Publicar

```bash
firebase deploy --only hosting
```

### 3. Cadastrar o webhook na Meta

Painel do app → WhatsApp → **Configuração** → Webhook → Editar:

- **URL de callback:** `https://<domínio do Cartel>/api/whatsapp/webhook`
- **Token de verificação:** o mesmo valor do `WHATSAPP_VERIFY_TOKEN`

Depois, em **Campos do webhook**, assine `messages` (e `smb_message_echoes` quando for
Coexistência).

### 4. Ligar a barbearia ao número

```bash
GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ocartel-497f8 \
npm run whatsapp:cloud-vincular -- <tenantId> <phoneNumberId> [numero]
```

Grava `tenants/{t}/private/whatsapp` (`provedor: "cloud"`, `phoneNumberId`) e o índice
`whatsappNumeros/{phoneNumberId}` → `tenantId`, que é como o webhook sabe de quem é a
mensagem. `--desfazer` no lugar do `phoneNumberId` volta a barbearia para o daemon.

> **Desconecte o daemon dessa barbearia.** Com os dois ligados no mesmo número (caso da
> Coexistência), a mesma mensagem entra duas vezes, com ids diferentes.

## Testar com o número de teste da Meta

1. Faça os passos 1 a 4 com o Phone Number ID do número de teste numa barbearia de teste.
2. Do seu celular (cadastrado como destinatário na Meta), mande uma mensagem para o
   número de teste.
3. Ela aparece na tela de WhatsApp do Cartel, e a IA responde se estiver ligada.
4. Responda pela tela: a mensagem chega no celular.

Número de teste só fala com os até 5 números cadastrados no painel da Meta (erro 131030
para qualquer outro).

## Próximas etapas

- **Templates** para confirmação e cobrança (fora das 24 h).
- **Download de mídia** recebida (`GET /{waMediaId}` com o token → Storage).
- **Embedded Signup + Coexistência**: o barbeiro conecta o próprio número pela tela de
  Configurações, sem script. Exige o app como **Provedor de Tecnologia** e a empresa
  verificada.
