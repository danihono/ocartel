# O Cartel — SaaS de Barbearia (Next.js + Firebase)

Telas do O Cartel em **Next.js 15 (App Router) + TypeScript + React 19**, agora com **Firebase Auth (e-mail/senha) + Firestore multi-tenant**. Fiel ao protótipo: paleta marrom/preto/off-white, tipografia Cinzel (marca) + Spectral (títulos) + Hanken Grotesk (UI).

Os dados ficam no **Firestore**, escopados por barbearia em `tenants/{tenantId}/...` (clientes, agendamentos, serviços, barbeiros, transações, config). O store no cliente (`lib/store.tsx`, Context + reducer) virou um **cache alimentado por listeners em tempo real** (`onSnapshot`): as escritas vão pelos repositórios em `lib/firebase/repos.ts` e o snapshot reflete de volta. O perfil do usuário (`users/{uid}` com `role`/`tenantId`/`barbeiroId`), espelhado nos **custom claims** do Auth, define o que ele acessa: o `admin` administra a própria barbearia, o `barbeiro` só enxerga a agenda dele (sem financeiro) e o `superAdmin` vê todas no console `/super-admin`. O booking público (`/book/[slug]`) lê o catálogo da barbearia e grava por uma **server action** (Admin SDK).

## Rodar

1. **Crie um projeto** no [Firebase Console](https://console.firebase.google.com): habilite **Authentication → E-mail/senha**, crie o **Firestore** e registre um **app Web** para pegar as chaves.
2. **Configure o ambiente**: copie `.env.example` para `.env.local` e preencha as `NEXT_PUBLIC_FIREBASE_*`. Para desenvolver com os emuladores, deixe `NEXT_PUBLIC_USE_EMULATORS=true`.
3. **Instale e rode** (dois terminais):

```bash
cd o-cartel
npm install
npm run emulators   # Auth + Firestore + Storage + UI em http://localhost:4000
npm run dev         # app em http://localhost:3000
```

Abra http://localhost:3000 → **Criar barbearia** faz o onboarding (cria o tenant e o catálogo inicial).
Para promover um usuário a `superAdmin`: `npm run provision:super-admin -- voce@dominio.com` (com as variáveis do emulador exportadas).

## Qualidade (lint / tipos / testes)

```bash
npm run lint      # ESLint (next lint)
npx tsc --noEmit  # checagem de tipos
npm test          # testes unitários (vitest) da lógica pura
npm run build     # build de produção
```

Os testes cobrem os módulos puros em `tests/`: `lib/date`, `lib/agenda`,
`lib/selectors`, `lib/clientes-import`, `lib/claims`, `lib/mensalidades`,
`lib/rate-limit`, `lib/gestao-agendamento` e `lib/saas-metrics`. O CI (`.github/workflows/ci.yml`) roda lint +
tipos + testes + build a cada push/PR.

## Telas / rotas

| Rota | Tela |
|---|---|
| `/dashboard` | Dashboard do admin (KPIs, faturamento com toggle 7d/30d/90d, próximos clicáveis, financeiro) |
| `/agenda` | Agenda Dia/Semana/Mês por barbeiro — navegar datas, bloquear horário, clicar bloco (confirmar/iniciar/concluir/no-show/cancelar), clicar vazio p/ criar |
| `/clientes` | Lista com filtros e busca + ficha; criar/editar cliente; novo agendamento |
| `/planos` | Planos & Serviços — CRUD de serviços (preço/duração) e edição dos planos de assinatura |
| `/pagamentos` | Transações com filtros/busca, "marcar como pago" e "lançar pagamento"; KPIs somados |
| `/configuracoes` | Dados da barbearia (com logo), horário, equipe (CRUD de barbeiros, foto e acesso de login) e sair |
| `/super-admin` | Console SaaS (dark): abas Visão geral/Barbearias/Billing/Suporte; linha de barbearia abre drawer (suspender/trocar plano) |
| `/login` | Login + Onboarding (wizard de 3 passos) — botões navegam para o painel |
| `/book/[slug]` | Agendamento público (mobile) — lê o catálogo da barbearia pelo slug e grava via server action; aparece na agenda/dashboard |
| `/book/[slug]/agendamento/[token]` | O cliente cancela ou remarca o próprio horário pelo link recebido na confirmação (sem conta) |
| `/barbeiro` | Tela do barbeiro (mobile) — só a própria agenda, clientes e resumo do dia |

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
  claims.ts       espelho users/{uid} -> custom claims (puro)
  mensalidades.ts regra de geração do ciclo, compartilhada pelo botão e pelo job
  rate-limit.ts   freio do booking público (decisão pura + contador transacional)
  saas-metrics.ts KPIs e série do console, derivados dos tenants
  status.ts       mapas de status (pills, blocos da agenda, tags)
  firebase/
    config.ts     init do SDK do cliente (+ emuladores)
    auth.tsx      AuthProvider / useAuth (onAuthStateChanged + users/{uid})
    repos.ts      repositórios por tenant (subscribe/add/update/remove)
    bootstrap.ts  cria tenant + perfil + catálogo no onboarding
    booking.ts    leitura pública do catálogo por slug
    admin.ts      Admin SDK (server-only)
firestore.rules · storage.rules   regras multi-tenant (papéis, suspensão, uploads)
firestore.indexes.json            índice composto da agenda do barbeiro
firebase.json · apphosting.yaml   config de emuladores e deploy (App Hosting)
```

## Decisões

- **Estilo via inline styles** (objetos `React.CSSProperties`) com tokens centralizados em `lib/theme.ts`. Sem Tailwind por enquanto — fácil de migrar depois se quiser; os valores exatos (hex, px) já estão isolados em `theme.ts`/`status.ts`.
- **Sem dependências de UI/gráficos**: o gráfico é um componente SVG próprio (`components/ui/LineChart.tsx`).
- **Charts/calendário** desenhados com SVG + posicionamento absoluto (44px = 30 min na agenda).
- Server Components por padrão; `"use client"` só onde há estado (login, clientes, booking) ou `usePathname` (shell admin).

## Operação

**Custom claims.** `role`/`tenantId`/`barbeiroId` são espelhados do doc `users/{uid}`
nos custom claims do Auth (`lib/claims.ts`). As regras leem o claim e só caem no
`get(users/{uid})` — que é uma leitura cobrada por operação — para quem ainda não
migrou. O app ressincroniza sozinho no primeiro acesso de cada usuário; para
adiantar todos de uma vez:

```bash
npm run backfill:claims -- --dry   # mostra o que mudaria
npm run backfill:claims
```

Quando ninguém mais depender do fallback, ele pode sair de `firestore.rules`.

**Acesso do barbeiro.** Criado em `/configuracoes` → Equipe → "Criar acesso"
(e-mail + senha temporária, combinada pessoalmente). O barbeiro entra pelo
`/login` e cai na própria agenda; ele não enxerga financeiro nem a agenda dos
colegas. Remover um barbeiro encerra o login junto.

**Suspensão.** No console `/super-admin`, "Suspender" põe a barbearia em somente
leitura: as escritas param, o booking público recusa e o painel dela mostra uma
faixa explicando. `atrasado` é só sinalização de cobrança e não bloqueia nada.

**Job mensal de cobrança.** `POST /api/cron/mensalidades` gera as mensalidades do
ciclo em todas as barbearias e grava o retrato mensal do SaaS. Protegido por
`CRON_SECRET` (Secret Manager em produção — ver `apphosting.yaml`). Agende no
Cloud Scheduler **diariamente**: cada plano tem seu dia de vencimento, e a
geração é idempotente, então repetir não duplica.

```bash
curl -X POST https://<host>/api/cron/mensalidades -H "Authorization: Bearer $CRON_SECRET"
```

**Índices.** A agenda do barbeiro precisa do índice composto em
`firestore.indexes.json` (`firebase deploy --only firestore:indexes`).

## Próximos passos sugeridos

1. **Canal com o cliente** (e-mail/WhatsApp): lembrete de horário e envio do link
   de gestão do agendamento — hoje ele só aparece na tela de confirmação.
2. **Gateway de pagamento**: as cobranças são geradas e baixadas à mão; falta
   cobrar de fato (o campo `source` da transação já prevê `"gateway"`).
3. **App Check** no booking público, além do rate limit que já existe — o ponto de
   plug está documentado em `lib/firebase/config.ts` (exige chave do reCAPTCHA).
4. **Dados reais no dashboard**: o `/super-admin` já saiu do mock; o gráfico de
   faturamento do `/dashboard` ainda usa série de exemplo.
5. (Opcional) migrar inline styles para Tailwind ou CSS Modules.
