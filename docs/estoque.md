# Estoque

Registra o que a barbearia já fazia no papel: **faltou um produto, alguém anota; comprou,
alguém dá baixa**. Nada além disso nesta fase.

## O que este módulo NÃO faz (de propósito)

Não controla saldo: não existe quantidade em mãos, estoque mínimo nem baixa de consumo. Um
saldo só é útil se alguém der baixa de cada uso todo dia — e um saldo que ninguém alimenta
mente, o que é pior do que não ter saldo nenhum. Se isso for pedido depois, entra como
catálogo de produtos ao lado das solicitações, sem migração do que existe aqui.

## A regra

- Uma solicitação nasce `pendente`, com produto, quantidade, unidade, urgência, quem pediu e
  a data. O campo de produto sugere os já pedidos antes — cinco grafias da mesma coisa
  estragariam qualquer relatório depois.
- *Registrar compra* marca `comprado`, com quem comprou, quando e (opcional) quanto custou.
  Custo não informado fica **ausente**, não zero: um zero falso mentiria no gasto do mês.
- *Cancelar* é o terceiro estado, para o pedido que morre sem compra. É por isso que `status`
  é gravado em vez de derivado da presença de `compradoEm`: nenhuma data expressa "cancelado".
- Uma compra ou cancelamento pode ser **reaberto**, e volta para a lista de pendentes.

## Filtro por mês, com uma exceção

O filtro de mês vale para compradas, canceladas e "todas" — usando a data da compra quando já
comprado, e a do pedido quando não. **Pendentes ignora o mês**: uma falta anotada dois meses
atrás e nunca comprada continua sendo uma falta hoje. Esconder ela ao navegar para o mês
corrente seria a forma mais fácil de o sistema fazer a barbearia esquecer de comprar.

A mesma razão vale para o KPI *Esperando compra* (de todos os meses) e para o contador de
faltas **urgentes** no menu lateral: o que acabou não pode depender de alguém abrir a aba.
