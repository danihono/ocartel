# Cobrança automática das mensalidades

Antes, o ciclo era todo na mão: a dona clicava em *Gerar mensalidades do mês*, cobrava cada
assinante pelo WhatsApp de memória, e clicava em *Registrar pagamento* quando o dinheiro
entrava. Agora o sistema faz sozinho — inclusive **debitar o cartão que o cliente
cadastrou**, **emitir boleto no CPF de quem não pagou** e **dar baixa quando o pagamento
cai**.

Quem cadastrou cartão não vê boleto nenhum: no dia do vencimento a mensalidade é debitada
e ele recebe um recibo no WhatsApp. Ver a seção **Cartão** mais abaixo.

## A regra

- Todo dia, na hora configurada, o ciclo **gera as mensalidades que faltam no mês**, uma por
  assinante, com vencimento no dia **do cliente** (`Cliente.diaVencimento`, não do plano).
- **3 dias antes** (configurável) o cliente recebe um aviso no WhatsApp. É lembrete, não
  cobrança: quem já pagou por fora é orientado a ignorar.
- **No dia do vencimento**, quem tem **cartão salvo** é debitado no cartão (se a chave
  *Cobrar no cartão* estiver ligada) e recebe um recibo.
- **No dia do vencimento**, quem **não** tem cartão e ainda não pagou recebe um **boleto no
  CPF cadastrado**, com o link pelo WhatsApp. O boleto vence alguns dias depois, para dar
  tempo de pagar.
- **Cartão recusado NÃO gera boleto automático.** A mensalidade fica pendente e aparece
  destacada no bloco *Renovações* do dashboard — a dona decide caso a caso, e emite o
  boleto na hora pelo botão em `/pagamentos` se quiser.
- **Quando o pagamento cai** (boleto, cartão ou Pix na página do Asaas), o Asaas avisa por
  webhook e a cobrança fica `pago` sozinha, com `source: "gateway"`,
  `confirmedBy: "Asaas (automático)"` e a `forma` do meio que foi usado de fato.
- Assinante **sem CPF válido** é pulado — e aparece no bloco *Renovações* do dashboard, porque
  é o único caso que o sistema não resolve sozinho.
- Rodar o ciclo duas vezes **não** cobra ninguém duas vezes. Quatro travas independentes:
  mensalidade já existente naquele mês, `alertaEnviadoEm`, `boleto` e `cartaoCobranca`.

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
   2. vence em N dias e não pagou         ──► lib/canal   ──► WhatsApp (+ link do cartão)
   3. venceu, não pagou, TEM cartão       ──► lib/cobrador ──► débito no cartão ──► WhatsApp
   4. venceu, não pagou, SEM cartão       ──► lib/cobrador ──► boleto no CPF ──► WhatsApp
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

## Cartão

### O cartão nunca passa pelo O Cartel

O cliente abre `/cartao/[codigo]`, vê o plano e o valor, marca a autorização — e o passo
de digitar o cartão acontece na **página hospedada do Asaas**. A gente guarda só o
`creditCardToken`, que é um apelido inútil fora daquele cliente.

Isso não é preferência de arquitetura: o Asaas **não oferece tokenização pelo navegador**.
Um formulário nosso faria o número do cartão trafegar pelo nosso servidor, e aí o produto
precisaria de certificação **PCI-DSS SAQ-D** (varredura trimestral por scanner aprovado,
pentest anual, política formal de segurança). Do jeito que está, o questionário aplicável
é o **SAQ-A**. `tests/cobrador-asaas.test.ts` tem um teste que quebra se alguém mandar
dado de cartão naquela chamada — é o guarda-corpo dessa decisão.

### Onde o token mora

```
tenants/{tenantId}/private/cartoes/clientes/{clienteId}   ← o token. Só o servidor.
  { provedor, token, clienteExterno, bandeira, ultimosDigitos, cadastradoEm,
    cobrancaId, ipCadastro, autorizacao: { em, texto, versao, userAgent }, linkToken }

tenants/{tenantId}/cartoes/{clienteId}                     ← a vitrine. O painel lê.
  { provedor, bandeira, ultimosDigitos, cadastradoEm, ativo,
    falhasSeguidas, ultimaFalhaEm, ultimoErro, removidoEm, motivoRemocao }
```

A regra do Firestore é `match /private/{doc}` — **um segmento só**. Então
`private/cartoes/clientes/{id}` não casa com regra nenhuma e cai no *deny* padrão: nem a
dona da barbearia lê aquele doc pelo navegador. É o nível certo para um instrumento de
débito.

O token **não** foi para dentro de `Cliente`, apesar do precedente do `asaasId`: o
navegador escreve o doc de cliente inteiro (a tela faz round-trip do objeto do store), e
um campo cujo dono é o servidor ali dentro seria apagado na primeira edição de ficha feita
com store desatualizado. `asaasId` sobrevive a isso porque se reconstitui numa chamada; um
token de cartão apagado é o cliente saindo da recorrência sem ninguém perceber.

### O consentimento

A página do Asaas cobra **aquela fatura** — ela não pergunta nada sobre as próximas. Quem
recorre é o O Cartel, então o aceite é colhido na nossa tela, com o texto de
`textoAutorizacao` (em `lib/cartao-link.ts`, versionado), e gravado com data, IP e
user-agent **antes** do redirect. `salvarCartao` se recusa a salvar cartão sem esse
registro no doc.

Isso é a defesa num chargeback. E é por isso que o link de remoção vai em **toda** mensagem
de cartão: a saída fácil é a condição para debitar a conta de alguém todo mês ser
defensável.

### O timeout — o caso perigoso

O Asaas não tem header de idempotência. Um `POST /payments` que dá timeout **pode ter
debitado o cartão**, e a rodada seguinte não tem como saber pela resposta.

Por isso, e só na etapa do cartão, a trava é gravada em **duas fases**:

1. **antes** da chamada: `cartaoCobranca = { situacao: "enviando", tentadoEm }`
2. **depois**: `situacao: "aprovada" | "recusada"`, com `cobrancaId` e `resolvidoEm`

Um crash no meio deixa a cobrança presa em `"enviando"` — o estado **seguro**: nem cobra de
novo, nem emite boleto. Quem desatola é a **conciliação** na abertura da rodada seguinte,
que busca `GET /payments?externalReference=` e pergunta ao gateway o que aconteceu de fato
(`precisaReconciliarCartao` e `situacaoReconciliada`, em `lib/cobranca-ciclo.ts`).

Chutar uma situação ali é o que não se pode fazer: "aprovada" errado deixa a mensalidade
aberta para sempre, "recusada" errado pode virar uma segunda cobrança.

### Recusa, e quando o cartão é aposentado

Recusa do emissor **não é erro** — `cobrarNoCartao` devolve `situacao: "recusada"` e só
lança quando o *gateway* falha (401, 5xx, timeout). A distinção importa: se um 500 virasse
recusa, um incidente do Asaas aposentaria o cartão da base inteira em três rodadas.

Depois de `MAX_RECUSAS_CARTAO` (3) recusas seguidas o cartão é **aposentado**: sai de
circulação, o cliente recebe o link para cadastrar outro, e aquelas mensalidades voltam ao
caminho do boleto. Uma cobrança aprovada zera o contador — duas recusas espalhadas ao longo
de um ano não podem somar com uma terceira e matar um cartão que funciona.

### Estorno e chargeback

`PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` e `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`
**revertem a baixa**: a cobrança volta a `pendente`, `paidAt` e `amountReceived` são
apagados (não gravados como null — o KPI de "recebido este mês" contaria dinheiro
devolvido), e fica `estornadoEm`/`estornoMotivo`. Em chargeback o cartão é removido: seguir
debitando um cartão contestado só multiplica a contestação, e contestação em volume derruba
a conta Asaas **da barbearia**.

### Ligar

*Configurações* → **Cobrança automática das mensalidades** → **Cobrar no cartão cadastrado**.
Vem desligado, e depende de duas coisas fora do código:

1. **Tokenização liberada** na conta do Asaas (peça ao gerente de contas). Sem isso o cartão
   é cobrado uma vez e **não fica salvo** — o ciclo registra
   `sem token devolvido` nos avisos, em vez de degradar em silêncio.
2. **Eventos novos no webhook** do Asaas, além dos dois que já existiam:
   `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`,
   `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`,
   `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`.

E lembre à barbearia que **a taxa de cartão é maior que a de boleto** — quem paga é ela.

### Como o cliente cadastra

- Sozinho: o aviso de renovação (D-N) já leva o link, para quem ainda não tem cartão.
- A pedido: *Clientes* → ficha do cliente → **Pedir cartão no WhatsApp**, que abre o
  `wa.me` com a mensagem pronta (mesmo clique-para-conversar da confirmação).
- O cadastro é sempre amarrado a uma **mensalidade em aberto**: a página do Asaas cobra a
  fatura, não existe tokenizar com R$ 0,00. Sem mensalidade aberta a tela diz isso.
- Para sair: botão na própria página (`motivoRemocao: "cliente"`), ou na ficha do cliente
  (`"barbearia"`).

## Ligar numa barbearia

### 1. Conta do Asaas

A conta é **da barbearia** — o dinheiro do boleto e do cartão cai na conta dela, não na do
O Cartel. Por isso a chave é por tenant, e não uma variável de ambiente global.

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

Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED` e — se for usar cartão — os seis da seção
**Cartão** acima. Os outros são ignorados com 200.

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
dias antes avisar. O cartão e o boleto são chaves separadas, dentro dessa — na ordem em que
rodam.

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
| `cartoes: 0` sempre, com cartão na ficha | `cobrarNoCartao` desligado, ou o cartão foi aposentado por recusas |
| Cartão cobrado uma vez e nunca mais | Tokenização não liberada na conta do Asaas — ver o aviso `sem token devolvido` |
| `cartoesReconciliados > 0` toda rodada | Cobrança travando no gateway: conferir latência/timeout, não é normal |
| Cobrança parada em "Cobrança no cartão em andamento" | Aguarda a janela de conciliação (20 min); se persistir, ver os `avisos` |
| `cartão sem IP de cadastro` nos avisos | Cartão salvo antes do registro de IP — o cliente precisa recadastrar |
| Recusa no cartão e nenhum boleto | É o esperado: quem tem cartão não recebe boleto sozinho. Botão em `/pagamentos` |
