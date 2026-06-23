# O Cartel — SaaS de Barbearia (Next.js + Firebase)

Telas do O Cartel em **Next.js 15 (App Router) + TypeScript + React 19**, agora com **Firebase Auth (e-mail/senha) + Firestore multi-tenant**. Fiel ao protótipo: paleta marrom/preto/off-white, tipografia Cinzel (marca) + Spectral (títulos) + Hanken Grotesk (UI).

Os dados ficam no **Firestore**, escopados por barbearia em `tenants/{tenantId}/...` (clientes, agendamentos, serviços, barbeiros, transações, config). O store no cliente (`lib/store.tsx`, Context + reducer) virou um **cache alimentado por listeners em tempo real** (`onSnapshot`): as escritas vão pelos repositórios em `lib/firebase/repos.ts` e o snapshot reflete de volta. O perfil do usuário (`users/{uid}` com `role`/`tenantId`) define o que ele acessa; `superAdmin` vê todas as barbearias no console `/super-admin`. O booking público (`/book/[slug]`) lê o catálogo da barbearia e grava por uma **server action** (Admin SDK).

## Rodar

1. **Crie um projeto** no [Firebase Console](https://console.firebase.google.com): habilite **Authentication → E-mail/senha**, crie o **Firestore** e registre um **app Web** para pegar as chaves.
2. **Configure o ambiente**: copie `.env.example` para `.env.local` e preencha as `NEXT_PUBLIC_FIREBASE_*`. Para desenvolver com os emuladores, deixe `NEXT_PUBLIC_USE_EMULATORS=true`.
3. **Instale e rode** (dois terminais):

```bash
cd o-cartel
npm install
npm run emulators   # Auth + Firestore + UI em http://localhost:4000
npm run dev         # app em http://localhost:3000
```

Abra http://localhost:3000 → **Criar barbearia** faz o onboarding (cria o tenant e o catálogo inicial).
Para promover um usuário a `superAdmin`: `npm run provision:super-admin -- voce@dominio.com` (com as variáveis do emulador exportadas).

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
| `/book/[slug]` | Agendamento público (mobile) — lê o catálogo da barbearia pelo slug e grava via server action; aparece na agenda/dashboard |

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
  book/[slug]/actions.ts  server action do booking (Admin SDK)
components/
  ui/        Card, StatusPill/Tag, Seal/Avatar, LineChart
  admin/     Sidebar, Topbar, modais
  auth/      AuthGuard (protege rotas + splash)
lib/
  theme.ts        tokens de cor / fonte / sombra
  types.ts        tipos de domínio (espelham o schema Firestore)
  mock-data.ts    sementes do onboarding + dados de exemplo dos gráficos
  status.ts       mapas de status (pills, blocos da agenda, tags)
  firebase/
    config.ts     init do SDK do cliente (+ emuladores)
    auth.tsx      AuthProvider / useAuth (onAuthStateChanged + users/{uid})
    repos.ts      repositórios por tenant (subscribe/add/update/remove)
    bootstrap.ts  cria tenant + perfil + catálogo no onboarding
    booking.ts    leitura pública do catálogo por slug
    admin.ts      Admin SDK (server-only)
firestore.rules   regras multi-tenant
firebase.json · apphosting.yaml   config de emuladores e deploy (App Hosting)
```

## Decisões

- **Estilo via inline styles** (objetos `React.CSSProperties`) com tokens centralizados em `lib/theme.ts`. Sem Tailwind por enquanto — fácil de migrar depois se quiser; os valores exatos (hex, px) já estão isolados em `theme.ts`/`status.ts`.
- **Sem dependências de UI/gráficos**: o gráfico é um componente SVG próprio (`components/ui/LineChart.tsx`).
- **Charts/calendário** desenhados com SVG + posicionamento absoluto (44px = 30 min na agenda).
- Server Components por padrão; `"use client"` só onde há estado (login, clientes, booking) ou `usePathname` (shell admin).

## Próximos passos sugeridos

1. **Storage** (adiado): foto de barbeiro / logo da barbearia — `storage.rules` já está como deny-all, basta abrir por tenant.
2. **Custom claims**: migrar `role`/`tenantId` para custom claims do Auth (reduz o custo do `get(users/{uid})` nas regras) e considerar **App Check** contra abuso.
3. **RBAC real**: hoje a "visão" no menu é cosmética; restringir os dados por papel (barbeiro vê só a própria agenda).
4. **Dados reais nos gráficos**: dashboard e `/super-admin` ainda usam séries de exemplo de `mock-data.ts` (faturamento, MRR, atividade).
5. (Opcional) migrar inline styles para Tailwind ou CSS Modules.
