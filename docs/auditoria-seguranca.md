# Auditoria de segurança — O Cartel (sistema web + Firebase)

**Projeto:** `ocartel-497f8` · **Escopo:** sistema web e infraestrutura Firebase (não há app
de celular) · **Data:** 2026-09-08 · **Base analisada:** `main` @ `2c641e1`

## Sumário

A revisão encontrou **uma falha crítica diretamente explorável**: qualquer pessoa capaz de
criar uma conta no sistema — o cadastro é aberto — podia se declarar administradora de
**qualquer outra barbearia** e, com isso, ler, alterar e apagar todos os dados dela,
incluindo a **chave de API do gateway de cobrança** e o **histórico completo de conversas de
WhatsApp** dos clientes. O ataque não exigia acesso prévio, ferramenta especial nem passar
pela interface do sistema.

Foram identificados 13 achados. Todos os que dependiam de código ou de regras foram
corrigidos nesta entrega e cobertos por testes automatizados. Sete itens dependem do Console
do Firebase e **precisam da sua confirmação** — estão na seção "O que não pude verificar".

| Gravidade | Achados |
|---|---|
| Crítico | F-01 |
| Alto | F-02, F-03 |
| Médio-alto | F-04, F-05 |
| Médio | F-06, F-07, F-08, F-09 |
| Baixo-médio | F-10, F-11 |
| Baixo | F-12, F-13 |

### Como as evidências foram obtidas

Legenda usada em cada achado:

- **[PROVADO]** — reproduzido em teste automatizado contra o **emulador** do Firestore.
  A suíte está em `tests/rules/firestore.test.ts` e roda com `npm run test:rules`.
- **[REVISÃO]** — identificado lendo o código ou a configuração; a conclusão vem da leitura,
  não de uma execução.
- **[NÃO VERIFICADO]** — depende de acesso ao Console/CLI do projeto, que eu não tenho.

**Nada foi testado, alterado ou consultado em produção.** Nenhum dado real foi acessado.

A prova dos achados de regras é reproduzível: a MESMA suíte, rodada contra as regras
antigas, falha em 13 dos 24 casos — ou seja, os ataques passavam.

```bash
# ataque passando (regras antigas)  → 13 failed | 11 passed
git show <commit-anterior>:firestore.rules > /tmp/antigas.rules
RULES_FILE=/tmp/antigas.rules npm run test:rules

# depois da correção               → 24 passed
npm run test:rules
```

---

## Serviços Firebase efetivamente em uso

Levantado a partir de `firebase.json`, `.firebaserc`, `apphosting.yaml` e do código.

| Serviço | Situação |
|---|---|
| **Hosting + `frameworksBackend`** | Em uso. O SSR do Next.js roda numa Cloud Function (`us-central1`); é de lá que sai `ocartel-497f8.web.app`. Publicação manual (`npm run deploy`). |
| **Authentication** | Em uso. E-mail/senha, **auto-cadastro aberto**, recuperação de senha. |
| **Cloud Firestore** | Em uso. Banco único do sistema, lido ao vivo pelo navegador (`onSnapshot`). |
| **Cloud Functions (2ª geração)** | Em uso. Uma função: `atendenteWhatsapp`, gatilho de criação de documento; ela só repassa o evento para `/api/ia/responder`. |
| **Secret Manager** | Em uso. `GEMINI_API_KEY`, `IA_SECRET` (e, após esta correção, os dois segredos dos disparadores). |
| **Cloud Storage** | **Não usado.** `storage.rules` nega tudo. Não há upload em nenhuma tela. |
| **App Check** | **Não implementado** (corrigido parcialmente — ver F-06). |
| **App Hosting** | **Não usado.** `apphosting.yaml` existe, mas o deploy do projeto o ignora (README §Publicar, item 4). |

Fora do Firebase: Gemini (REST), Asaas (boleto) e um daemon Baileys de WhatsApp que vive em
outro repositório e escreve no Firestore com o Admin SDK.

**Sobre a seção 5 do escopo (arquivos e documentos):** o sistema **não usa Cloud Storage**.
Não há upload, download, link de compartilhamento nem anexo em nenhum ponto. As regras já
negam tudo, e não havia o que testar além de confirmar que o repositório reflete o que está
publicado (item K6). Se um dia entrar upload (foto de barbeiro, logo), as regras precisam
nascer escopadas por tenant, com limite de tamanho e de tipo — não é o caso hoje.

---

## Achados

### F-01 · CRÍTICO — Tomada de controle de qualquer barbearia por auto-cadastro
**[PROVADO]** · Componente: `firestore.rules` (regra de `users/{uid}`), `app/login/page.tsx`,
`lib/firebase/bootstrap.ts` · Prioridade: **imediata**

**O problema.** A regra que criava o perfil do usuário era:

```
allow create: if request.auth.uid == uid
  && request.resource.data.role == 'admin'
  && request.resource.data.keys().hasAll(['role','tenantId','nome','email']);
```

Ela conferia que o documento era o do próprio usuário e que o papel era `admin` — mas **não
conferia o `tenantId` contra nada**. Como todo o controle de acesso do sistema se apoia nesse
campo (`owns(tenantId)` nas regras, e `exigirQuemGerencia` no servidor), quem escolhesse o
`tenantId` escolhia de qual barbearia era dono.

**Cadeia de exploração, do zero:**

1. Listar `tenants` sem estar logado e anotar os `tenantId` (F-02).
2. Criar uma conta pelo `/login` — o cadastro é aberto.
3. Gravar, direto na API do Firestore e sem passar pela interface:
   `users/{meuUid} = { role:'admin', tenantId:'<vítima>', nome:'x', email:'x' }`.
4. A partir daí, com a sessão comum do navegador:
   - **ler, alterar e apagar** `clientes`, `transacoes`, `agendamentos`, `planos`, `config`,
     `servicos` e `barbeiros` da vítima;
   - ler `tenants/{vítima}/private/asaas` — **a chave de API do gateway de cobrança**, o
     ambiente (produção/sandbox) e o `webhookToken`;
   - ler `tenants/{vítima}/private/whatsapp` — o vínculo da sessão de WhatsApp;
   - ler `users/barbearia-{vítima}/contacts/**` — **todas as conversas de WhatsApp** da
     barbearia, mensagem por mensagem.
5. E, porque `exigirQuemGerencia()` confiava no mesmo campo, também passar nas server actions
   com Admin SDK: **parear ou desconectar o WhatsApp** da vítima, **enviar mensagem em nome
   dela** para qualquer número, confirmar/descartar sugestões e criar agendamentos.

**Impacto.** Comprometimento total de qualquer barbearia do sistema: dados pessoais de
clientes (LGPD), financeiro, credencial de pagamento e o canal de comunicação com os clientes.

**Correção aplicada.**
- `users/{uid}` passou a ser **somente-leitura para o navegador**: `create` negado, `update`
  do próprio dono limitado ao campo `nome`, `list` negado.
- O onboarding foi movido para o servidor: `lib/onboarding.ts` (Admin SDK) decide o papel e o
  vínculo, exposto por `app/login/actions.ts` (`acaoCriarBarbearia`). O navegador só cria a
  conta no Auth e manda o id token; o e-mail gravado vem **do token**, não do formulário.
- A action recusa quem já tem perfil — sem isso, uma conta existente chamaria a action de novo
  para trocar de barbearia.
- `lib/firebase/bootstrap.ts` (o bootstrap que rodava no navegador) foi **removido**.
- O servidor grava também custom claims `{ role, tenantId }`, preparando a migração das
  regras para claims.

**Como testar que resolveu.** `npm run test:rules` — bloco “F-01”. O caso
*“conta nova NÃO cria o próprio perfil apontando para a barbearia de outro”* é literalmente o
passo 3 do ataque. E o teste funcional: criar uma barbearia pelo `/login` no emulador deve
continuar funcionando de ponta a ponta.

---

### F-02 · ALTO — Catálogo de barbearias público e enumerável
**[PROVADO]** · Componente: `firestore.rules` (`/tenants/{t}` e `/slugs/{slug}`)

**O problema.** Ambos eram `allow read: if true`. Em Firestore, `read` cobre `get` **e**
`list` — então, **sem nenhuma autenticação**, era possível baixar a coleção `tenants` inteira
e obter, de cada barbearia: nome, slug, cidade, plano, status, **MRR** e **`ownerUid`**. O
mesmo em `slugs`. A coleção `config` também era listável por completo.

**Impacto.** Vazamento da carteira de clientes do SaaS e do faturamento por cliente. E, pior,
é o passo 1 do F-01: era daqui que saía a lista de `tenantId` para atacar.

**Correção aplicada.** `get`/`list` separados em todo lugar. `tenants`: `get` só para quem
pertence ao tenant, `list` só para superAdmin (o console precisa). `slugs`: `get` público
(o visitante chega com o slug na URL), `list` negado. `config`: `get` público, `list` negado.
A vitrine deixou de ler o doc do tenant — `lib/firebase/booking.ts` agora monta a página com
`slugs/{slug}` + `config/main` + `servicos` + `barbeiros`, e o nome da barbearia vem de
`config/main`, onde ele já estava.

**Como testar.** Bloco “F-02”, que verifica os dois lados: o visitante não lista nada, **e** a
vitrine pública continua carregando sem login.

---

### F-03 · ALTO — O papel `barbeiro` tinha os mesmos poderes do `admin`
**[PROVADO]** · Componente: `firestore.rules` (`owns()`/`canManage()`)

**O problema.** As regras só distinguiam `superAdmin` de “pertence ao tenant”. Qualquer conta
com `role: 'barbeiro'` lia e escrevia o financeiro inteiro e **lia `private/asaas`** — a chave
do gateway de cobrança. O README já registrava a pendência (“RBAC real”).

**Correção aplicada.** As regras passaram a ter dois níveis dentro do tenant:
`podeVer()` (admin e barbeiro) e `canManage()` (só admin, além do superAdmin).
O barbeiro continua vendo a agenda, o cadastro e os lançamentos — e trabalhando na agenda,
que é a tela dele —, mas perdeu: `private/**`, escrita no financeiro, escrita no catálogo,
escrita na config e exclusão de cliente/agendamento/transação.

**Como testar.** Bloco “F-03”, que inclui os casos de não-regressão da tela `/barbeiro`
(listar agenda e clientes, criar bloqueio de horário).

---

### F-04 · MÉDIO-ALTO — Criação livre de tenants e squatting de slugs
**[PROVADO]** · Componente: `firestore.rules` (`/tenants` e `/slugs`, `create if signedIn()`)

**O problema.** Qualquer conta autenticada criava barbearias ilimitadas e reservava quantos
slugs quisesse — inclusive tomando `barbearia-do-joao` antes do João, o que trava o onboarding
dele. Cada documento criado é custo (armazenamento + índices).

**Correção aplicada.** `create` negado no cliente para os dois; a criação passou a ser
exclusividade do servidor (`lib/onboarding.ts`), que reserva o slug numa transação.

---

### F-05 · MÉDIO-ALTO — Portas públicas sem nenhum freio contra robôs
**[REVISÃO]** · Componente: `app/book/[slug]/actions.ts`, `app/c/[codigo]/actions.ts`

**O problema.** `criarAgendamentoPublico` é chamável por qualquer um, sem login, sem CAPTCHA e
sem limite. Cada chamada faz leituras, roda uma transação e pode **criar um documento em
`clientes`**. Um script lota a agenda de uma barbearia (prejuízo operacional imediato: horários
ocupados que ninguém vai honrar), polui o cadastro e infla a fatura do Firebase.
`disponibilidadePublica` e `/c/[codigo]` amplificam leitura do mesmo jeito.

**Correção aplicada.** Novo `lib/ratelimit.ts`: janela fixa contada **no Firestore** (não em
memória — o SSR roda em Cloud Functions e cada instância teria o próprio contador), chaveada
por IP de origem. Aplicado em agendar (8 por 10 min), consultar disponibilidade (120 por
10 min), confirmação (30 por 10 min) e no webhook do Asaas (120 por min). O freio **falha
aberto** de propósito: se o Firestore não responder, a barbearia continua recebendo
agendamento — derrubar booking legítimo seria trocar um risco hipotético por prejuízo real.

**Limitação honesta.** IP não é identidade forte: dá para distribuir o ataque e vários
clientes legítimos compartilham IP. Isto é uma barreira contra script simples, não um controle
de acesso. A camada que falta é App Check (F-06) e, se o abuso aparecer, um CAPTCHA no
formulário público.

**Ação sua:** configure a política de **TTL** do Firestore sobre o campo
`rateLimits.expireAt`, para os baldes vencidos serem apagados sem custo de manutenção.

**Como testar.** Chamar o booking público 9 vezes seguidas no emulador: a 9ª deve responder
“Muitas tentativas”. Um agendamento normal, isolado, não pode ser afetado.

---

### F-06 · MÉDIO — App Check ausente
**[REVISÃO]** + **[NÃO VERIFICADO]** (enforcement) · Componente: projeto inteiro

**O problema.** Não havia uma linha de App Check no código. O Firestore aceita tráfego de
qualquer cliente que use a configuração pública do app — que, corretamente, é pública. As
coleções da vitrine podem ser raspadas e a cota consumida direto em
`firestore.googleapis.com`, sem passar pelo site.

**Correção aplicada.** `lib/firebase/config.ts` inicializa App Check com reCAPTCHA v3 **quando
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` existe**. Sem a variável, nada muda — dá para publicar o
resto das correções antes de registrar o site.

**Ação sua**, nesta ordem: registrar o app Web em App Check → publicar com a chave → observar
as métricas em **modo não obrigatório** → só então **exigir** App Check no Firestore.
Exigir antes de olhar as métricas derruba usuários legítimos.

**Trate como camada complementar.** App Check não substitui autenticação nem as regras, e não
protege as server actions (que não passam pelo SDK do cliente).

---

### F-07 · MÉDIO — Token válido por até 1 hora depois de revogar o acesso
**[REVISÃO]** · Componente: `lib/canal/autorizacao.ts` (agora `lib/autorizacao.ts`)

**O problema.** `verifyIdToken(idToken)` era chamado **sem** `checkRevoked`. Bloquear ou
excluir a conta no Auth não invalidava o token já emitido: as server actions com Admin SDK
continuavam aceitando por até uma hora — justamente a janela em que revogar o acesso mais
importa. (Do lado das regras a situação já era correta: apagar `users/{uid}` corta o acesso
na hora, porque as regras releem o perfil a cada avaliação.)

**Correção aplicada.** `verifyIdToken(idToken, true)` em todos os caminhos de autorização do
servidor.

**Ação sua.** Não existe fluxo de bloqueio de conta no sistema. Para cortar um acesso hoje:
apagar `users/{uid}` (corta as regras na hora) **e** rodar
`auth.updateUser(uid, { disabled: true })` + `auth.revokeRefreshTokens(uid)` (corta as actions
na hora, agora que `checkRevoked` está ligado). Vale transformar isso numa tela do console do
superAdmin.

---

### F-08 · MÉDIO — Segredos dos disparadores não chegavam à produção
**[REVISÃO]** + **[NÃO VERIFICADO]** · Componente: `firebase.json`

**O problema.** `/api/cobrancas/ciclo` lê `COBRANCAS_SECRET` e `/api/confirmacoes/disparar` lê
`CONFIRMACOES_SECRET`, mas `hosting.frameworksBackend.secrets` declarava apenas
`GEMINI_API_KEY` e `IA_SECRET`. Em produção o SSR não enxergava os dois, e as rotas
respondiam 500 — **falham fechadas**, que é o comportamento certo, mas significa que a
cobrança automática e as confirmações do dia não funcionavam. O risco de segurança é o
“conserto” óbvio e errado: colar o segredo em `.env.production`, que é versionado e público.

**Correção aplicada.** Os dois passaram a ser declarados em `firebase.json`.

**Ação sua.** `firebase functions:secrets:set COBRANCAS_SECRET` e o mesmo para
`CONFIRMACOES_SECRET` **antes** do próximo deploy — segredo declarado que não existe no Secret
Manager faz o deploy falhar.

---

### F-09 · MÉDIO — O comando de publicação não publicava as regras
**[REVISÃO]** · Componente: `package.json`

**O problema.** `"deploy": "firebase deploy --only hosting"`. As regras do Firestore e do
Storage **nunca subiam** por esse comando. Nada garante que o que está publicado hoje seja o
que está no repositório — inclusive as regras que eu analisei.

**Correção aplicada.** `deploy` passou a ser
`firebase deploy --only hosting,firestore:rules,storage`, e existe um `deploy:rules` isolado
para publicar só as regras. Documentado no README.

**Ação sua (K1).** Confirme o que está publicado hoje antes de qualquer coisa —
se as regras em produção forem ainda mais permissivas que as que eu li, a urgência aumenta.

---

### F-10 · BAIXO-MÉDIO — Comparação de segredo sem tempo constante
**[REVISÃO]** · Componente: as três rotas de disparo

`req.headers.get('x-cobrancas-secret') !== segredo` compara com atalho: sai no primeiro
caractere diferente. Pela rede o ataque de temporização é impraticável, mas o projeto já tinha
`tokenConfere()` fazendo a comparação certa (usada no webhook do Asaas) — não custava nada.

**Correção aplicada.** As três rotas passaram a usar `tokenConfere()`.

---

### F-11 · BAIXO-MÉDIO — Webhook lia o Firestore antes de autenticar
**[REVISÃO]** · Componente: `app/api/cobrancas/webhook/asaas/route.ts`

A rota é pública (o Asaas precisa alcançá-la) e resolvia as credenciais do tenant a partir do
**corpo** da requisição antes de validar o token — ou seja, uma requisição forjada custava uma
leitura no Firestore antes de ser recusada. A autenticação em si estava correta.

**Correção aplicada.** O freio de taxa roda antes de qualquer leitura.

---

### F-12 · BAIXO — Mensagem de erro interna chegava ao navegador
**[REVISÃO]** · Componente: `comoResultado()`

Devolvia `err.message` cru: uma exceção inesperada do Firestore descreve caminho de coleção,
projeto e estado interno para quem estiver do outro lado.

**Correção aplicada.** Só um `ErroVisivel` (mensagem escrita para o usuário) chega ao
navegador; o resto vira mensagem genérica e o erro real vai para o log do servidor.

---

### F-13 · BAIXO — `config/main` é público e não validava campos
**[PROVADO]** · Componente: `firestore.rules`

`config/main` precisa ser legível publicamente (alimenta a vitrine) e a escrita não tinha
nenhuma restrição de campo. Nada impedia um admin — ou um código futuro — de gravar uma chave
ali e torná-la pública para a internet inteira. A coleção `config` também era listável.

**Correção aplicada.** `list` negado, e a escrita recusa qualquer documento que contenha as
chaves `apiKey`, `webhookToken`, `token`, `secret` ou `senha`.

---

## O que foi verificado e está correto

Não são suposições: cada item abaixo foi conferido no código.

- **Nenhum segredo real no repositório ou no histórico.** Varri todos os commits: não há
  `serviceAccount.json`, nenhum `BEGIN PRIVATE KEY`, nenhum `private_key`. O `.gitignore`
  cobre os padrões certos (`serviceAccount.json`, `*-firebase-adminsdk-*.json`, `.env*.local`).
  `functions/.env` é versionado de propósito e contém só `SITE_URL`.
- **`.env.production` e `apphosting.yaml` NÃO são vazamento de segredo.** São variáveis
  `NEXT_PUBLIC_*`: a configuração pública do app Web, que vai para o navegador de qualquer
  visitante por definição. A proteção dos dados vem das regras, não de esconder isso. (A chave
  ainda merece restrição de uso — item K3, que é higiene, não vazamento.)
- **Booking e confirmação são autoritativos no servidor.** `criarAgendamentoValidado` lê
  preço, duração e expediente **do Firestore**, nunca do payload; a checagem de conflito de
  horário roda **dentro de uma transação**, então dois agendamentos simultâneos no mesmo
  horário não passam os dois (sem TOCTOU). Trocar identificadores ou status pelo navegador não
  produz efeito: a IA nunca marca nada sozinha — ela grava uma sugestão, e o agendamento só
  nasce quando alguém autorizado clica, pela mesma função validada.
- **O token do link de confirmação** tem ~90 bits de entropia e é comparado em tempo constante.
- **As travas de auditoria das transações** estão certas: `amount` é imutável, marcar como
  “pago” exige `paidAt` e `amountReceived`, e `boleto`/`alertaEnviadoEm` (as travas de
  idempotência do ciclo de cobrança) não podem ser reescritas pelo navegador — apagá-las faria
  o sistema cobrar a mesma pessoa duas vezes.
- **Os caminhos do daemon de WhatsApp** (`whatsappStatus`, `whatsappDaemon`, `waCommands`) não
  têm regra e portanto são negados por padrão para o navegador. O espelho de conversas é
  somente-leitura para o cliente; escrever é exclusividade do Admin SDK.
- **A recuperação de senha não revela** se a conta existe.
- **A Cloud Function é deliberadamente burra**: valida o prefixo do uid, descarta mensagem
  própria/antiga/de histórico e repassa. Ela não é HTTP — é gatilho de Firestore, então não há
  endpoint público para invocar.
- **Cloud Storage não é usado** e as regras negam tudo.

---

## O que não pude verificar (preciso de você)

Não tenho credenciais do projeto Firebase. **Nenhum item abaixo pode ser tratado como “ok”
sem confirmação** — em especial o K1 e o K2, que mudam a leitura de tudo o que está acima.

| # | Verificar | Onde | Por que importa |
|---|---|---|---|
| **K1** | As regras **publicadas** são as do repositório? | Console → Firestore → Regras (aba de histórico) ou `firebase firestore:rules:get` | O deploy do projeto não publicava regras (F-09). Se o que está no ar for mais permissivo, a urgência é maior |
| **K2** | **Login anônimo está desativado?** | Console → Authentication → Sign-in method | Se estiver ligado, o F-01 era explorável sem sequer criar um e-mail, e qualquer visitante virava “usuário autenticado” |
| K3 | Restrições da chave de API Web (referrers HTTP + APIs permitidas) | Google Cloud → APIs e serviços → Credenciais | Não é segredo, mas restringir corta uso da chave fora do seu site |
| K4 | App Check: app registrado e status de enforcement por serviço | Console → App Check | F-06 |
| K5 | Proteção contra enumeração de e-mail, política de senha, cota de cadastro | Console → Authentication → Settings | O cadastro é aberto: hoje a senha mínima é 6 caracteres (mínimo do Firebase) e o e-mail não precisa ser verificado |
| K6 | Regras de Storage publicadas = negar tudo | Console → Storage → Regras | Confirmar que o repositório reflete o real |
| K7 | Quem tem Owner/Editor/Firebase Admin; contas de serviço; quem publica | Google Cloud → IAM | Item 7 do escopo. A publicação é manual, da máquina de quem tiver as credenciais — não há automação de deploy para auditar |
| K8 | Segredos: existência, quem acessa, última rotação | Secret Manager | `GEMINI_API_KEY`, `IA_SECRET` + os dois de F-08 |
| K9 | PITR e/ou exportações agendadas do Firestore, com **restauração testada** | Console → Firestore → Backups | Não há nada sobre backup no repositório. Backup sem restauração validada não é backup |
| K10 | Alerta de orçamento e alertas de anomalia (leituras, escritas, invocações) | Cloud Billing / Cloud Monitoring | Boa parte do risco de abuso aqui é de **custo**, e hoje nada avisa |
| K11 | Não existe ambiente de homologação (`.firebaserc` só tem `default`) | — | Teste e produção são o mesmo projeto. Recomendo criar um projeto de homologação antes de qualquer teste ativo |

---

## Ordem de execução recomendada

1. **Confirmar K1 e K2** — antes de qualquer outra coisa.
2. **Publicar as regras corrigidas** (`npm run deploy:rules`) e o site com o onboarding novo.
   As duas coisas andam juntas: as regras novas negam a escrita que o onboarding antigo fazia,
   então publicar só as regras quebraria o cadastro, e publicar só o site deixaria a falha
   aberta. **Publique os dois na mesma janela** — é o que `npm run deploy` faz agora.
3. **Rotacionar as chaves do Asaas** de todas as barbearias, se K1 confirmar que as regras
   permissivas estiveram no ar. Não há como saber se alguém já leu `private/asaas`; sem log de
   acesso a documento, rotacionar é a única resposta honesta.
4. Criar os dois segredos no Secret Manager (F-08).
5. Configurar a política de TTL sobre `rateLimits.expireAt` (F-05).
6. Registrar App Check e acompanhar em modo não obrigatório antes de exigir (F-06).
7. Backups com restauração testada (K9) e alerta de orçamento (K10).
8. Criar o projeto de homologação (K11).

## Uma coisa que este relatório não faz

Não afirma que o sistema está seguro. Afirma que 13 falhas específicas foram encontradas, que
as que dependiam de código e de regras foram corrigidas e cobertas por teste, e que sete
pontos seguem em aberto porque dependem do Console. Um teste de intrusão contra o ambiente
publicado — que eu não fiz, por não ter acesso e por não ser prudente contra produção — é o
próximo passo natural depois que K1 a K11 estiverem fechados.
