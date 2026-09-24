import { describe, expect, it } from "vitest";
import {
  REGRA_PADRAO,
  apurarMes,
  comissaoDaLinha,
  idFechamento,
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

describe("fechamento", () => {
  it("o id é determinístico — fechar duas vezes escreve no mesmo doc", () => {
    expect(idFechamento("2026-06", "b1")).toBe("2026-06_b1");
    expect(idFechamento("2026-06", "b1")).toBe(idFechamento("2026-06", "b1"));
  });

  it("congela o total e um retrato da regra usada", () => {
    const resumo = { barbeiroId: "b1", barbeiroNome: "Rafa", atendimentos: 2, faturamento: 100, comissao: 50, pct: 50 };
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
