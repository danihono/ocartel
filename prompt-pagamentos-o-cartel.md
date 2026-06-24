# Prompt — Módulo Pagamentos completo (O Cartel)

Cole este prompt no Claude Code, já dentro do repositório do O Cartel.

---

## Contexto

Estou criando o módulo **Pagamentos** do O Cartel (SaaS multi-tenant de gestão de barbearia, Next.js 15 + Firebase), no mesmo padrão de qualidade já implementado nos módulos Agenda, Clientes e Planos.

**Antes de escrever qualquer código**, faça o seguinte levantamento e me mostre um resumo:

1. Confirme se já existe alguma collection de cobranças/pagamentos no Firestore (`charges`/`cobrancas`/`payments`/`pagamentos`) ou se será criada agora.
2. Leia como o módulo Clientes (já implementado) calcula ou exibe o segmento "Inadimplente" — preciso que este módulo de Pagamentos seja a fonte real desse dado, então confirme se o Clientes já tem um placeholder esperando essa integração ou se isso também precisa ser conectado agora.
3. Leia como o módulo Planos (já implementado) referencia `planId` nos clientes e os valores de mensalidade — as cobranças de mensalidade deste módulo precisam estar amarradas a esse `planId` e ao valor vigente do plano.
4. Confirme o mecanismo de isolamento multi-tenant já em uso.
5. Confirme os tokens visuais já em uso, pra manter consistência com o resto do admin.
6. Me avise antes de criar qualquer campo novo no schema que ainda não existe.

Só depois desse levantamento, comece a implementação.

---

## Decisões já tomadas (não perguntar de novo)

- **Sem integração de gateway de pagamento por enquanto.** Todo pagamento (Pix, dinheiro, cartão) é confirmado manualmente pela dona/admin da barbearia no momento em que o dinheiro entra de fato. Não implemente checkout, webhook ou cobrança automática nesta fase.
- **Estruture os dados pensando na entrada futura de um gateway.** Cada cobrança deve ter um campo de origem (ex. `source: "manual"`) e um campo de método (`method`), para que, quando a cobrança automática via gateway for implementada futuramente, ela possa preencher esses mesmos campos via webhook sem exigir uma migração de schema. Não implemente a parte do gateway agora — só deixe a modelagem aberta para isso.
- **Este módulo cobre dois tipos de cobrança:** mensalidade de plano (`type: "mensalidade"`, vinculada a um `planId` e `clientId`) e cobrança avulsa de serviço (`type: "avulso"`, vinculada a um `serviceId` e `clientId`, tipicamente gerada quando um agendamento de cliente sem plano é concluído — confirme com o módulo Agenda se esse é o gatilho certo, ou se cobranças avulsas serão sempre lançadas manualmente por agora).
- **Critério de atraso:** uma cobrança é considerada `atrasado` quando seu status ainda é `pendente` e a data de vencimento já passou. Isso é calculado (derivado), não é um status gravado separadamente — não crie um status "atrasado" persistido no banco; calcule isso na leitura, comparando `dueDate` com a data atual.
- **Sem status de pagamento parcial nesta fase.** Uma cobrança está paga ou não está. Se o valor confirmado no registro de pagamento for diferente do valor original da cobrança, isso é permitido (a dona pode precisar registrar um desconto ou ajuste), mas o valor original da cobrança deve ser preservado em um campo separado do valor efetivamente recebido, para que essa diferença não se perca silenciosamente — exiba isso de forma visível na interface quando os dois valores não coincidirem (ex. "Cobrado R$ 140, recebido R$ 120").

---

## O que o módulo precisa ter

### 1. KPIs no topo
Três cartões: Recebido este mês (soma de cobranças pagas com `paidAt` no mês corrente), A receber (soma de cobranças pendentes dentro do prazo), Em atraso (soma de cobranças pendentes com vencimento passado, com contador de quantas cobranças).
- Estes valores devem ser somas reais sobre os dados filtrados pelo tenant ativo — calcule de forma eficiente (agregação no servidor ou cache, não recalcular escaneando toda a coleção em cada render se a base crescer).

### 2. Banner de inadimplência
Quando houver pelo menos uma cobrança em atraso, exibir um aviso destacado informando a quantidade, e deixando claro que esses clientes aparecem como "Inadimplente" no módulo Clientes.
- **Esta é a integração real entre os dois módulos**: o critério de "Inadimplente" usado no módulo Clientes deve consultar este módulo de Pagamentos (cliente tem ao menos uma cobrança com `status: pendente` e `dueDate` vencida) em vez de manter uma lógica duplicada e potencialmente divergente. Ajuste o módulo Clientes se necessário para que ele consuma essa mesma fonte.

### 3. Lista de cobranças
- Tabela (desktop) / cards (mobile) com: cliente, item (nome do plano ou serviço), data (vencimento ou data de pagamento, dependendo do status), valor, status (badge: Pago/Pendente/Atrasado), forma de pagamento (se já pago), ação.
- Busca por nome de cliente.
- Filtro por tipo (mensalidade / avulso / todos).
- Filtro por status (pills: Todos, Pagos, Pendentes, Atrasados), cada um com contagem.
- Ordenação por data de vencimento (mais recente/relevante primeiro).
- Estado vazio tratado (nenhuma cobrança, busca sem resultado).
- Escopar a query: não carregar o histórico completo de cobranças de todos os tempos de uma vez — pagine ou limite por período (ex. últimos 3 meses + tudo que está pendente/atrasado, com opção de carregar mais).

### 4. Registrar pagamento
- Ação disponível em qualquer cobrança não paga.
- Modal pedindo: valor recebido (pré-preenchido com o valor original da cobrança, mas editável), forma de pagamento (Pix, Dinheiro, Cartão de crédito, Cartão de débito), data do recebimento.
- Ao confirmar: grava `status: "pago"`, `method`, `paidAt`, `source: "manual"`, e preserva o valor original da cobrança (`amount`) separado do valor recebido (`amountReceived` ou equivalente) se forem diferentes.
- Esta ação deve, no mesmo fluxo (transação ou Cloud Function), atualizar os contadores agregados do cliente no módulo Clientes (`totalGasto`, `totalAtendimentos` se for cobrança avulsa vinculada a atendimento) — reaproveitando o helper centralizado já criado para isso no módulo Clientes, não duplicando a lógica de incremento aqui.

### 5. Nova cobrança manual
- Modal para lançar uma cobrança manualmente: cliente, tipo (mensalidade/avulso), nome do plano ou serviço, valor, data de vencimento.
- Útil para casos que não vieram automaticamente do fluxo normal (ex. cobrança retroativa, ajuste).
- Validação: cliente, item e valor obrigatórios.

### 6. Geração de cobrança de mensalidade
- Defina (e documente, já que isso depende de uma decisão de produto) como as cobranças de mensalidade são geradas mês a mês: via Cloud Function agendada (Cloud Scheduler) que roda no início de cada ciclo e cria uma cobrança `pendente` para cada cliente com plano ativo, usando o valor vigente do plano e a data de renovação como vencimento. Se o projeto ainda não tem nenhuma Cloud Function agendada, proponha a estrutura mas avise que vai exigir configuração de deploy adicional, e implemente como uma função separada e idempotente (não duplicar cobrança se já existir uma para aquele cliente naquele ciclo).

### 7. Responsivo / mobile
- Abaixo de ~760px, a tabela vira lista de cards.
- KPIs empilham ou ficam em scroll horizontal compacto.
- Modais ocupam tela cheia ou quase cheia.

---

## Padrões técnicos a seguir

- Use os hooks/padrões de acesso a dados já existentes no projeto.
- Respeite o isolamento multi-tenant em toda leitura e escrita.
- **Toda confirmação de pagamento deve ser auditável**: registre quem confirmou (`confirmedBy`, se houver autenticação de usuário admin) e quando, além dos dados do pagamento. Isso importa para qualquer disputa futura sobre cobrança.
- Se o projeto usa Firestore Security Rules, garanta que elas cobrem criação, edição de status e leitura de cobranças, restrito ao tenant ativo. Avalie se a confirmação de pagamento deveria passar por uma Server Action/Cloud Function em vez de escrita direta do client, dado que isso afeta dados financeiros e contadores agregados de outro módulo.
- Otimistic UI ao registrar pagamento e ao criar cobrança, com rollback visível se a escrita falhar.
- Mantenha a paleta e os tokens visuais já usados no admin.
- Loading states e empty states tratados visualmente.

## Entregável esperado

Implementação completa do módulo Pagamentos dentro da estrutura de pastas e convenções já existentes no projeto — não um componente isolado solto. Ao final, me dê um resumo do que foi criado/alterado, quais arquivos, como conectou o critério de "Inadimplente" do módulo Clientes a este módulo, como decidiu resolver a geração mensal de cobrança de mensalidade (e se isso exige configuração adicional de deploy), e se algum dado do schema precisou ser estendido.
