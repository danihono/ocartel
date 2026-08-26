# Cobrança automática das mensalidades

Antes, o ciclo era todo na mão: a dona clicava em *Gerar mensalidades do mês*, cobrava cada
assinante pelo WhatsApp de memória, e clicava em *Registrar pagamento* quando o dinheiro
entrava. Agora o sistema faz sozinho — inclusive **emitir boleto no CPF de quem não pagou** e
**dar baixa quando o boleto é pago**.

## A regra

- Todo dia, na hora configurada, o ciclo **gera as mensalidades que faltam no mês**, uma por
  assinante, com vencimento no dia **do cliente** (`Cliente.diaVencimento`, não do plano).
- **3 dias antes** (configurável) o cliente recebe um aviso no WhatsApp. É lembrete, não
  cobrança: quem já pagou por fora é orientado a ignorar.
- **No dia do vencimento**, se ainda não pagou, sai um **boleto no CPF cadastrado** e o link
  vai pelo WhatsApp. O boleto vence alguns dias depois, para dar tempo de pagar.
- **Quando o boleto é pago**, o Asaas avisa por webhook e a cobrança fica `pago` sozinha, com
  `source: "gateway"` e `confirmedBy: "Asaas (automático)"`.
- Assinante **sem CPF válido** é pulado — e aparece no bloco *Renovações* do dashboard, porque
  é o único caso que o sistema não resolve sozinho.
- Rodar o ciclo duas vezes **não** cobra ninguém duas vezes. Três travas independentes:
  mensalidade já existente naquele mês, `alertaEnviadoEm` e `boleto`.

A barbearia acompanha pelo bloco **Renovações** no `/dashboard` (em atraso, vencem hoje,
vencem em 7 dias, com boleto emitido) e pela lista em `/pagamentos`.

## Como funciona

```
timer externo (de hora em hora)
        │  POST /api/cobrancas/ciclo   (header x-cobrancas-secret)
        ▼
   a rota decide QUAIS barbearias rodam nesta hora
        │  (config.cobranca.hora, no fuso de Brasília)
        ▼
   1. mensalidades que faltam no mês      ──► tenants/{id}/transacoes
   2. vence em N dias e não pagou         ──► lib/canal   ──► WhatsApp do cliente
   3. venceu e não pagou                  ──► lib/cobrador ──► boleto no CPF ──► WhatsApp
                                                                     │
        POST /api/cobrancas/webhook/asaas ◄──────────────────────────┘  (quando pagam)
        ▼
   cobrança vira "pago" sozinha
```

O agendador é externo e **burro de propósito**, igual ao das confirmações: ele bate na rota
toda hora e a rota é que sabe quem dispara. Uma barbearia nova não exige mexer em cron nenhum.

As decisões (quem cobrar, quando avisar, quando emitir) vivem em `lib/cobranca-ciclo.ts`, sem
HTTP e sem Firestore — é a parte em que errar custa dinheiro, então ela é testável sozinha
(`tests/cobranca-ciclo.test.ts`). A tela de Pagamentos chama **a mesma função** que a rota:
duas cópias da regra divergiriam, e a divergência apareceria como cobrança duplicada.

`lib/cobrador/` é a porta trocável do gateway, como `lib/canal/` é a do WhatsApp. Nada fora
dessa pasta sabe que existe um Asaas do outro lado.

## Ligar numa barbearia

### 1. Conta do Asaas

A conta é **da barbearia** — o dinheiro do boleto cai na conta dela, não na do O Cartel. Por
isso a chave é por tenant, e não uma variável de ambiente global.

*Configurações* → **Conta do Asaas** → colar a chave de API e escolher o ambiente.
Comece em **sandbox**: em produção o boleto é real e vai para o CPF de gente real.

A chave é gravada em `tenants/{tenantId}/private/asaas`, junto do vínculo do WhatsApp:

```
tenants/{tenantId}/private/asaas
  { apiKey: "$aact_...", ambiente: "sandbox" | "producao", webhookToken: "<gerado ao salvar>" }
```

Nunca mova isso para `config/`, que é `allow read: if true` (alimenta a vitrine pública de
`/book/[slug]`). Sem o doc, a barbearia é pulada com `sem gateway configurado` — não quebra as
outras.

### 2. Webhook no painel do Asaas

No Asaas: *Integrações → Webhooks*, apontando para

```
https://<app>/api/cobrancas/webhook/asaas
```

com o **token de autenticação** igual ao `webhookToken` que a tela gerou ao salvar a chave. A
rota é pública (o Asaas precisa alcançá-la) e é esse token que a protege: sem ele, quem
descobrisse a URL marcaria qualquer cobrança como paga. Token errado → **401**.

Eventos: `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`. Os outros são ignorados com 200.

### 3. WhatsApp

O mesmo vínculo das confirmações (`tenants/{tenantId}/private/whatsapp`), sem nada a mais. Sem
ele os avisos não saem — mas **os boletos continuam sendo emitidos** e aparecem no painel. Uma
coisa não derruba a outra.

### 4. Segredo da rota

A rota devolve **401** sem o header e **500** se a variável não existir (falha visível é
melhor que disparo aberto).

O site vai ao ar pelo **Firebase Hosting com `frameworksBackend`** (ver README, *Publicar*) —
o SSR roda numa Cloud Function, então o segredo mora no Secret Manager:

```bash
firebase functions:secrets:set COBRANCAS_SECRET
```

e é declarado no `firebase.json` para a função enxergá-lo:

```json
"frameworksBackend": {
  "region": "us-central1",
  "secrets": ["COBRANCAS_SECRET"]
}
```

**Crie o segredo ANTES de declarar a linha**: um `secrets` apontando para um segredo que não
existe faz o `npm run deploy` falhar.

Não confunda com `firebase apphosting:secrets:set` — o `apphosting.yaml` está no repositório,
mas é config de outro produto (App Hosting) e o `firebase deploy` ignora, variáveis inclusive.

### 5. Agendador

Na mesma máquina que já bate nas confirmações, de hora em hora:

```bash
curl -fsS -X POST https://<app>/api/cobrancas/ciclo \
  -H "x-cobrancas-secret: $COBRANCAS_SECRET"
```

### 6. Ligar no painel

*Configurações* → **Cobrança automática das mensalidades** → marcar, escolher a hora e quantos
dias antes avisar. O boleto é uma segunda chave, dentro dessa.

Vem **desligado** por padrão. Aqui isso pesa mais que nas confirmações: o que sai daqui é
boleto no CPF de cliente, e nenhuma barbearia existente pode começar a emitir sozinha sem
alguém ter pedido.

## Fuso

A comparação da hora é feita em `America/Sao_Paulo`, não no fuso do servidor — que costuma ser
UTC. É o erro mais provável deste fluxo. Por isso `agoraEmBrasilia` e `deveDispararAgora` são
**importados de `lib/confirmacao-disparo.ts`**, e não reescritos: às 02:00 UTC ainda é o dia
anterior às 23:00 em São Paulo, e gerar o ciclo do mês errado na virada passaria despercebido.

## Retentativa

Vale a mesma janela de 2 horas das confirmações. E o boleto usa `dueDate <= hoje`, não
`== hoje`: se o disparo ficou fora do ar no dia exato, quem venceu ontem ainda é cobrado.
Reprocessar é seguro porque cada etapa tem sua trava gravada.

Toda escrita de trava acontece **depois** da operação confirmada. Marcar antes faria uma falha
de rede virar cliente que nunca é avisado — silenciosamente.

## Diagnóstico

A rota devolve o que fez, por barbearia:

```json
{ "dataISO": "2026-08-13", "hora": 9,
  "tenants": [{ "tenantId": "abc", "mensalidadesGeradas": 12, "alertas": 3,
                "boletos": 2, "falhas": 0, "semCpf": 1, "semPlano": 0 }] }
```

| Sintoma | Causa provável |
|---|---|
| `401` no ciclo | Segredo ausente ou errado no header |
| `500` com "COBRANCAS_SECRET não configurado" | Variável faltando no App Hosting |
| `tenants: []` | Nenhuma barbearia com `cobranca.ativa` nesta hora — confira o fuso |
| `mensalidadesGeradas: 0` sempre | Já foram geradas neste mês (é o esperado) |
| `semPlano > 0` | Cliente marcado como assinante com plano que não existe mais em `/planos` |
| `semCpf > 0` | Cadastro sem CPF válido — o boleto é impossível até completarem a ficha |
| `boletos: 0` com atraso na tela | `emitirBoleto` desligado, ou sem chave do Asaas |
| `motivo: "CobradorNaoConfigurado…"` | Falta `tenants/{id}/private/asaas` |
| Alertas não saem, boletos sim | Falta `tenants/{id}/private/whatsapp` (é o esperado) |
| `401` no webhook | `webhookToken` do painel do Asaas diferente do gravado |
| Boleto pago e cobrança ainda pendente | Webhook não cadastrado, ou sem `externalReference` (cobrança criada à mão no painel do Asaas) |
| Cliente duplicado no painel do Asaas | `Cliente.asaasId` não está sendo gravado — investigar permissão de escrita |
