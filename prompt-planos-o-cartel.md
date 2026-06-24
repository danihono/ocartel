# Prompt — Módulo Planos completo (O Cartel)

Cole este prompt no Claude Code, já dentro do repositório do O Cartel.

---

## Contexto

Estou evoluindo o módulo **Planos** do O Cartel (SaaS multi-tenant de gestão de barbearia, Next.js 15 + Firebase). A versão atual é uma lista estática de Serviços ao lado de uma lista estática de Planos de assinatura. Preciso que vire um módulo completo, no mesmo padrão de qualidade já pedido para os módulos Agenda e Clientes.

**Antes de escrever qualquer código**, faça o seguinte levantamento e me mostre um resumo:

1. Leia o schema atual do Firestore para `services`/`servicos` e `plans`/`planos`, e confirme o mecanismo de isolamento multi-tenant.
2. Confirme onde `serviceId` é referenciado em `appointments`/`agendamentos` e onde `planId` é referenciado em `clients`/`clientes` — vou precisar de contadores agregados nessas duas pontas (quantos agendamentos usam cada serviço, quantos clientes assinam cada plano).
3. Verifique se já existe algum campo de ordenação (ex. `order`/`ordem`) nos serviços, usado para definir a sequência exibida na agenda e no agendamento público. Se não existir, será necessário criar.
4. Confirme os tokens visuais já em uso, pra manter consistência com o resto do admin.
5. Me avise antes de criar qualquer campo novo no schema que ainda não existe.

Só depois desse levantamento, comece a implementação.

---

## Decisões já tomadas (não perguntar de novo)

- **Planos têm apenas nome, valor mensal e descrição curta.** Não incluem lista de serviços inclusos nem contador de "X cortes inclusos" — isso é tratado em outro lugar do sistema (módulo Clientes), não faz parte do cadastro do plano em si.
- **A tela de Planos mostra quantos clientes estão assinando cada plano**, puxando essa contagem do módulo Clientes (consulta agregada, não fetch de todos os documentos de cliente).

---

## O que o módulo precisa ter

### 1. Bloco Serviços
- Lista editável dos serviços (nome, duração em minutos, preço em R$), na ordem em que aparecem na Agenda e no agendamento público do cliente.
- Edição inline: clicar em editar transforma a linha em campos editáveis (não abre modal separado), com botões de confirmar/cancelar e validação (nome obrigatório, duração > 0, preço ≥ 0).
- Reordenação por drag-and-drop (arrastar pela alça/ícone de "grip"), persistindo a nova ordem no Firestore (campo `order`/`ordem` em cada serviço).
- **Importante:** implemente a reordenação usando Pointer Events (não apenas a API de Drag and Drop nativa do HTML5), para que funcione tanto com mouse quanto com touch em dispositivos móveis.
- Formulário de adicionar novo serviço, sempre visível no rodapé da lista (sem precisar abrir modal para isso).
- Cada serviço mostra quantos atendimentos do histórico o utilizam (contador agregado, calculado de forma eficiente — não escaneie toda a coleção de agendamentos a cada renderização da tela; use um contador mantido ou uma query agregada/cacheada).
- **Exclusão de serviço:** ao tentar excluir, verifique se há agendamentos (passados ou futuros) referenciando esse `serviceId`. Se houver, bloqueie a exclusão e informe quantos atendimentos estão vinculados, orientando o usuário a reatribuir esses atendimentos a outro serviço antes de excluir. Só permita excluir se a contagem for zero.
- Estado vazio tratado (nenhum serviço cadastrado ainda).

### 2. Bloco Planos de assinatura
- Cards de plano: nome, valor mensal, descrição curta, e contador de assinantes atuais (clientes com esse `planId`).
- Botão de editar (abre modal) e excluir em cada card.
- **Exclusão de plano:** mesma lógica de proteção dos serviços — se houver clientes vinculados a esse `planId`, bloqueie a exclusão e informe quantos clientes estão vinculados, orientando a migrar esses clientes para outro plano antes de excluir.
- Modal de criar/editar plano: nome, valor mensal, descrição curta. Validação: nome obrigatório, valor ≥ 0.
- Botão "Novo plano" sempre visível.
- Estado vazio tratado (nenhum plano cadastrado ainda).

### 3. Responsivo / mobile
- Em telas estreitas, os dois blocos (Serviços e Planos) empilham verticalmente em vez de lado a lado.
- A tabela de serviços precisa permanecer legível sem scroll horizontal forçado — considere colapsar a coluna de duração/preço em uma segunda linha por item em telas muito estreitas, se necessário.
- A reordenação por toque (Pointer Events) precisa funcionar de forma confiável em mobile — teste especificamente isso, já que é o ponto mais arriscado de portar para touch.

---

## Padrões técnicos a seguir

- Use os hooks/padrões de acesso a dados já existentes no projeto — não crie um padrão novo de fetching se já existe um.
- Respeite o isolamento multi-tenant em toda leitura e escrita.
- Os contadores agregados (uso de serviço, assinantes de plano) devem ser eficientes: avalie se já existe um padrão de agregação no projeto (ex. um documento de contadores mantido por Cloud Function, ou `count()` aggregation query do Firestore) e siga esse padrão; se não existir nenhum, recomende o mais simples que resolva sem custo alto de leitura, e documente a escolha.
- Se o projeto usa Firestore Security Rules, garanta que elas cobrem criação, edição, reordenação e exclusão de serviços e planos — e que a exclusão bloqueada por vínculo ativo não pode ser contornada só por uma chamada direta ao Firestore (a regra de negócio de bloqueio deve estar nas Rules ou em uma Cloud Function/Server Action, não só na UI).
- Otimistic UI na edição inline e na reordenação, com rollback visível se a escrita falhar.
- Mantenha a paleta e os tokens visuais já usados no admin.
- Loading states e empty states tratados visualmente.

## Entregável esperado

Implementação completa do módulo Planos dentro da estrutura de pastas e convenções já existentes no projeto — não um componente isolado solto. Ao final, me dê um resumo do que foi criado/alterado, quais arquivos, como decidiu implementar os contadores agregados (qual padrão usou e por quê), e se algum dado do schema precisou ser estendido (incluindo o campo de ordenação dos serviços, se não existia).
