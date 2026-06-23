# O Cartel — SaaS de Barbearia (UI em React/Next.js)

Telas do O Cartel em **Next.js 15 (App Router) + TypeScript + React 19**, com **todas as telas e botões funcionais** mas **ainda sem banco de dados**. Fiel ao protótipo: paleta marrom/preto/off-white, tipografia Cinzel (marca) + Spectral (títulos) + Hanken Grotesk (UI).

Os dados ficam num **store no cliente** (`lib/store.tsx`, Context + reducer) alimentado por `lib/mock-data.ts` e **persistido em `localStorage`** (chave `ocartel:v1`). Criar/editar cliente, agendamento, pagamento, etc. funciona de verdade e **sobrevive ao reload**. Tudo foi desenhado para trocar o store por um banco depois sem reescrever as telas (cada ação do reducer ≈ um endpoint; `HYDRATE` ≈ o fetch inicial). Para voltar aos dados de exemplo: **Configurações → Restaurar dados de demonstração**.

## Rodar

```bash
cd o-cartel
npm install
npm run dev
```

Abra http://localhost:3000

## Telas / rotas

| Rota | Tela |
|---|---|
| `/dashboard` | Dashboard do admin (KPIs, faturamento com toggle 7d/30d/90d, próximos clicáveis, financeiro) |
| `/agenda` | Agenda Dia/Semana/Mês por barbeiro — navegar datas, bloquear horário, clicar bloco (confirmar/iniciar/concluir/no-show/cancelar), clicar vazio p/ criar |
| `/clientes` | Lista com filtros e busca + ficha; criar/editar cliente; novo agendamento |
| `/planos` | Planos & Serviços — CRUD de serviços (preço/duração) e edição dos planos de assinatura |
| `/pagamentos` | Transações com filtros/busca, "marcar como pago" e "lançar pagamento"; KPIs somados |
| `/configuracoes` | Dados da barbearia, horário, equipe (CRUD de barbeiros), sair e restaurar demo |
| `/super-admin` | Console SaaS (dark): abas Visão geral/Barbearias/Billing/Suporte; linha de barbearia abre drawer (suspender/trocar plano) |
| `/login` | Login + Onboarding (wizard de 3 passos) — botões navegam para o painel |
| `/book/qualquer-coisa` | Agendamento público (mobile) — "Confirmar" grava no store e aparece na agenda/dashboard |

`/` redireciona para `/dashboard`. `/login`, `/super-admin` e `/book/...` não estão no menu lateral (personas distintas) — acesse pela URL. **Fonte única:** um agendamento feito em `/book/...` aparece na `/agenda` e no `/dashboard`; concluir um atendimento gera uma transação em `/pagamentos`; adicionar um barbeiro em `/configuracoes` cria uma coluna na `/agenda`.

## Estrutura

```
app/
  layout.tsx              fontes (next/font) + reset
  page.tsx                redirect -> /dashboard
  globals.css
  login/page.tsx          Login / Onboarding (client)
  super-admin/page.tsx    Console SaaS (dark)
  book/[slug]/page.tsx    Booking público mobile (client)
  (admin)/
    layout.tsx            shell: Sidebar + Topbar (client, usePathname)
    dashboard/page.tsx
    agenda/page.tsx
    clientes/page.tsx     (client, seleção de cliente)
components/
  ui/        Card, StatusPill/Tag, Seal/Avatar, LineChart
  admin/     Sidebar, Topbar
lib/
  theme.ts        tokens de cor / fonte / sombra
  types.ts        tipos de domínio (espelham o schema Firestore pretendido)
  mock-data.ts    todos os dados de exemplo
  status.ts       mapas de status (pills, blocos da agenda, tags)
```

## Decisões

- **Estilo via inline styles** (objetos `React.CSSProperties`) com tokens centralizados em `lib/theme.ts`. Sem Tailwind por enquanto — fácil de migrar depois se quiser; os valores exatos (hex, px) já estão isolados em `theme.ts`/`status.ts`.
- **Sem dependências de UI/gráficos**: o gráfico é um componente SVG próprio (`components/ui/LineChart.tsx`).
- **Charts/calendário** desenhados com SVG + posicionamento absoluto (44px = 30 min na agenda).
- Server Components por padrão; `"use client"` só onde há estado (login, clientes, booking) ou `usePathname` (shell admin).

## Próximos passos sugeridos

1. Ligar Firebase (Auth com custom claims `role`/`tenantId`, Firestore por `tenants/{tenantId}/...`, Storage) — os tipos em `lib/types.ts` já espelham o schema.
2. Trocar `mock-data.ts` por fetchs reais / Server Actions.
3. RBAC: variar a visão por papel (admin vê tudo do tenant; barbeiro só o próprio).
4. (Opcional) migrar inline styles para Tailwind ou CSS Modules.
