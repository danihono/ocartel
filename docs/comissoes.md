# Comissões

Cada barbearia calcula comissão de um jeito, e a regra depende de coisas que só o dono do
negócio sabe: se o atendimento foi coberto por plano, se o cliente pagou na hora, quantidade
no mês. A fórmula definitiva do O Cartel **ainda não foi definida** — então este módulo foi
construído para receber essa fórmula depois **sem migração de dados, sem mexer na tela e sem
reescrever o que já foi fechado**.

## Onde a fórmula mora

Um lugar só:

```ts
// lib/comissao.ts
export function comissaoDaLinha(linha: Omit<LinhaComissao, "comissao">, regra: RegraComissao): number
```

Trocar a regra da barbearia é reescrever **esta função**. Nada mais.

A regra **provisória** em vigor é percentual sobre o valor recebido:

- percentual por barbeiro, com o percentual geral da casa como fallback
  (`pctDoBarbeiro`, configurado em *Configurações → Comissões*);
- atendimento coberto pelo plano entra como R$ 0, logo comissão 0;
- cobrança em aberto não gera comissão enquanto não for recebida;
- mensalidade **não** gera comissão: não é de um barbeiro específico, e a regra de rateio não
  foi definida. A linha existe na apuração (aparece no rodapé da tela), com comissão 0.

Nenhuma barbearia começa a dever comissão sozinha: sem regra gravada vale `REGRA_PADRAO`
(0%), a mesma disciplina da confirmação automática e do ciclo de cobrança.

## Por que `LinhaComissao` tem campos que a regra de hoje ignora

`quantidade`, `pagoNoAto`, `forma`, `tipoCobranca`, `cobertoPorPlano`, `valorCobrado` **e**
`valorRecebido` separados. A regra provisória usa dois deles. Os outros estão lá porque a
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
valor apurado, faturamento que o gerou, quem fechou, quando, e um **retrato da regra usada**.

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
