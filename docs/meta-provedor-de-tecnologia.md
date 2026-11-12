# Virar Provedor de Tecnologia na Meta

Sem isso, a Meta não deixa conectar o número que a barbearia já usa no **WhatsApp
Business** (Coexistência): a janela de conexão abre, mas termina sem os ids e com um código
que ela mesma recusa (`Error validating verification code`, subcódigo 36008). A página
oficial é clara — número do app WhatsApp Business na API só apagando a conta **ou por um
parceiro** (Provedor de Tecnologia / Parceiro de Soluções).

O código do Cartel já está pronto para depois (Configurações → **Trocar número**). Este
documento é o que falta do lado da Meta.

## 1. Verificação da empresa

business.facebook.com → **Configurações** → **Central de segurança** → **Iniciar
verificação**, no portfólio do app (**Daniel Honorato**).

- **Nome legal** idêntico ao cartão CNPJ (com LTDA/ME/etc.) — divergência é a causa nº 1
  de recusa.
- Endereço e telefone iguais aos da Receita.
- Site: `https://ocartel-497f8.web.app` (tem a política de privacidade em `/privacidade`).
- Documento: cartão CNPJ (e contrato social, se pedirem).
- Confirmação: e-mail no domínio da empresa, se houver; senão, telefone/SMS.

Leva de alguns dias a duas semanas. A análise do app (passo 3) só abre depois.

## 2. Conferir o app

developers.facebook.com → **The Barber** → **Configurações do app → Básico**: ícone,
categoria e **URL da Política de Privacidade** (`https://ocartel-497f8.web.app/privacidade`)
— já preenchidos. Vale trocar o **Nome de exibição** de "The Barber" para **O Cartel**: é o
nome que aparece na janela de conexão.

## 3. Os dois vídeos

A Meta pede um vídeo de **envio de mensagem** e um de **criação de modelo**. Grave a tela
com **Win + Alt + R** (Xbox Game Bar) ou o app de captura do Windows. 1 a 2 minutos cada,
sem som. Mostre a tela inteira, devagar.

### Vídeo 1 — enviar uma mensagem e ela chegar no WhatsApp

1. Abra o painel do app → **Casos de uso → WhatsApp → Personalizar → Etapa 1 /
   Configuração da API**.
2. Mostre o número de teste e o seu celular em **Destinatário**.
3. Clique em **Enviar mensagem** (modelo `hello_world`).
4. Mostre a mensagem chegando — no celular apontado para a câmera, ou no **WhatsApp Web**
   aberto ao lado.

(A Meta aceita expressamente essa gravação do painel em vez do próprio sistema.)

### Vídeo 2 — criar um modelo de mensagem

Aproveite para criar o modelo **de verdade** da confirmação de horário:

1. **business.facebook.com/wa/manage** → **Modelos de mensagem** → **Criar modelo**.
2. Categoria **Utilidade**. Nome: `confirmacao_horario`. Idioma: **Português (BR)**.
3. **Corpo** (as variáveis entram pelo botão "Adicionar variável"):

   ```
   Oi, {{1}}! Aqui é da {{2}}.

   Seu horário: {{3}}
   {{4}}

   Confirma pra gente? É só tocar no botão abaixo.
   ```

   Exemplos (a Meta exige): `{{1}}` Daniel · `{{2}}` O Cartel ·
   `{{3}}` sexta, 14 de novembro às 15:00 · `{{4}}` Corte · com Raimundo.
4. **Botões → Visitar site → URL dinâmica**: texto `Confirmar presença`, URL
   `https://ocartel-497f8.web.app/c/{{1}}`, exemplo `abc123`.
5. **Enviar**. Mostre o modelo na lista, em análise ou aprovado.

## 4. Pedir a análise

Painel do app → **Casos de uso → WhatsApp → Personalizar → Torne-se um Provedor de
Tecnologia → Iniciar análise do app**. Peça **acesso avançado** a
`whatsapp_business_messaging` e `whatsapp_business_management`, envie os vídeos e cole os
textos abaixo (em inglês, que é como a equipe da Meta lê).

### `whatsapp_business_messaging`

```
O Cartel is a management system for barbershops in Brazil (appointments, clients,
memberships and billing). We use whatsapp_business_messaging to let each barbershop
send and receive WhatsApp messages with its own clients from inside our dashboard:
replying to clients who write to the barbershop, sending appointment confirmations
(utility templates) on the morning of the appointment, and payment reminders for
monthly memberships. Messages are sent only on behalf of the barbershop that connected
its own number, only to its own clients, and only by the barbershop staff or by an
assistant the barbershop turns on in its settings. No marketing or bulk messaging.
```

### `whatsapp_business_management`

```
We use whatsapp_business_management to onboard each barbershop through Embedded Signup
(including WhatsApp Business app coexistence): after the barbershop finishes the flow we
subscribe our app to its WhatsApp Business Account webhooks, read the business phone
number details to show the connection status in our settings page, request the contacts
and chat-history synchronization so the barbershop sees its existing conversations, and
manage the message templates used for appointment confirmations. We only access the
accounts that the barbershop explicitly shared with us in the Embedded Signup flow.
```

### Instruções para quem for testar

```
1. Watch video 1: a message is sent from our WhatsApp Business test number and is
   received in the WhatsApp client.
2. Watch video 2: a utility template (appointment confirmation) is created in WhatsApp
   Manager.
3. Webhook endpoint: https://ocartel-497f8.web.app/api/whatsapp/webhook (signature
   validated with the app secret).
4. Privacy policy: https://ocartel-497f8.web.app/privacidade
```

## 5. Depois de aprovado

1. No celular da barbearia (WhatsApp Business): **Configurações → Conta → Plataforma
   comercial**. Se aparecer conectado por causa das tentativas anteriores, desconecte.
2. Cartel → **Configurações → Número do WhatsApp → Trocar número** e siga a janela — ver
   `docs/whatsapp-api-oficial.md`.
