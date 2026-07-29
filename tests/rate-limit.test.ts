import { describe, expect, it } from "vitest";
import {
  chaveIp,
  chaveTelefone,
  decidirLimite,
  ipDeHeaders,
  pareceRobo,
  PREENCHIMENTO_MINIMO_MS,
  type Limite,
} from "@/lib/rate-limit";

const limite: Limite = { max: 3, janelaSeg: 60 };
const T0 = 1_800_000_000_000;

describe("decidirLimite", () => {
  it("aceita o primeiro pedido e abre a janela", () => {
    const d = decidirLimite(null, limite, T0);
    expect(d.permitido).toBe(true);
    expect(d.estado).toEqual({ contagem: 1, inicioMs: T0 });
  });

  it("acumula dentro da janela mantendo o início", () => {
    const d = decidirLimite({ contagem: 1, inicioMs: T0 }, limite, T0 + 5_000);
    expect(d.permitido).toBe(true);
    expect(d.estado).toEqual({ contagem: 2, inicioMs: T0 });
  });

  it("aceita exatamente até o máximo", () => {
    expect(decidirLimite({ contagem: 2, inicioMs: T0 }, limite, T0 + 1).permitido).toBe(true);
  });

  it("recusa a partir do máximo", () => {
    expect(decidirLimite({ contagem: 3, inicioMs: T0 }, limite, T0 + 1).permitido).toBe(false);
  });

  it("não estende a janela ao recusar — o bloqueio tem prazo", () => {
    const bloqueado = { contagem: 3, inicioMs: T0 };
    const d = decidirLimite(bloqueado, limite, T0 + 30_000);
    expect(d.permitido).toBe(false);
    expect(d.estado.inicioMs).toBe(T0);
    expect(d.estado.contagem).toBe(3);
  });

  it("reabre quando a janela expira", () => {
    const d = decidirLimite({ contagem: 3, inicioMs: T0 }, limite, T0 + 60_000);
    expect(d.permitido).toBe(true);
    expect(d.estado).toEqual({ contagem: 1, inicioMs: T0 + 60_000 });
  });

  it("trata a borda exata da janela como expirada", () => {
    expect(decidirLimite({ contagem: 3, inicioMs: T0 }, limite, T0 + 59_999).permitido).toBe(false);
    expect(decidirLimite({ contagem: 3, inicioMs: T0 }, limite, T0 + 60_000).permitido).toBe(true);
  });

  it("uma sequência de pedidos passa max vezes e trava", () => {
    let estado = decidirLimite(null, limite, T0).estado;
    for (let i = 0; i < 2; i++) estado = decidirLimite(estado, limite, T0 + i).estado;
    expect(decidirLimite(estado, limite, T0 + 10).permitido).toBe(false);
  });
});

describe("chaveTelefone", () => {
  it("ignora formatação — mesmo telefone, mesma chave", () => {
    expect(chaveTelefone("(11) 99999-8888")).toBe(chaveTelefone("11999998888"));
  });

  it("separa telefones diferentes", () => {
    expect(chaveTelefone("11999998888")).not.toBe(chaveTelefone("11999998889"));
  });
});

describe("chaveIp", () => {
  it("não guarda o IP em claro", () => {
    expect(chaveIp("203.0.113.7")).not.toContain("203.0.113.7");
  });

  it("é estável e distingue IPs", () => {
    expect(chaveIp("203.0.113.7")).toBe(chaveIp("203.0.113.7"));
    expect(chaveIp("203.0.113.7")).not.toBe(chaveIp("203.0.113.8"));
  });
});

describe("ipDeHeaders", () => {
  const headers = (mapa: Record<string, string>) => ({ get: (n: string) => mapa[n] ?? null });

  it("pega o primeiro de x-forwarded-for (o cliente)", () => {
    expect(ipDeHeaders(headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7");
  });

  it("cai para x-real-ip quando não há xff", () => {
    expect(ipDeHeaders(headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("devolve vazio quando não dá para saber — melhor pular o limite que juntar todo mundo num balde", () => {
    expect(ipDeHeaders(headers({}))).toBe("");
    expect(ipDeHeaders(headers({ "x-forwarded-for": "  " }))).toBe("");
  });
});

describe("pareceRobo", () => {
  it("aceita preenchimento humano", () => {
    expect(pareceRobo({ honeypot: "", duracaoPreenchimentoMs: 30_000 })).toBe(false);
  });

  it("barra quando a isca vem preenchida", () => {
    expect(pareceRobo({ honeypot: "spam", duracaoPreenchimentoMs: 30_000 })).toBe(true);
  });

  it("ignora espaços em branco na isca", () => {
    expect(pareceRobo({ honeypot: "   ", duracaoPreenchimentoMs: 30_000 })).toBe(false);
  });

  it("barra submissão instantânea", () => {
    expect(pareceRobo({ duracaoPreenchimentoMs: 100 })).toBe(true);
    expect(pareceRobo({ duracaoPreenchimentoMs: PREENCHIMENTO_MINIMO_MS - 1 })).toBe(true);
    expect(pareceRobo({ duracaoPreenchimentoMs: PREENCHIMENTO_MINIMO_MS })).toBe(false);
  });

  it("não barra quando o cliente não informa a duração", () => {
    expect(pareceRobo({})).toBe(false);
  });

  it("ignora duração negativa (relógio do cliente bagunçado) em vez de barrar", () => {
    expect(pareceRobo({ duracaoPreenchimentoMs: -5000 })).toBe(false);
  });
});
