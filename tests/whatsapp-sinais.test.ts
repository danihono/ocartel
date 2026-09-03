import { describe, it, expect } from "vitest";
import { iaEmContato, sugestoesPorConversa, JANELA_EM_CONTATO_MS } from "@/lib/whatsapp/sinais";
import type { Sugestao } from "@/lib/types";

const AGORA = Date.parse("2026-09-03T13:00:00.000Z");
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString();

function sugestao(p: Partial<Sugestao> & { id: string; contactId: string }): Sugestao {
  return {
    clienteNome: "Daniel",
    clienteTelefone: "5519984487271",
    servicoId: "s1",
    servico: "Cabelo",
    barbeiroId: "b1",
    barbeiro: "Raimundo",
    date: "2026-09-03",
    inicio: "17:00",
    duracaoMin: 30,
    status: "pendente",
    ...p,
  };
}

describe("iaEmContato", () => {
  it("marca quem a IA respondeu agora há pouco", () => {
    expect(iaEmContato({ ultimaRespostaIa: iso(60_000) }, AGORA)).toBe(true);
  });

  it("não marca conversa em que a IA nunca falou", () => {
    expect(iaEmContato(undefined, AGORA)).toBe(false);
    expect(iaEmContato({ iaPausadaAte: 0 }, AGORA)).toBe(false);
  });

  // Pausa no futuro é uma pessoa atendendo — dizer "IA" aí seria mentir sobre quem está
  // do outro lado, que é justamente o que o selo existe para responder.
  it("não marca conversa que uma pessoa assumiu", () => {
    const estado = { ultimaRespostaIa: iso(60_000), iaPausadaAte: AGORA + 3_600_000 };
    expect(iaEmContato(estado, AGORA)).toBe(false);
  });

  it("solta o selo quando a conversa esfria", () => {
    expect(iaEmContato({ ultimaRespostaIa: iso(JANELA_EM_CONTATO_MS - 1000) }, AGORA)).toBe(true);
    expect(iaEmContato({ ultimaRespostaIa: iso(JANELA_EM_CONTATO_MS + 1000) }, AGORA)).toBe(false);
  });

  it("ignora data que não dá para ler", () => {
    expect(iaEmContato({ ultimaRespostaIa: "ontem à tarde" }, AGORA)).toBe(false);
  });
});

describe("sugestoesPorConversa", () => {
  it("agrupa por conversa e põe a mais próxima na frente", () => {
    const tarde = sugestao({ id: "s2", contactId: "wa_1", date: "2026-09-04", inicio: "09:00" });
    const cedo = sugestao({ id: "s1", contactId: "wa_1", date: "2026-09-03", inicio: "17:00" });
    const outra = sugestao({ id: "s3", contactId: "wa_2" });

    const mapa = sugestoesPorConversa([tarde, cedo, outra]);
    expect(mapa.get("wa_1")?.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(mapa.get("wa_2")?.map((s) => s.id)).toEqual(["s3"]);
    expect(mapa.get("wa_3")).toBeUndefined();
  });

  it("desempata pelo horário dentro do mesmo dia", () => {
    const tarde = sugestao({ id: "b", contactId: "wa_1", inicio: "17:00" });
    const cedo = sugestao({ id: "a", contactId: "wa_1", inicio: "09:30" });
    expect(sugestoesPorConversa([tarde, cedo]).get("wa_1")?.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
