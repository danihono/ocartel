import { describe, expect, it } from "vitest";
import {
  REGRA_PADRAO,
  apurarMes,
  FICHAS_PADRAO,
  comissaoDaLinha,
  distribuirPote,
  idFechamento,
  itensPeloNome,
  mesVizinho,
  montarFechamento,
  pctDoBarbeiro,
  type DadosComissao,
} from "@/lib/comissao";
import type { Agendamento, Barbeiro, FechamentoComissao, LinhaComissao, RegraComissao, Transacao } from "@/lib/types";

// A apuração vira dinheiro na mão de gente. Os testes aqui cobrem dois riscos concretos:
// pagar comissão sobre o que a barbearia ainda não recebeu, e casar o corte com a cobrança
// errada nos docs antigos (que não têm `agendamentoId`).

function barbeiro(id: string, nome: string): Barbeiro {
  return { id, nome, iniciais: nome.slice(0, 2).toUpperCase(), cor: "#0EA37A" };
}

function agendamento(p: Partial<Agendamento> & { id: string; date: string; barbeiroId: string }): Agendamento {
  return {
    clienteNome: "Cliente",
    servico: "Corte",
    inicio: "09:00",
    duracaoMin: 30,
    status: "concluido",
    ...p,
  };
}

function transacao(p: Partial<Transacao> & { id: string }): Transacao {
  return {
    data: "01 jun",
    clienteNome: "Cliente",
    servico: "Corte",
    barbeiroNome: "Rafa",
    valor: 50,
    status: "pago",
    forma: "pix",
    type: "avulso",
    ...p,
  };
}

const REGRA: RegraComissao = { pctPadrao: 40, pctPorBarbeiro: { b1: 50 } };
const BARBEIROS = [barbeiro("b1", "Rafa"), barbeiro("b2", "Léo")];

describe("pctDoBarbeiro", () => {
  it("usa o percentual do barbeiro quando existe", () => {
    expect(pctDoBarbeiro(REGRA, "b1")).toBe(50);
  });

  it("cai no padrão da casa quando o barbeiro não tem o seu", () => {
    expect(pctDoBarbeiro(REGRA, "b2")).toBe(40);
  });

  it("um percentual 0 explícito não é confundido com 'não configurado'", () => {
    expect(pctDoBarbeiro({ pctPadrao: 40, pctPorBarbeiro: { b2: 0 } }, "b2")).toBe(0);
  });

  it("sem regra configurada ninguém começa a dever comissão", () => {
    expect(pctDoBarbeiro(REGRA_PADRAO, "b1")).toBe(0);
  });
});

describe("comissaoDaLinha (regra provisória)", () => {
  const base: Omit<LinhaComissao, "comissao"> = {
    id: "a1",
    origem: "atendimento",
    dataISO: "2026-06-10",
    barbeiroId: "b1",
    barbeiroNome: "Rafa",
    clienteNome: "Cliente",
    servico: "Corte",
    quantidade: 1,
    cobertoPorPlano: false,
    tipoCobranca: "avulso",
    forma: "pix",
    status: "pago",
    pagoNoAto: true,
    valorCobrado: 50,
    valorRecebido: 50,
    vinculo: "forte",
    fichas: 0,
    repetidaNaSemana: false,
  };

  it("aplica o percentual sobre o valor recebido", () => {
    expect(comissaoDaLinha(base, REGRA)).toBe(25);
  });

  it("não paga sobre cobrança em aberto", () => {
    expect(comissaoDaLinha({ ...base, status: "pendente", valorRecebido: 0 }, REGRA)).toBe(0);
  });

  it("atendimento coberto pelo plano entra como zero", () => {
    expect(comissaoDaLinha({ ...base, cobertoPorPlano: true, valorRecebido: 0 }, REGRA)).toBe(0);
  });

  it("mensalidade não é de ninguém enquanto a fórmula não disser o contrário", () => {
    expect(comissaoDaLinha({ ...base, origem: "mensalidade", barbeiroId: "" }, REGRA)).toBe(0);
  });
});

describe("apurarMes", () => {
  it("apura por barbeiro, com vínculo forte pelo agendamentoId", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [
        agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1" }),
        agendamento({ id: "a2", date: "2026-06-11", barbeiroId: "b2" }),
      ],
      transacoes: [
        transacao({ id: "t1", agendamentoId: "a1", paidAt: "2026-06-10", amount: 50, amountReceived: 50 }),
        transacao({ id: "t2", agendamentoId: "a2", paidAt: "2026-06-11", amount: 100, amountReceived: 100, barbeiroNome: "Léo" }),
      ],
    };

    const ap = apurarMes(dados, "2026-06", REGRA);

    expect(ap.linhas).toHaveLength(2);
    expect(ap.linhas.every((l) => l.vinculo === "forte")).toBe(true);
    expect(ap.qtdInferidas).toBe(0);
    // b1: 50% de 50 = 25 · b2: 40% de 100 = 40
    expect(ap.porBarbeiro.find((r) => r.barbeiroId === "b1")?.comissao).toBe(25);
    expect(ap.porBarbeiro.find((r) => r.barbeiroId === "b2")?.comissao).toBe(40);
    expect(ap.totalComissao).toBe(65);
    expect(ap.totalFaturamento).toBe(150);
  });

  it("casa doc legado por nome+serviço+data e marca a linha como inferida", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1" })],
      // Sem `agendamentoId` — é o formato de tudo que foi concluído antes deste módulo.
      transacoes: [transacao({ id: "t1", paidAt: "2026-06-10", amount: 50, amountReceived: 50 })],
    };

    const ap = apurarMes(dados, "2026-06", REGRA);

    expect(ap.linhas[0].vinculo).toBe("inferido");
    expect(ap.qtdInferidas).toBe(1);
    expect(ap.porBarbeiro.find((r) => r.barbeiroId === "b1")?.comissao).toBe(25);
  });

  it("não usa a mesma cobrança legada para dois atendimentos", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [
        agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1", inicio: "09:00" }),
        agendamento({ id: "a2", date: "2026-06-10", barbeiroId: "b1", inicio: "10:00" }),
      ],
      transacoes: [transacao({ id: "t1", paidAt: "2026-06-10", amount: 50, amountReceived: 50 })],
    };

    const ap = apurarMes(dados, "2026-06", REGRA);

    expect(ap.linhas.filter((l) => l.vinculo === "inferido")).toHaveLength(1);
    expect(ap.qtdSemCobranca).toBe(1);
    // Só o atendimento que achou cobrança paga comissão.
    expect(ap.porBarbeiro.find((r) => r.barbeiroId === "b1")?.comissao).toBe(25);
  });

  it("atendimento sem cobrança nenhuma não vira comissão, mas aparece na lista", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1" })],
      transacoes: [],
    };

    const ap = apurarMes(dados, "2026-06", REGRA);

    expect(ap.linhas).toHaveLength(1);
    expect(ap.qtdSemCobranca).toBe(1);
    expect(ap.totalComissao).toBe(0);
  });

  it("mensalidade entra como linha própria, sem barbeiro e sem comissão", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [],
      transacoes: [
        transacao({ id: "t1", type: "mensalidade", servico: "Plano Mensal", dueDate: "2026-06-05", paidAt: "2026-06-05", amount: 140, amountReceived: 140 }),
      ],
    };

    const ap = apurarMes(dados, "2026-06", REGRA);

    expect(ap.linhas).toHaveLength(1);
    expect(ap.linhas[0].origem).toBe("mensalidade");
    expect(ap.linhas[0].barbeiroId).toBe("");
    expect(ap.totalComissao).toBe(0);
  });

  it("mensalidade vencida e não paga aparece como atrasada", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [],
      transacoes: [
        transacao({ id: "t1", type: "mensalidade", servico: "Plano Mensal", status: "pendente", dueDate: "2026-06-05", amount: 140 }),
      ],
    };

    // O status é a comparação do vencimento com HOJE. Derivar isso da data do próprio
    // registro faria nada nunca vencer — foi exatamente esse o bug.
    expect(apurarMes(dados, "2026-06", REGRA, [], "2026-06-20").linhas[0].status).toBe("atrasado");
    expect(apurarMes(dados, "2026-06", REGRA, [], "2026-06-01").linhas[0].status).toBe("pendente");
  });

  it("atendimento com cobrança em aberto e vencida não paga comissão", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1" })],
      transacoes: [
        transacao({ id: "t1", agendamentoId: "a1", status: "pendente", dueDate: "2026-06-12", amount: 50 }),
      ],
    };

    const ap = apurarMes(dados, "2026-06", REGRA, [], "2026-06-20");

    expect(ap.linhas[0].status).toBe("atrasado");
    expect(ap.linhas[0].valorRecebido).toBe(0);
    expect(ap.totalComissao).toBe(0);
  });

  it("ignora atendimento de outro mês e o que não foi concluído", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [
        agendamento({ id: "a1", date: "2026-05-30", barbeiroId: "b1" }),
        agendamento({ id: "a2", date: "2026-06-10", barbeiroId: "b1", status: "cancelado" }),
        agendamento({ id: "a3", date: "2026-06-10", barbeiroId: "b1", status: "noshow" }),
      ],
      transacoes: [],
    };

    expect(apurarMes(dados, "2026-06", REGRA).linhas).toHaveLength(0);
  });

  it("anexa o fechamento já gravado ao resumo do barbeiro", () => {
    const fechamento: FechamentoComissao = {
      id: idFechamento("2026-06", "b1"),
      mes: "2026-06",
      barbeiroId: "b1",
      barbeiroNome: "Rafa",
      total: 25,
      faturamento: 50,
      qtdLinhas: 1,
      regra: REGRA,
      fechadoPor: "Dona",
      fechadoEm: "2026-07-01T10:00:00.000Z",
    };
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [agendamento({ id: "a1", date: "2026-06-10", barbeiroId: "b1" })],
      transacoes: [transacao({ id: "t1", agendamentoId: "a1", paidAt: "2026-06-10", amount: 50, amountReceived: 50 })],
    };

    const ap = apurarMes(dados, "2026-06", REGRA, [fechamento]);

    expect(ap.porBarbeiro.find((r) => r.barbeiroId === "b1")?.fechamento?.total).toBe(25);
    // Fechamento de outro mês não vaza para este.
    expect(apurarMes(dados, "2026-07", REGRA, [fechamento]).porBarbeiro[0].fechamento).toBeUndefined();
  });
});

describe("pote da assinatura", () => {
  // Junho/2026 começa numa segunda-feira: dias 1–7 são uma semana, 8–14 a seguinte.
  const POTE: RegraComissao = { ...REGRA, pote: { pct: 40, fichas: FICHAS_PADRAO } };
  const coberto = (p: Partial<Agendamento> & { id: string; date: string; barbeiroId: string }) =>
    agendamento({ cobertoPorPlano: true, ...p });
  const mensalidade = (id: string, valor: number, extra: Partial<Transacao> = {}) =>
    transacao({ id, type: "mensalidade", valor, servico: "Plano", barbeiroNome: "", paidAt: "2026-06-05", ...extra });

  it("o exemplo da casa: 4.000 de pote, 1.840 e 560 fichas", () => {
    const partes = distribuirPote(4000, new Map([["a", 1840], ["b", 560]]));
    expect(partes.get("a")).toBe(3066.67);
    expect(partes.get("b")).toBe(933.33);
  });

  it("usa a fração exata, e a soma das partes fecha o pote", () => {
    const partes = distribuirPote(5104.8, new Map([["a", 1840], ["b", 560]]));
    expect(partes.get("a")).toBe(3913.68);
    expect(partes.get("b")).toBe(1191.12);

    const tres = distribuirPote(100, new Map([["a", 1], ["b", 1], ["c", 1]]));
    expect([...tres.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(100, 10);
  });

  it("sem fichas no mês o pote não sai para ninguém", () => {
    expect(distribuirPote(4000, new Map([["a", 0]])).get("a")).toBe(0);
  });

  it("deduz as peças pelo nome do serviço", () => {
    expect(itensPeloNome("Corte + Barba")).toEqual(["cabelo", "barba"]);
    expect(itensPeloNome("Raspar")).toEqual(["raspar"]);
    expect(itensPeloNome("Luzes")).toEqual([]);
  });

  it("apura o mês: 40% das mensalidades recebidas, repartido pelas fichas", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [
        coberto({ id: "a1", date: "2026-06-02", barbeiroId: "b1", clienteId: "c1", servico: "Corte + Barba" }), // 30 + 30
        coberto({ id: "a2", date: "2026-06-04", barbeiroId: "b2", clienteId: "c1", servico: "Corte" }), // repetido: metade, 15
        coberto({ id: "a3", date: "2026-06-03", barbeiroId: "b2", clienteId: "c2", servico: "Raspar" }), // 20
        coberto({ id: "a4", date: "2026-06-09", barbeiroId: "b1", clienteId: "c1", servico: "Corte" }), // semana nova: 30
        agendamento({ id: "a5", date: "2026-06-10", barbeiroId: "b1", servico: "Corte" }), // avulso também: 30
      ],
      transacoes: [
        transacao({ id: "t5", agendamentoId: "a5", valor: 50, paidAt: "2026-06-10" }),
        mensalidade("m1", 500),
        mensalidade("m2", 500),
        mensalidade("m3", 500, { status: "pendente", paidAt: undefined, dueDate: "2026-06-20" }),
      ],
    };
    const ap = apurarMes(dados, "2026-06", POTE, [], "2026-06-15");

    expect(ap.pote).toMatchObject({ ativo: true, receitaAssinaturas: 1000, valor: 400, totalFichas: 155 });
    expect(ap.linhas.find((l) => l.id === "a2")).toMatchObject({ fichas: 15, repetidaNaSemana: true });

    const rafa = ap.porBarbeiro.find((r) => r.barbeiroId === "b1")!;
    // 400 × 120/155 = 309,677… e 400 × 35/155 = 90,322…: o centavo que sobra vai para a maior fração.
    expect(rafa).toMatchObject({ fichas: 120, valorPote: 309.68, comissaoAvulso: 25, comissao: 334.68 });
    expect(rafa.participacao).toBeCloseTo(120 / 155);
    const leo = ap.porBarbeiro.find((r) => r.barbeiroId === "b2")!;
    expect(leo).toMatchObject({ fichas: 35, valorPote: 90.32, comissao: 90.32 });
    expect(ap.totalComissao).toBe(425);

    const f = montarFechamento(rafa, "2026-06", POTE, "Dona", "2026-07-01T10:00:00.000Z");
    expect(f).toMatchObject({ total: 334.68, fichas: 120, valorPote: 309.68 });
  });

  it("a semana atravessa a virada do mês", () => {
    // 30/jun é terça e 2/jul quinta: mesma semana, o corte de julho vale repetido.
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [
        coberto({ id: "j1", date: "2026-06-30", barbeiroId: "b1", clienteId: "c1" }),
        coberto({ id: "j2", date: "2026-07-02", barbeiroId: "b2", clienteId: "c1" }),
      ],
      transacoes: [],
    };
    const ap = apurarMes(dados, "2026-07", POTE, [], "2026-07-15");
    expect(ap.linhas.map((l) => [l.id, l.fichas])).toEqual([["j2", 15]]);
  });

  it("as peças marcadas em Configurações valem mais que o nome", () => {
    const regra: RegraComissao = {
      ...REGRA,
      pote: { pct: 40, fichas: FICHAS_PADRAO, itensPorServico: { "s-luzes": ["cabelo"] } },
    };
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      servicos: [{ id: "s-luzes", nome: "Luzes", duracaoMin: 90, preco: 120 }],
      agendamentos: [coberto({ id: "l1", date: "2026-06-02", barbeiroId: "b1", servico: "Luzes" })],
      transacoes: [],
    };
    expect(apurarMes(dados, "2026-06", regra, [], "2026-06-15").linhas[0].fichas).toBe(30);
  });

  it("sem pote configurado a mensalidade continua sem comissão", () => {
    const dados: DadosComissao = {
      barbeiros: BARBEIROS,
      agendamentos: [coberto({ id: "a1", date: "2026-06-02", barbeiroId: "b1" })],
      transacoes: [mensalidade("m1", 500)],
    };
    const ap = apurarMes(dados, "2026-06", REGRA, [], "2026-06-15");
    expect(ap.pote).toMatchObject({ ativo: false, receitaAssinaturas: 500, valor: 0, totalFichas: 0 });
    expect(ap.totalComissao).toBe(0);
  });
});

describe("fechamento", () => {
  it("o id é determinístico — fechar duas vezes escreve no mesmo doc", () => {
    expect(idFechamento("2026-06", "b1")).toBe("2026-06_b1");
    expect(idFechamento("2026-06", "b1")).toBe(idFechamento("2026-06", "b1"));
  });

  it("congela o total e um retrato da regra usada", () => {
    const resumo = {
      barbeiroId: "b1", barbeiroNome: "Rafa", atendimentos: 2, faturamento: 100, comissao: 50, pct: 50,
      comissaoAvulso: 50, fichas: 0, participacao: 0, valorPote: 0,
    };
    const f = montarFechamento(resumo, "2026-06", REGRA, "Dona", "2026-07-01T10:00:00.000Z");

    expect(f).toMatchObject({ id: "2026-06_b1", mes: "2026-06", total: 50, faturamento: 100, qtdLinhas: 2, fechadoPor: "Dona" });
    expect(f.regra).toEqual(REGRA);
  });
});

describe("mesVizinho", () => {
  it("anda para trás e para frente", () => {
    expect(mesVizinho("2026-06", -1)).toBe("2026-05");
    expect(mesVizinho("2026-06", 1)).toBe("2026-07");
  });

  it("vira o ano nas duas pontas", () => {
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
  });
});
