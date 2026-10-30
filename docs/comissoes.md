# Comissões

A comissão do mês de cada barbeiro tem duas partes, somadas:

1. **Pote da assinatura** — uma fatia das mensalidades recebidas, repartida por **fichas**.
2. **Avulsos** — percentual sobre o valor recebido de cada atendimento pago na hora.

## Pote da assinatura (a conta da casa)

```
pote          = mensalidades recebidas no mês × 40%
fichas        = soma das fichas de cada atendimento concluído no mês
parte do X    = pote × (fichas do X ÷ fichas da equipe)
```

Exemplo: R$ 10.000 de assinaturas → pote de R$ 4.000. A equipe fez 2.400 fichas; o barbeiro
A fez 1.840 (76,67%) e leva R$ 3.066,67; o B fez 560 (23,33%) e leva R$ 933,33.

**Tabela de fichas** (pelo tempo de cada peça; editável em *Configurações → Comissões*):

| Peça   | Fichas | Repetido na semana (metade) |
|--------|-------:|----------------------------:|
| Cabelo |     30 |                          15 |
| Barba  |     30 |                          15 |
| Raspar |     20 |                          10 |

- Contam **todos os atendimentos concluídos**, de assinante e avulsos. O avulso também pode
  ter percentual próprio (abaixo), que soma com a parte do pote; o padrão é 0%.
- Um serviço pode ter mais de uma peça: "Corte + Barba" = cabelo + barba = 60 fichas. As peças
  são deduzidas do nome do serviço e podem ser corrigidas na mesma tela.
- **Repetido**: se o mesmo cliente já fez aquela peça na semana (segunda a domingo), ela vale a
  ficha reduzida. A semana atravessa a virada do mês: o corte do dia 2 conta como repetido se o
  cliente cortou no dia 31 anterior e os dois caem na mesma semana.
- A divisão usa a **fração exata** (1.840 ÷ 2.400), não a porcentagem arredondada, e os
  centavos de arredondamento vão para as maiores frações — a soma das partes é sempre o pote.
- Mensalidade conta pelo que foi **recebido** no mês (pela data de pagamento). Cobrança em
  aberto não entra no pote.
- Pote em 0% (o padrão) = desligado. Nenhuma barbearia começa a dever comissão sozinha.

A tela de Comissões mostra o resuminho do mês com esses números passo a passo, e no detalhe de
cada barbeiro as fichas de cada atendimento (marcando os repetidos).

Código: `apurarMes` e `distribuirPote` em `lib/comissao.ts`; testes em `tests/comissao.test.ts`
(inclui o exemplo acima).

## Avulsos (percentual)

Fórmula por linha, em `comissaoDaLinha` (`lib/comissao.ts`):

- percentual por barbeiro, com o percentual geral da casa como fallback
  (`pctDoBarbeiro`, configurado em *Configurações → Comissões*);
- atendimento coberto pelo plano entra como R$ 0 aqui (ele é pago pelo pote);
- cobrança em aberto não gera comissão enquanto não for recebida.

## Por que `LinhaComissao` tem campos que a regra de hoje ignora

`quantidade`, `pagoNoAto`, `forma`, `tipoCobranca`, `cobertoPorPlano`, `valorCobrado` **e**
`valorRecebido` separados. A regra de hoje usa só alguns deles. Os outros estão lá porque a
fórmula futura vai precisar — e o dia de descobrir que o dado não foi guardado é o pior dia
possível para descobrir. Montar a linha completa é o que transforma a troca da fórmula num
`git diff` de uma função em vez de uma migração.

## De onde sai a apuração

A linha canônica é o **agendamento concluído**, enriquecido com a **cobrança** dele:

- o agendamento tem `barbeiroId` (id de verdade) e `date` em ISO — o que a apuração por
  barbeiro e por mês exige;
- a transação tem o dinheiro (`amount`/`amountReceived`), a `forma`, o status e o `paidAt`.

O vínculo entre as duas pontas é o `agendamentoId` (mais `barbeiroId`) que a transação passou
a gravar ao concluir o atendimento. Comissão amarrada em `barbeiroNome` erraria de pessoa na
primeira renomeação.

**Registros antigos não têm esse vínculo.** Para eles a apuração casa por barbeiro + serviço +
data, marca a linha como `inferido` (um `~` no detalhe) e a tela avisa quantas são, antes de
alguém fechar o mês em cima de um palpite. Uma cobrança legada nunca é usada para dois
atendimentos.

## Fechamento

O relatório é **sempre recalculado** — corrigir um atendimento errado corrige a comissão junto.
O que se grava é o fechamento (`tenants/{t}/fechamentos`), e só quando a dona fecha o mês:
valor apurado (pote + avulsos), fichas e parte do pote, faturamento que o gerou, quem fechou,
quando, e um **retrato da regra usada** (inclusive a tabela de fichas). É o histórico do módulo.

- Id determinístico `{mes}_{barbeiroId}` — clicar duas vezes em *Fechar mês* não duplica.
- `total`, `regra`, `mes`, `barbeiroId` e `fechadoEm` são **imutáveis** nas regras do Firestore.
  É isso que impede que mudar o percentual hoje reescreva quanto se combinou de pagar em maio.
  Editável depois, só `pagoEm`/`pagoPor`.
- Quando a apuração de hoje divergir do valor fechado, a tela mostra **os dois** e explica.
  Refazer é *Reabrir* — ação explícita, nunca efeito colateral de mexer na regra.

## Janela de dados

O painel mantém em memória os últimos ~180 dias de agendamentos (ver `lib/store.tsx`).
Recalcular um mês fora dessa janela mostraria uma comissão **menor** que a real — o tipo de
erro que ninguém percebe. Fora da janela, quem vale é o fechamento gravado, e a tela diz isso.

## Onde o percentual é guardado

`tenants/{t}/private/comissao`, ao lado das credenciais do Asaas — e **não** em `config/main`
nem em `barbeiros`, que são `allow read: if true` nas regras para alimentar a vitrine pública de
`/book/[slug]`. Percentual de comissão ali seria legível por qualquer pessoa na internet.

Esvaziar o campo de um barbeiro o devolve ao padrão da casa. Isso usa `deleteField()`: com
`merge: true` o Firestore mescla mapas **chave por chave**, então reescrever `pctPorBarbeiro`
sem o barbeiro deixaria o valor antigo dele no doc — o campo pareceria limpo na tela e
continuaria valendo no cálculo.
