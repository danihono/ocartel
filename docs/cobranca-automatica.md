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
Cloud Function `cicloCobranca` (de hora em hora, minuto 5)
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

O agendador é **burro de propósito**: a função `cicloCobranca` (em `functions/src/index.ts`)
só bate na rota toda hora, e a rota é que sabe quem dispara. Uma barbearia nova, ou uma que
muda a hora do ciclo, não exige redeploy nem mexer em cron nenhum.

Ele mora no Firebase, e não num timer em máquina externa, porque o site não tem relógio — só
roda quando alguém acessa — e um timer numa máquina que pode desligar faria a cobrança parar
calada.

As decisões (quem cobrar, quando avisar, quando emitir) vivem em `lib/cobranca-ciclo.ts`, sem
HTTP e sem Firestore — é a parte em que errar custa dinheiro, então ela é testável sozinha
(`tests/cobranca-ciclo.test.ts`). A tela de Pagamentos chama **a mesma função** que a rota:
duas cópias da regra divergiriam, e a divergência apareceria como cobrança duplicada.

`lib/cobrador/` é a porta trocável do gateway, como `lib/canal/` é a do WhatsApp. Nada fora
dessa pasta sabe que existe um Asaas do outro lado.

## Cartão

### Dois caminhos, e a diferença entre eles é regulatória

| | quem digita | por onde passa o cartão | escopo PCI |
|---|---|---|---|
| **Página** `/cartao/[codigo]` | o próprio cliente | só o Asaas | **SAQ-A** |
| **Balcão** (modal na ficha do cliente) | a atendente | **o nosso servidor** | **SAQ-D** |

Os dois existem por decisão de produto, e os dois continuam ligados: o balcão é o caminho
do dia a dia (cliente na frente, atendente digitando), e a página é para quem não aparece
na barbearia — e é também por ela que o cliente **remove** o cartão sozinho.

**O caminho da página.** O cliente abre `/cartao/[codigo]`, vê plano e valor, marca a
autorização — e o passo de digitar o cartão acontece na página hospedada do Asaas. A gente
guarda só o `creditCardToken`. `tests/cobrador-asaas.test.ts` tem um teste que quebra se
alguém mandar dado de cartão naquela chamada.

**O caminho do balcão.** `tokenizarCartao` (`POST /creditCard/tokenizeCreditCard`) recebe
o número do cartão, troca por token e não cobra nada. É o **único** ponto do sistema que
toca em número de cartão, e é ele que coloca o O Cartel dentro do **PCI-DSS SAQ-D**:
varredura trimestral por scanner aprovado (ASV), pentest anual, política formal de
segurança. Enquanto essa função existir, essa obrigação existe.

Regras que valem só nele e não podem ser relaxadas:

- nada do cartão entra em log, em mensagem de erro, no retorno da server action, em
  `localStorage`, na URL ou no store — a resposta carrega bandeira e quatro dígitos;
- `AsaasErro` guarda o corpo da RESPOSTA, nunca o do request. Há um teste que quebra se
  alguém acrescentar o corpo enviado à exceção "para facilitar o debug";
- o modal limpa os campos ao abrir e ao fechar, e usa `autoComplete="off"` em tudo —
  cartão de cliente salvo no navegador da barbearia é o mesmo dado vazando por outra porta;
- `validarCamposCartao` (`lib/cartao-campos.ts`, com Luhn) roda **antes** do envio: erro
  de digitação pego no navegador não faz o número sair de lá, e a mensagem é melhor que o
  400 genérico do gateway.

O balcão **não cobra**. Cadastrar cartão e cobrar mensalidade são coisas diferentes, e
juntá-las faria um cadastro virar uma cobrança que ninguém pediu. A mensalidade em aberto
é debitada pelo ciclo, na hora seguinte.

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
recorre é o O Cartel, então o aceite é sempre colhido por nós, gravado com data, IP e
user-agent **antes** da chamada ao gateway. `salvarCartao` se recusa a salvar cartão sem
esse registro no doc, e esse é o único caminho para um token entrar no banco.

São **dois textos diferentes**, em `lib/cartao-link.ts`, ambos versionados:

- `textoAutorizacao` — o cliente, em primeira pessoa: *"Autorizo a {barbearia} a cobrar
  minha mensalidade…"*. Gravado com `origem: "cliente"`.
- `textoAutorizacaoBalcao` — a atendente, em nome dela: *"Cadastro feito no balcão por
  {nome}. Declaro que o titular do cartão autorizou…"*. Gravado com `origem: "balcao"` e
  `registradoPor`.

A diferença não é cosmética. No balcão quem marca a caixinha não é o titular; gravar
"Autorizo a cobrar minha mensalidade" ali seria **prova falsa**, e é exatamente essa prova
que a barbearia apresenta se o cliente contestar no banco. Por isso o texto do balcão tem
autor, e por isso `exigirQuemGerencia` passou a devolver quem chamou.

E é por isso que, no balcão, a **confirmação no WhatsApp é a única prova do lado do
cliente** — o que faz de cliente sem telefone no cadastro um caso a evitar. A tela avisa
em vermelho antes, e o resultado da action diz se a mensagem saiu.

O link de remoção vai em **toda** mensagem de cartão: a saída fácil é a condição para
debitar a conta de alguém todo mês ser defensável.

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
   `sem token devolvido` nos avisos, em vez de degradar em silêncio. Para o **balcão**, é
   preciso também **checkout transparente** liberado; sem ele o
   `POST /creditCard/tokenizeCreditCard` responde 200 sem token, e a tela diz isso em vez
   de culpar o cartão do cliente.
2. **Eventos novos no webhook** do Asaas, além dos dois que já existiam:
   `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS`,
   `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`,
   `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`.

E lembre à barbearia que **a taxa de cartão é maior que a de boleto** — quem paga é ela.

### Como o cartão entra

- **No balcão**, com o cliente na frente: *Clientes* → ficha → **Cadastrar cartão no
  balcão**. A atendente digita o cartão e marca a declaração; nada é cobrado na hora.
  Exige CPF do titular, CEP e número do endereço — o gateway pede, e eles **não ficam
  guardados**: só o token sobrevive à chamada.
- **Sozinho**, pelo link: o aviso de renovação (D-N) já leva o link para quem ainda não
  tem cartão, e *Clientes* → **Mandar link pelo WhatsApp** abre o `wa.me` com a mensagem
  pronta (mesmo clique-para-conversar da confirmação).
- Pelo link, o cadastro é amarrado a uma **mensalidade em aberto**: a página do Asaas cobra
  a fatura, não existe tokenizar com R$ 0,00 por ali. Sem mensalidade aberta a tela diz
  isso. No balcão não há essa restrição — a tokenização é à parte da cobrança.
- Para sair: botão na própria página (`motivoRemocao: "cliente"`), ou na ficha do cliente
  (`"barbearia"`).
- A ficha mostra **como** o cartão entrou (`origem`), porque isso muda o peso da prova
  numa contestação.

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
# gera uma senha longa e aleatória — ninguém digita, é só um aperto de mão entre as partes
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

firebase functions:secrets:set COBRANCAS_SECRET   # cole o valor acima quando pedir
firebase functions:secrets:access COBRANCAS_SECRET  # confere
```

É **um** segredo, lido pelos **dois** lados: o site (que confere o header) e a função
`cicloCobranca` (que o envia, via `defineSecret`). Não há como os valores divergirem. E ele
**nunca** vai para o `.env.production` — aquele arquivo é versionado.

O site o enxerga porque ele é declarado no `firebase.json`:

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

É a função `cicloCobranca`, e ela sobe **no deploy das funções** — que é separado do deploy
do site. O `npm run deploy` da raiz publica só o hosting. Para subir as duas coisas:

```bash
firebase deploy --only hosting,functions
```

Ela usa o `SITE_URL` de `functions/.env` (já versionado) e o `COBRANCAS_SECRET` do passo 4 —
então o segredo tem que existir **antes** desse deploy.

Para ver se está rodando: console do Firebase → *Functions* → `cicloCobranca` → *Logs*. A cada
hora aparece a resposta da rota, por barbearia (o JSON do *Diagnóstico*, abaixo). Uma
execução que falha aparece como erro, nunca como sucesso mudo.

Para rodar na hora, sem esperar o minuto 5 — útil no primeiro teste:

```bash
curl -fsS -X POST https://<app>/api/cobrancas/ciclo \
  -H "x-cobrancas-secret: <o valor do segredo>"
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
| Nada nos logs de `cicloCobranca` | A função não subiu: faltou `firebase deploy --only functions` |
| `SITE_URL não configurada` nos logs | O `functions/.env` não foi junto no deploy |
| `500` com "COBRANCAS_SECRET não configurado" | Segredo não criado no Secret Manager, ou deploy do site feito antes de criá-lo |
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
| Balcão: "gateway não devolveu token" | Checkout transparente/tokenização não liberados na conta do Asaas |
| Balcão: "Cartão inválido" com cartão bom | Confira CEP e número do endereço do titular — o gateway recusa por eles também |
| Cartão cadastrado e cliente não recebeu nada | Cadastro de balcão sem telefone utilizável: ficou sem prova do lado do cliente |
