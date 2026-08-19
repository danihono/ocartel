# Confirmação automática pelo WhatsApp

Antes, o barbeiro abria o agendamento no painel e clicava num link `wa.me` para mandar a
confirmação na mão, um por um. Agora o sistema envia sozinho, **na manhã do dia do
atendimento**.

## A regra

- Quem marca na terça para sexta é avisado **na sexta**, não na terça.
- O horário do envio é **configurado por barbearia**, em *Configurações*.
- Quem marca no próprio dia, **depois** de o envio já ter rodado, **não recebe nada** —
  decisão de produto: já está com o horário fresco, e é uma mensagem a menos saindo do número.
- Rodar o disparo duas vezes **não** remanda mensagem (`confirmacaoEnviadaEm` no agendamento).

O texto é o mesmo de sempre (`lib/confirmacao.ts`), incluindo a variação de lembrete para quem
já confirmou. O link continua levando para `/c/<codigo>`.

## Como funciona

```
timer externo (de hora em hora)
        │  POST /api/confirmacoes/disparar   (header x-confirmacoes-secret)
        ▼
   a rota decide QUAIS barbearias disparam nesta hora
        │  (config.confirmacao.hora, no fuso de Brasília)
        ▼
   agendamentos de hoje sem confirmacaoEnviadaEm
        ▼
   lib/canal ──► fila do daemon de WhatsApp ──► cliente
```

O agendador é externo e **burro de propósito**: ele bate na rota toda hora e a rota é que sabe
quem dispara. Assim uma barbearia nova não exige mexer em cron nenhum.

## Ligar numa barbearia

### 1. Vincular o WhatsApp

O daemon mantém a sessão de WhatsApp sob um `uid`. Crie o documento que liga a barbearia a essa
sessão:

```
tenants/{tenantId}/private/whatsapp
  { uid: "<uid da sessão no daemon>", numero: "5519..." }
```

Sem ele o disparo dessa barbearia é pulado com `sem WhatsApp vinculado` — não quebra as outras.

### 2. Índice do Firestore

O daemon escuta a fila por *collection group query*. No projeto do Cartel:

```json
{ "collectionGroup": "waCommands", "queryScope": "COLLECTION_GROUP",
  "fields": [{ "fieldPath": "status", "order": "ASCENDING" },
             { "fieldPath": "createdAt", "order": "ASCENDING" }] }
```

Sem o índice o daemon cai com `FAILED_PRECONDITION` — e como o emulador não valida índices, o
erro só aparece em produção.

### 3. Segredo da rota

`CONFIRMACOES_SECRET` no ambiente do App Hosting. A rota devolve **401** sem ele e **500** se a
variável não existir (falha visível é melhor que disparo aberto).

### 4. Agendador

Na máquina que hospeda o daemon, de hora em hora:

```bash
curl -fsS -X POST https://<app>/api/confirmacoes/disparar \
  -H "x-confirmacoes-secret: $CONFIRMACOES_SECRET"
```

### 5. Ligar no painel

*Configurações* → **Confirmação automática pelo WhatsApp** → marcar e escolher a hora.

Vem **desligado** por padrão: nenhuma barbearia existente começa a mandar mensagem sozinha sem
alguém ter pedido.

## Fuso

A comparação da hora é feita em `America/Sao_Paulo`, não no fuso do servidor — que costuma ser
UTC. É o erro mais provável deste fluxo, e o que os testes em `tests/confirmacao-disparo.test.ts`
mais cobrem: às 02:00 UTC ainda é o **dia anterior** às 23:00 em São Paulo, e varrer a agenda do
dia errado passaria despercebido.

## Retentativa

O disparo continua valendo por **2 horas** depois da hora configurada. Uma queda de rede às 08:00
seria, sem isso, um cliente sem aviso o dia inteiro — na hora seguinte a barbearia já não casaria
mais e só voltaria no dia seguinte. Reprocessar é seguro porque quem já recebeu tem
`confirmacaoEnviadaEm` gravado.

## Diagnóstico

A rota devolve o que fez, por barbearia:

```json
{ "dataISO": "2026-08-13", "hora": 8,
  "tenants": [{ "tenantId": "abc", "enviadas": 7, "falhas": 0 }] }
```

| Sintoma | Causa provável |
|---|---|
| `401` | Segredo ausente ou errado no header |
| `500` com "CONFIRMACOES_SECRET não configurado" | Variável faltando no App Hosting |
| `tenants: []` | Nenhuma barbearia com `confirmacao.ativa` nesta hora — confira o fuso |
| `motivo: "sem WhatsApp vinculado"` | Falta `tenants/{id}/private/whatsapp` |
| `falhas > 0` | O daemon não consumiu a fila: veja o log dele e o índice do §2 |
| Mensagem duplicada | `confirmacaoEnviadaEm` não está sendo gravado — investigar permissão de escrita |
