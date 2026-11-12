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
| Mídia recebida | baixada | baixada da Meta pelo webhook e guardada no Storage (`lib/whatsapp/midia.ts`); o que não couber no tempo da entrega é baixado ao abrir a conversa |

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

## Mídia (fotos, áudios, vídeos, documentos)

A Meta manda só o id da mídia e guarda o arquivo por **30 dias**. O webhook baixa logo
depois de gravar a mensagem (até 20 s por entrega), guarda em
`users/barbearia-{t}/contacts/{contactId}/wa/` no Storage e grava `mediaUrl` com link de
token — como o daemon fazia, por isso as regras do Storage continuam negando tudo. O que
ficar para trás (pedaço grande do histórico, falha passageira) é baixado quando a conversa
é aberta (`acaoBaixarMidias`, de 10 em 10).

Mídia vencida, ou acima de 25 MB, vira "mídia não carregada" e fica no celular. No histórico
da Coexistência, a Meta só entrega o arquivo das mídias dos **últimos 14 dias**; as mais
antigas aparecem como "📎 Mídia — veja no celular". **Foto de perfil não existe na API
oficial**: as conversas ficam com as iniciais.

## Conectar o número da barbearia (Embedded Signup + Coexistência)

Em **Configurações → Número do WhatsApp → API oficial do WhatsApp**, o botão abre a janela
da Meta (Embedded Signup **v5** — v2 e v3 foram desligadas em 15/10/2026). No v5 a
Coexistência vem ligada: se o número já é usado no **app WhatsApp Business**, a janela
oferece mantê-lo lá, e ele passa a funcionar no app **e** no sistema.

O que acontece depois (`lib/whatsapp/conectar.ts`, servidor com servidor):

1. troca o código da janela (vale **30 s**) pelo token da barbearia;
2. confere que o número não é de outra barbearia;
3. inscreve o app na conta (`POST /{waba}/subscribed_apps`) — sem isso o webhook não
   recebe nada dela (foi o que travou o número de teste);
4. registra o número na API **só se não for Coexistência** (com PIN de 6 dígitos, guardado);
5. grava `private/whatsapp`, o token em `private/whatsapp/credenciais/cloud` e o índice
   `whatsappNumeros/{phoneNumberId}`, soltando o número antigo;
6. na Coexistência, pede a **agenda** e o **histórico** do celular (`/smb_app_data`). A Meta
   só aceita isso **uma vez** e **até 24 h** depois da conexão — por isso é na hora.

O histórico (até 180 dias) chega em pedaços pelo webhook (`history`) e é gravado em lote
com `importedFromHistory: true` — não conta como não lida e não acorda a IA. A agenda
(`smb_app_state_sync`) dá nome às conversas que só tinham número; o cadastro vence. O que
a barbearia escreve pelo celular volta como eco (`smb_message_echoes`).

**Limites da Coexistência** (Meta): grupos não sincronizam; mensagens temporárias,
visualização única, localização ao vivo e listas de transmissão são desligadas no app;
20 mensagens por segundo. Quem usa nome de usuário no WhatsApp pode chegar sem telefone —
essas mensagens ainda ficam de fora (o webhook registra o formato).

### O que configurar na Meta (uma vez)

1. **Login do Facebook para Empresas → Configurações → Client OAuth settings:** ligar
   *Client OAuth login*, *Web OAuth login*, *Enforce HTTPS*, *Embedded Browser OAuth
   Login*, *Strict Mode* e *Login with the JavaScript SDK*; em **Allowed domains** e
   **Valid OAuth redirect URIs**, `https://ocartel-497f8.web.app/`.
2. **Login do Facebook para Empresas → Configurations → Create from template →**
   *WhatsApp Embedded Signup Configuration With 60 Expiration Token*. O **Configuration
   ID** vai em `NEXT_PUBLIC_META_ES_CONFIG_ID` (`.env.production`, não é segredo).
3. **WhatsApp → Configuração → Campos do webhook:** assinar também `account_update`,
   `history`, `smb_app_state_sync` e `smb_message_echoes`.
4. **Provedor de Tecnologia** — exigido pela Meta para a Coexistência, **inclusive para
   testar**: sem ele a janela termina sem os ids e com um código recusado (subcódigo
   36008). Passo a passo em `docs/meta-provedor-de-tecnologia.md`.
5. No celular da barbearia: **WhatsApp Business** 2.24.17 ou mais novo (o WhatsApp comum
   não serve), e uma forma de pagamento no **WhatsApp Manager**.

## Próximas etapas

- **Templates** para confirmação e cobrança (fora das 24 h).
- **Enviar** foto, áudio e documento pelo sistema (hoje o envio é só texto).
