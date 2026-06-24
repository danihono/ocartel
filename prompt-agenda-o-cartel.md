# Prompt — Módulo Agenda completo (O Cartel)

Cole este prompt no Claude Code, já dentro do repositório do O Cartel.

---

## Contexto

Estou evoluindo o módulo **Agenda** do O Cartel (SaaS multi-tenant de gestão de barbearia, Next.js 15 + Firebase). A versão atual é só uma grade visual estática. Preciso que ela vire um módulo completo e funcional de uso diário pelo admin/dona da barbearia.

**Antes de escrever qualquer código**, faça o seguinte levantamento e me mostre um resumo:

1. Localize e leia o schema atual do Firestore usado pelo projeto (collections de `appointments`/`agendamentos`, `clients`/`clientes`, `barbers`/`equipe`/`staff`, `services`/`servicos`, e o mecanismo de isolamento multi-tenant — provavelmente um campo `environmentId` ou `tenantId` em cada documento, ou subcollections por tenant).
2. Leia os componentes atuais da tela de Agenda, o roteamento (App Router) usado pra essa página, e como o restante do admin (Dashboard, Clientes, Planos, Pagamentos, Configurações) busca e atualiza dados — pra eu manter o mesmo padrão (hooks customizados? Context? React Query/SWR? listeners onSnapshot direto?).
3. Confirme a paleta/tokens visuais já em uso (cores, radius, fontes) pra eu não duplicar nem quebrar consistência com o resto do admin.
4. Me diga se algum campo necessário abaixo **não existe ainda** no schema, antes de criar nada novo — não invente uma estrutura paralela sem avisar.

Só depois desse levantamento, comece a implementação.

---

## O que o módulo precisa ter

### 1. Visão Dia (view principal)
- Colunas por barbeiro (uma coluna = um barbeiro da equipe daquele tenant), com grade de horário baseada no `horário de funcionamento` configurado em Configurações daquele tenant (não fixo, tem que ler da config real).
- Cards de agendamento posicionados por horário/duração, com cor por status: `agendado`, `confirmado`, `em_atendimento`, `no_show`, `concluido`, e um tipo separado `bloqueio` (hachurado, sem cliente).
- Linha indicadora de horário atual, visível só quando a data exibida é hoje.
- Header de cada coluna mostra nome do barbeiro + contagem de atendimentos do dia.
- Clique em espaço vazio da grade → abre modal de novo agendamento já pré-preenchido com aquele barbeiro e horário (calculado pela posição do clique, com snap de 10 minutos).
- Clique em um card existente → abre painel de detalhe (ver seção 4).

### 2. Drag-and-drop e resize
- Arrastar um card verticalmente reagenda o horário (snap de 10min), sem trocar de barbeiro nesta fase — respeitando o limite do expediente.
- Puxar a borda inferior do card redimensiona a duração do atendimento.
- Ambas as ações devem persistir no Firestore ao soltar o mouse (não só visualmente), com optimistic update + rollback se a escrita falhar.
- Cards do tipo `bloqueio` não são arrastáveis nem clicáveis para edição (são fixos até serem removidos via painel de detalhe ou Configurações).

### 3. Validação de conflito
- Ao salvar (criar, editar, arrastar ou redimensionar) um agendamento, verificar se há sobreposição de horário para o mesmo barbeiro.
- Não bloquear o salvamento — a barbearia pode precisar encaixar um cliente de emergência — mas avisar visualmente com um toast/alerta indicando o conflito e qual cliente conflitante.

### 4. Painel de detalhe (ao clicar em um agendamento)
Side panel (não modal central) mostrando:
- Nome do cliente, telefone, indicador VIP se aplicável (vem do cadastro do cliente, não duplicar dado).
- Horário, duração, serviço + preço, barbeiro responsável.
- Observações do agendamento (texto livre).
- Badge de status atual.
- Ações rápidas como botões, cada uma atualizando o status no Firestore imediatamente:
  - Confirmar presença → `confirmado`
  - Iniciar atendimento → `em_atendimento`
  - Concluir e cobrar → `concluido` (e aqui: se o módulo de Pagamentos já tiver uma function/endpoint de registro de cobrança, dispare ela; se não tiver ainda, apenas deixe um TODO claro indicando o ponto de integração)
  - Marcar no-show → `no_show`
- Botões de Editar (abre modal completo) e Cancelar (remove o agendamento, com confirmação).

### 5. Modal de criar/editar agendamento
Campos: busca de cliente (autocomplete pelo cadastro real de clientes do tenant, não lista mockada), serviço (lista real de Serviços configurados, já trazendo duração e preço), barbeiro, data, horário, status, observações.
- Validação: cliente e serviço são obrigatórios.
- Ao editar, mesmo modal pré-preenchido, com botão de excluir.

### 6. Bloqueio de horário
- Modal separado e mais simples: barbeiro, horário de início/fim, motivo (texto livre, ex: "Almoço", "Compromisso pessoal").
- Vira um card hachurado na grade, sem cliente associado.

### 7. Visão Semana
- Uma coluna por dia (não por barbeiro), com lista compacta dos agendamentos daquele dia (sem grade de horário detalhada).
- Clicar em um dia muda a view para "Dia" naquela data.

### 8. Visão Mês
- Calendário tradicional com indicador de quantidade/status de agendamentos por dia (pontinhos coloridos ou contador).
- Clicar em um dia muda a view para "Dia" naquela data.

### 9. Navegação e busca
- Botões de dia anterior/próximo (a granularidade do avanço muda conforme a view ativa: dia, semana ou mês).
- Botão "Hoje" para voltar rapidamente.
- Campo de busca que filtra a visão Dia por nome de cliente, destacando/isolando a coluna do barbeiro correspondente.

### 10. Responsivo / mobile
- Abaixo de ~760px, a visão Dia não mostra colunas lado a lado — vira seletor de barbeiro (abas horizontais com avatar + nome), mostrando um barbeiro por vez.
- Toque em slot vazio e toque em card devem funcionar via touch, não só mouse (cuidado ao portar drag-and-drop: use Pointer Events ao invés de só mouse events, pra funcionar em touch também).
- Todos os modais e o painel de detalhe devem ocupar a tela cheia ou quase cheia em mobile.

---

## Padrões técnicos a seguir

- Use os hooks/padrões de acesso a dados já existentes no projeto (não crie um padrão novo de fetching se já existe um).
- Toda escrita no Firestore deve respeitar o isolamento multi-tenant já em uso — nunca permita um agendamento, cliente ou bloqueio ser salvo/lido fora do tenant ativo.
- Se o projeto já usa Firestore Security Rules para enforcement de tenant, não confie só na query do client-side — confirme que as rules cobrem as novas operações de escrita deste módulo (update de status, drag-and-drop, bloqueio).
- Otimização de leitura: não fazer onSnapshot sem escopo (puxando todos os agendamentos de todos os tempos) — escopar a query pela data/intervalo exibido na view atual (dia, semana ou mês), igual ao que já foi diagnosticado como problema de performance no projeto Travessia.
- Mantenha a paleta e os tokens visuais já usados no admin (não introduza cores novas sem necessidade).
- Loading states e empty states (dia sem nenhum agendamento, busca sem resultado) precisam de tratamento visual, não só ausência de conteúdo.
- Otimistic UI no drag-and-drop e nas ações rápidas de status, com rollback visível se a escrita falhar (toast de erro).

## Entregável esperado

Implementação completa do módulo Agenda dentro da estrutura de pastas e convenções já existentes no projeto — não um componente isolado solto. Ao final, me dê um resumo do que foi criado/alterado, quais arquivos, e se algum dado do schema precisou ser estendido (e por quê).
