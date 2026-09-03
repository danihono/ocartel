// A conversa com o Gemini, isolada num arquivo só.
//
// Fica isolado para trocar de modelo — ou de provedor — não espalhar mudança pelo resto do
// código: quem chama passa instruções, histórico e ferramentas, e recebe texto e chamadas
// de ferramenta de volta.
//
// É a API REST direta, sem SDK, de propósito: é uma chamada HTTP com um corpo JSON, o
// formato é estável, e um SDK a mais no bundle do site significa uma dependência a mais
// para auditar e atualizar. O modelo sai de `GEMINI_MODEL` para dar para trocar sem
// alterar código.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Uma ferramenta que o modelo pode chamar (JSON Schema simplificado). */
export interface Ferramenta {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChamadaFerramenta {
  name: string;
  args: Record<string, unknown>;
}

interface Parte {
  text?: string;
  functionCall?: ChamadaFerramenta;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface Turno {
  role: "user" | "model";
  parts: Parte[];
}

export interface RespostaModelo {
  texto: string;
  chamadas: ChamadaFerramenta[];
}

export class IaIndisponivel extends Error {}

function modelo(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/**
 * Desliga o raciocínio prévio do modelo (família 2.5).
 *
 * Ele custa vários segundos em TODA mensagem, e aqui não paga o que cobra: a inteligência
 * do atendimento está nas ferramentas (que consultam a agenda de verdade) e no prompt, não
 * na deliberação do modelo. Quem espera é alguém olhando o WhatsApp.
 */
const SEM_RACIOCINIO = { thinkingBudget: 0 };

/** O 400 que a família 3.x devolveria para `thinkingBudget` — lá o campo tem outro nome. */
function reclamouDoRaciocinio(status: number, corpo: string): boolean {
  return status === 400 && /think/i.test(corpo);
}

async function gerar(instrucoes: string, turnos: Turno[], ferramentas: Ferramenta[]): Promise<RespostaModelo> {
  // `.trim()` não é preciosismo: um segredo colado no terminal costuma vir com quebra de
  // linha no fim, e ela iria inteira no cabeçalho. O Google devolve "API key not valid",
  // que acusa a chave quando o culpado é o espaço — um erro que some por semanas.
  const chave = process.env.GEMINI_API_KEY?.trim();
  if (!chave) throw new IaIndisponivel("GEMINI_API_KEY não configurada.");

  const chamar = async (comRaciocinio: boolean) =>
    fetch(`${ENDPOINT}/${modelo()}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucoes }] },
        contents: turnos,
        ...(ferramentas.length ? { tools: [{ functionDeclarations: ferramentas }] } : {}),
        generationConfig: {
          temperature: 0.4,
          // O teto é generoso porque nos modelos com raciocínio ele cobre o pensamento
          // ANTES da resposta: apertado, o modelo gasta a cota pensando e devolve texto
          // vazio — que aqui vira silêncio no WhatsApp de alguém.
          maxOutputTokens: 2048,
          ...(comRaciocinio ? {} : { thinkingConfig: SEM_RACIOCINIO }),
        },
      }),
    });

  let resp = await chamar(false);

  // Se o modelo configurado não conhecer esse campo, tenta de novo sem ele. Perder alguns
  // segundos é muito melhor que a IA emudecer porque alguém trocou o GEMINI_MODEL.
  if (!resp.ok) {
    const corpo = await resp.text();
    if (!reclamouDoRaciocinio(resp.status, corpo)) {
      throw new IaIndisponivel(`Gemini respondeu ${resp.status}: ${corpo.slice(0, 300)}`);
    }
    resp = await chamar(true);
    if (!resp.ok) {
      throw new IaIndisponivel(`Gemini respondeu ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    }
  }

  const dados = (await resp.json()) as { candidates?: { content?: { parts?: Parte[] } }[] };
  const partes = dados.candidates?.[0]?.content?.parts ?? [];

  return {
    texto: partes
      .map((p) => p.text ?? "")
      .join("")
      .trim(),
    chamadas: partes.flatMap((p) => (p.functionCall ? [p.functionCall] : [])),
  };
}

export interface ParamsConversa {
  instrucoes: string;
  /** Histórico da conversa, do mais antigo para o mais novo. */
  historico: { de: "cliente" | "barbearia"; texto: string }[];
  ferramentas: Ferramenta[];
  /** Executa uma ferramenta pedida pelo modelo e devolve o que ele vai ler. */
  executar: (chamada: ChamadaFerramenta) => Promise<Record<string, unknown>>;
  /** Quantas rodadas de ferramenta são permitidas antes de exigir uma resposta. */
  maxRodadas?: number;
}

/**
 * Conversa até o modelo produzir uma resposta em texto, executando as ferramentas que ele
 * pedir pelo caminho.
 *
 * O teto de rodadas não é decoração: sem ele, um modelo confuso pode ficar chamando
 * ferramenta para sempre — e cada rodada é uma cobrança e alguns segundos de silêncio para
 * quem está esperando resposta no WhatsApp.
 */
export async function conversar(p: ParamsConversa): Promise<{ texto: string; usadas: ChamadaFerramenta[] }> {
  // A conversa precisa começar por quem escreveu de fora. Muita conversa da barbearia
  // começa com uma mensagem NOSSA (a confirmação automática do dia, por exemplo), e mandar
  // isso como primeiro turno é um histórico que começa pela resposta.
  const primeiroDoCliente = p.historico.findIndex((t) => t.de === "cliente");
  const turnos: Turno[] = (primeiroDoCliente < 0 ? [] : p.historico.slice(primeiroDoCliente)).map((t) => ({
    role: t.de === "cliente" ? "user" : "model",
    parts: [{ text: t.texto }],
  }));
  if (turnos.length === 0) return { texto: "", usadas: [] };

  const usadas: ChamadaFerramenta[] = [];
  const maxRodadas = p.maxRodadas ?? 3;

  for (let rodada = 0; rodada <= maxRodadas; rodada++) {
    // Na última rodada as ferramentas somem: o modelo precisa fechar em texto.
    const resposta = await gerar(p.instrucoes, turnos, rodada < maxRodadas ? p.ferramentas : []);

    if (resposta.chamadas.length === 0) return { texto: resposta.texto, usadas };

    turnos.push({ role: "model", parts: resposta.chamadas.map((functionCall) => ({ functionCall })) });

    const respostas: Parte[] = [];
    for (const chamada of resposta.chamadas) {
      usadas.push(chamada);
      const saida = await p.executar(chamada).catch((err) => ({ erro: String(err) }));
      respostas.push({ functionResponse: { name: chamada.name, response: saida } });
    }
    turnos.push({ role: "user", parts: respostas });
  }

  return { texto: "", usadas };
}
