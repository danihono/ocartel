# A tela de WhatsApp

Ver as conversas da barbearia, buscar um cliente pelo nome e mandar mensagem — no
sistema, sem abrir o WhatsApp no celular.

## O que a tela mostra

O daemon (Baileys, self-hosted) espelha **tudo que entra e sai** em
`users/barbearia-{tenantId}/contacts/**`. A tela lê esse espelho ao vivo e cruza com o
cadastro (`tenants/{tenantId}/clientes`), que já está no store.

Da esquerda para a direita:

- **Conversas** — quem já falou com a barbearia, mais recente primeiro. Quem é cliente
  aparece com o nome do cadastro; quem não é aparece com o número e o aviso
  *não cadastrado*.
- **+ Adicionar cliente** — o painel com **só os clientes que ainda não têm conversa**,
  e o contador de quantos são. O WhatsApp pareado só traz quem escreveu para a barbearia;
  a maior parte do cadastro nunca escreveu, e é daqui que essas pessoas são puxadas.
- **A conversa** — histórico com foto, vídeo, áudio e documento, e o campo de envio.

## Uma pessoa por vez, de propósito

Não existe "adicionar todos", seleção múltipla, importar nem disparo em massa nesta tela.
O documento de contato só nasce quando alguém clica no nome de alguém — um clique, um
cliente, um documento.

Isso não é timidez de interface: é a trava que impede um número **de teste** de virar uma
lista de transmissão para a base inteira por um clique errado. Se um dia fizer sentido
disparar para muita gente, isso precisa ser uma decisão nova, com nome e tela própria.

## Ler é direto; escrever é só pelo servidor

O espelho fica **fora** de `tenants/**`, então as regras negavam por omissão. Foi liberado
em `firestore.rules`, **só leitura**:

```
function podeVerEspelho(uid) {
  return isSuper() || (signedIn() && uid == 'barbearia-' + uDoc().tenantId);
}
match /users/{uid}/contacts/{contactId} { allow read: if podeVerEspelho(uid); ... }
```

Leitura direta porque a graça da tela é a resposta do cliente **aparecer sozinha** —
polling só mostraria no tique seguinte. Escrita nenhuma: enfileirar comando para o daemon
e mexer no contato exigem o Admin SDK, e isso mora nas server actions
(`app/(admin)/whatsapp/actions.ts`), atrás da mesma verificação de dono do pareamento.

> **Sem publicar as regras a tela abre vazia.** Depois de subir esta versão:
> `firebase deploy --only firestore:indexes,firestore:rules`
>
> Os índices vão junto porque o daemon precisa de um deles: ele é o código do CRM Titãs e
> **sempre** liga o worker de mensagens agendadas, mesmo o Cartel não usando essa função.
> Sem o índice de `scheduledMessages`, ele falha de 5 em 5 segundos com
> `FAILED_PRECONDITION` — não quebra o espelho nem o envio, mas enche o log e esconde
> qualquer erro de verdade.

## O vínculo com o cadastro

Cada conversa guarda `clienteId`, e cada cliente guarda `waContactId`
(`lib/canal/vinculo.ts`). O vínculo é **gravado**, não deduzido a cada exibição — o
telefone continua servindo de plano B para cadastro antigo.

Por que importa: os ids do sistema saem do telefone (`wa_<55…>` para a conversa,
`tel-<11…>` para o cliente), e o sistema tinha duas normalizações que não conversavam. Com
o vínculo escrito, a mesma pessoa não vira dois cadastros quando o agendamento chega pelo
WhatsApp. Ver `lib/telefone.ts`.

## Detalhes que já custaram caro

- **A lista de conversas não usa `orderBy`.** O Firestore omite do resultado quem não tem
  o campo ordenado, e `lastMessageAt` só nasce na primeira mensagem — ordenar no servidor
  sumiria justamente com a conversa recém-criada. A ordem é feita no cliente.
- **O contato precisa nascer com nome.** O daemon só preenche nome de contato que ainda
  não tem `createdAt`, e o nosso já nasce com um. Sem passar o nome do cadastro, a conversa
  ficaria com o número para sempre.
- **O id do contato é o mesmo que o daemon geraria** (`wa_<digits>`). É isso que faz a
  resposta do cliente cair na conversa existente em vez de abrir uma segunda.
- **Mídia não precisa de regra no Storage**: a URL que o daemon grava já vem com token de
  download.

## Quando algo não aparece

| Sintoma | Onde olhar |
|---|---|
| Tela vazia, sem erro visível | as regras foram publicadas? (`firebase deploy --only firestore:rules`) |
| "Serviço de WhatsApp fora do ar" | o daemon na VPS caiu — `whatsappDaemon/heartbeat` parou de bater |
| "WhatsApp não conectado" | parear em **Configurações** (o QR mora lá) |
| Mensagem presa em "enviando…" | o comando ficou `pending` em `users/barbearia-{t}/waCommands` — daemon fora do ar ou sem sessão |
| Log do daemon repetindo `FAILED_PRECONDITION` | falta o índice de `scheduledMessages` — publique os índices |
| Conversa duplicada para a mesma pessoa | o casamento por `whatsappDigits`/`waJid` falhou; conferir os dois docs em `contacts` |
