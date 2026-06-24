# Prompt — Módulo Clientes completo (O Cartel)

Cole este prompt no Claude Code, já dentro do repositório do O Cartel.

---

## Contexto

Estou evoluindo o módulo **Clientes** do O Cartel (SaaS multi-tenant de gestão de barbearia, Next.js 15 + Firebase). A versão atual é uma lista + painel de detalhe estático. Preciso que vire um módulo completo de uso diário, no mesmo padrão de qualidade que já pedi pro módulo Agenda.

**Antes de escrever qualquer código**, faça o seguinte levantamento e me mostre um resumo:

1. Leia o schema atual do Firestore para `clients`/`clientes`, `appointments`/`agendamentos`, `plans`/`planos`, e `payments`/`pagamentos` — e o mecanismo de isolamento multi-tenant (campo `environmentId`/`tenantId` ou subcollections).
2. Verifique se já existe algum contador agregado no documento do cliente (total gasto, nº de atendimentos) ou se isso seria novo.
3. Leia como o módulo Agenda (já implementado ou em implementação) marca um agendamento como `concluido` — esse é o gatilho que vai precisar atualizar os agregados do cliente, então preciso saber onde esse código mora antes de duplicar lógica.
4. Confirme os tokens visuais já em uso, pra manter consistência com o resto do admin.
5. Me avise antes de criar qualquer campo novo no schema que ainda não existe.

Só depois desse levantamento, comece a implementação.

---

## Decisões já tomadas (não perguntar de novo)

- **Sem programa de fidelidade.** Não existe selo "X/10 para corte grátis" neste sistema. Não implemente isso.
- **Agregados são contadores salvos, não calculados on-the-fly.** `totalGasto` e `totalAtendimentos` (e qualquer outro agregado) ficam armazenados no próprio documento do cliente, e são incrementados em um único ponto centralizado no momento em que um agendamento é marcado como `concluido` (ou quando um pagamento é confirmado, se for esse o gatilho real do seu fluxo de Pagamentos — confirme qual dos dois é a fonte da verdade antes de implementar, não duplique o incremento nos dois lugares).
- Essa centralização deve ser uma função/transação única e reutilizável (ex.: um helper `incrementClientStats` ou uma Cloud Function acionada por escrita no Firestore), nunca espalhada em múltiplos componentes de UI que escrevem direto no documento do cliente.

---

## O que o módulo precisa ter

### 1. Lista de clientes (coluna esquerda)
- Busca por nome, telefone ou e-mail, em tempo real (debounce, sem disparar uma query nova a cada tecla).
- Filtros por segmento, como pills clicáveis: Todos, VIP, Avulsos, Inadimplentes — cada um mostrando a contagem. O critério de cada segmento precisa estar claro no código (ex.: VIP é um campo manual no cadastro? Inadimplente é calculado por pagamento atrasado vencido?) — se o critério de "Inadimplente" depender do módulo Pagamentos e esse dado não existir ainda, documente a regra esperada e implemente um fallback razoável (ex.: pagamento de plano com vencimento passado e sem confirmação).
- Cada item da lista mostra: avatar (iniciais), nome, telefone, plano atual (ou "Avulso" se não tiver), badge de tag (VIP/Novo/Inadimplente) e "há quanto tempo" foi o último atendimento.
- Botão "+ Novo cliente" abre modal de cadastro.
- Clique em um cliente abre o painel de detalhe à direita.
- Estado vazio tratado (nenhum cliente cadastrado ainda, busca sem resultado).
- Paginação ou scroll infinito se a lista crescer (não carregar todos os clientes do tenant de uma vez se a base for grande — escopar a query).

### 2. Painel de detalhe do cliente (coluna direita)
- Header: avatar, nome completo, badge VIP se aplicável, telefone, e-mail.
- Botões "Novo agendamento" (abre o modal de agendamento da Agenda, pré-preenchido com este cliente) e "Editar" (abre modal de edição de cadastro).
- Três cards de métricas: Total gasto, Atendimentos, Cliente desde (data de cadastro).
- Card de Plano ativo: nome do plano, data de renovação, barra de progresso de uso (ex.: "2/4 cortes" — isso vem da contagem real de uso do plano no período vigente, não um número fixo). Se o cliente não tiver plano, mostrar estado "Avulso, sem plano ativo" com botão para associar um plano.
- Card de Próximo agendamento: data, horário, serviço, barbeiro — vindo de uma query real nos agendamentos futuros deste cliente. Se não houver nenhum agendamento futuro, mostrar estado vazio com botão de agendar.
- Forma de pagamento preferida (vem do cadastro ou do último pagamento confirmado).
- Campo de Observações: texto livre, editável inline (ex.: preferências de corte), salvando ao perder foco ou com botão salvar explícito — sem precisar abrir o modal de edição completo só para isso.
- Histórico de atendimentos: lista cronológica (mais recente primeiro) com data, serviço, barbeiro responsável e valor cobrado. Paginar ou limitar (ex. últimos 10, com "ver tudo").
- Estado vazio quando nenhum cliente está selecionado na lista (placeholder convidando a selecionar ou cadastrar).

### 3. Modal de novo cliente / editar cliente
Campos: nome completo, telefone, e-mail, forma de pagamento preferida, observações, marcação manual de VIP (se VIP for um campo manual e não calculado), e associação de plano (opcional, select com os planos configurados no tenant).
- Validação: nome e telefone obrigatórios; telefone com máscara brasileira; e-mail validado se preenchido.
- Ao editar, mesmo modal pré-preenchido.
- Ao excluir um cliente (ação separada, com confirmação forte — isso afeta histórico de agendamentos), decida e documente o que acontece com os agendamentos passados/futuros associados (manter histórico com referência órfã vs. impedir exclusão se houver agendamento futuro pendente — a segunda opção é mais segura, mas confirme com o que já existe no projeto).

### 4. Segmentação / tags
- VIP: indique no código se isso é campo manual (toggle no cadastro) — não calcule isso automaticamente a partir de gasto, a menos que você me confirme que esse é o comportamento esperado.
- Novo: cliente cadastrado há menos de X dias (defina constante configurável, ex. 14 dias) sem nenhum atendimento concluído ainda.
- Inadimplente: ver critério na seção de decisões já tomadas acima.

### 5. Responsivo / mobile
- Abaixo de ~760px, a visão de duas colunas (lista + detalhe) vira navegação em duas telas: lista primeiro, toque no cliente navega para o detalhe em tela cheia, com botão de voltar.
- Modais ocupam tela cheia ou quase cheia em mobile.
- Histórico de atendimentos e métricas devem ficar legíveis sem scroll horizontal.

---

## Padrões técnicos a seguir

- Use os hooks/padrões de acesso a dados já existentes no projeto — não crie um padrão novo de fetching se já existe um (confirme isso no levantamento inicial).
- Respeite o isolamento multi-tenant em toda leitura e escrita — nenhum cliente pode aparecer ou ser editável fora do tenant ativo.
- Se o projeto usa Firestore Security Rules, garanta que elas cobrem: criação/edição/exclusão de cliente, edição inline de observações, e a escrita do contador agregado (essa última talvez devesse vir de uma Cloud Function/Server Action em vez de escrita direta do client, justamente para não poder ser manipulada pelo usuário final — avalie e recomende).
- Escopar queries: a lista de clientes não deve trazer campos pesados (histórico completo) de uma vez — carregue o histórico de atendimentos só quando o cliente é selecionado no painel de detalhe.
- Otimistic UI na edição inline de observações e nos toggles de segmento, com rollback visível se a escrita falhar.
- Mantenha a paleta e os tokens visuais já usados no admin.
- Loading states e empty states tratados visualmente em cada bloco (lista vazia, sem plano, sem próximo agendamento, sem histórico).

## Entregável esperado

Implementação completa do módulo Clientes dentro da estrutura de pastas e convenções já existentes no projeto — não um componente isolado solto. Ao final, me dê um resumo do que foi criado/alterado, quais arquivos, qual decisão tomou para o gatilho do contador agregado (agendamento concluído vs. pagamento confirmado) e para o critério de "Inadimplente", e se algum dado do schema precisou ser estendido.
