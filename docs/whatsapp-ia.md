# O atendente automático

Um Gemini responde o WhatsApp da barbearia com o que ela tem de verdade — serviços, preços
e a agenda real — e **sugere** agendamento. Quem marca é uma pessoa, com um clique.

## A regra que carrega o resto

**A IA nunca marca.** Ela grava uma *sugestão*, que:

- não ocupa o horário;
- não impede outra pessoa de pegar o mesmo horário;
- aparece na conversa e na Agenda, tracejada, com **Confirmar** e **Descartar**.

Só no clique de confirmar o agendamento nasce — pela mesma `criarAgendamentoValidado` do
agendamento público, com a mesma transação. Se o horário foi tomado entre a sugestão e o
clique, a confirmação **recusa** e explica; a sugestão continua pendente para a barbearia
decidir.

Isso não é excesso de cuidado. Um horário prometido por robô e não cumprido é um cliente
parado na porta — e é a barbearia que dá a cara.

## O caminho de uma mensagem

```
cliente escreve
  → daemon espelha em users/barbearia-{t}/contacts/{c}/messages/{m}
  → Cloud Function acorda (functions/src/index.ts) e avisa o site
  → POST /api/ia/responder
       espera 8s e só segue se ainda for a última mensagem
       carrega o contexto: barbearia, serviços, o cliente (pelo vínculo), últimas 20 msgs
       Gemini responde; pode chamar horarios_livres(...) quantas vezes precisar
       fechou um horário? valida e grava uma SUGESTÃO
       a resposta sai pelo canal de sempre e ganha o selo "IA" na conversa
  → a pessoa confirma na Agenda ou na conversa
```

**A Function é burra de propósito.** Toda a lógica mora no site, onde `lib/agenda`,
`lib/booking-core` e `lib/canal` já existem e são testados. Uma segunda cópia da regra de
horário livre num pacote separado seria a forma mais rápida de a IA oferecer um horário que
a barbearia não tem. A Function só descarta o que não vale uma chamada HTTP (mensagem
nossa, histórico, mensagem velha, uid que não é de barbearia) e repassa o resto.

## O que impede a IA de inventar horário

O modelo não adivinha agenda: ele tem a ferramenta `horarios_livres`, que o servidor
responde com `intervalosOcupados` + `slotsLivres` — as mesmas funções do agendamento
público. O prompt proíbe oferecer horário que não tenha voltado dela, e a sugestão é
**revalidada** antes de ser gravada (`validarProposta`). Serviço inexistente, barbeiro de
outra barbearia, data passada, dia fechado, horário que não cabe antes de fechar ou já
ocupado: a sugestão não nasce, e o modelo recebe o motivo para se corrigir na mesma
conversa.

## Os freios

| Freio | Por quê |
|---|---|
| Interruptor por barbearia (Configurações) | ausente ⇒ desligado; nenhuma barbearia começa a responder sozinha |
| Nunca responde `fromMe` | senão o robô conversa com ele mesmo |
| Ignora `importedFromHistory` e mensagem com mais de 5 min | uma importação de histórico faria a IA responder meses de conversa de uma vez |
| Nada de grupo (`@g.us`) | responder num grupo é falar com dezenas de pessoas |
| Espera 8 s e só responde a última mensagem | três mensagens seguidas recebem **uma** resposta |
| Teto de 30 respostas por conversa/dia | freio contra laço e contra susto na fatura |
| Responder à mão pausa a IA por 4 h naquela conversa | duas vozes respondendo o mesmo cliente é pior que nenhuma |
| Mídia sem legenda não é respondida | marca a conversa como "precisa de gente" |

## Ligar

### 1. Chaves

| Onde | Variável | O que é |
|---|---|---|
| Site | `GEMINI_API_KEY` | chave do Google AI Studio |
| Site | `IA_SECRET` | segredo compartilhado com a Function |
| Site (opcional) | `GEMINI_MODEL` | padrão `gemini-2.5-flash` |
| Function | `IA_SECRET` (secret) | o mesmo valor |
| Function | `SITE_URL` (param) | a URL pública do site |

```bash
firebase functions:secrets:set IA_SECRET
firebase deploy --only functions,firestore:rules
```

### 2. Ligar no painel

**Configurações → Atendente automático**. Ligado, ele responde **qualquer número** que
escrever.

> Com número de teste, teste com o seu próprio celular antes de apontar para o número da
> barbearia de verdade.

## Custo

Uma conversa típica são 2 a 5 chamadas ao modelo (a resposta mais as rodadas de
ferramenta), com contexto curto. A Function fica em `minInstances: 0` — sem mensagem, sem
instância, sem fatura. Não repita o erro do Cloud Run always-on: **nunca** suba
`minInstances` aqui.

## Quando ela responder besteira

1. **Desligue** em Configurações — é a primeira porta do código, tem efeito imediato.
2. Ou pause só naquela conversa, pelo botão no cabeçalho dela.
3. A resposta da IA fica marcada com **IA** na conversa; é por aí que se audita o que saiu.
4. `lib/ia/prompt.ts` é onde o comportamento se ajusta. Mudou nome de ferramenta lá? Mude
   em `lib/ia/atender.ts` também — os nomes aparecem nos dois.
