import { describe, it, expect } from "vitest";
import { abasComissoes, dataBR, linhaCrua, linhasAgendamentos, linhasClientes, linhasTransacoes, nomeAba, nomeArquivo } from "@/lib/exportar";
import type { ApuracaoMes } from "@/lib/comissao";
import type { Agendamento, Barbeiro, Cliente, Transacao } from "@/lib/types";

const cliente: Cliente = {
  id: "c1", nome: "João Pedro", telefone: "(11) 98876-2310", email: "jp@x.com", plano: "Mensal C+B", tag: "VIP",
  ultimoAtendimento: "há 3 dias", ultimoAtendimentoISO: "2026-10-20", totalGasto: 1840, atendimentos: 24, desde: "jan/24",
  iniciais: "JP", nascimento: "1990-10-27", diaVencimento: 10,
};

describe("dataBR", () => {
  it("converte ISO (com ou sem hora) para dd/mm/aaaa", () => {
    expect(dataBR("2026-10-27")).toBe("27/10/2026");
    expect(dataBR("2026-10-27T13:00:00Z")).toBe("27/10/2026");
    expect(dataBR(undefined)).toBe("");
    expect(dataBR("lixo")).toBe("");
  });
});

describe("linhasClientes", () => {
  it("cabeçalhos em português e dinheiro como número", () => {
    const [l] = linhasClientes([cliente]);
    expect(l.Nome).toBe("João Pedro");
    expect(l["Total gasto (R$)"]).toBe(1840);
    expect(l.Nascimento).toBe("27/10/1990");
    expect(l["Último atendimento"]).toBe("20/10/2026");
  });
});

describe("linhasAgendamentos", () => {
  const barbeiros: Barbeiro[] = [{ id: "b1", nome: "Everton", iniciais: "EV", cor: "#000" }];
  const ag = (p: Partial<Agendamento>): Agendamento => ({ id: "a", date: "2026-10-27", barbeiroId: "b1", clienteNome: "Ana", servico: "Corte", inicio: "10:00", duracaoMin: 40, status: "agendado", ...p });
  it("ordena por data e hora, troca id do barbeiro pelo nome e traduz o status", () => {
    const ls = linhasAgendamentos([ag({ id: "2", inicio: "15:00" }), ag({ id: "1", inicio: "09:00", status: "concluido" })], barbeiros);
    expect(ls.map((l) => l.Início)).toEqual(["09:00", "15:00"]);
    expect(ls[0].Barbeiro).toBe("Everton");
    expect(ls[0].Status).toBe("Concluído");
  });
  it("bloqueio sai sem cliente, com o motivo no serviço", () => {
    const [l] = linhasAgendamentos([ag({ status: "bloqueio", clienteNome: "Almoço", servico: "Bloqueado" })], barbeiros);
    expect(l.Cliente).toBe("");
    expect(l.Serviço).toBe("Bloqueio · Almoço");
  });
});

describe("linhasTransacoes", () => {
  const t = (p: Partial<Transacao>): Transacao => ({ id: "t", data: "", clienteNome: "Ana", servico: "Corte", barbeiroNome: "Everton", valor: 75, status: "pendente", forma: "pix", ...p });
  it("pendente vencida sai como Atrasado, sem valor recebido nem forma", () => {
    const [l] = linhasTransacoes([t({ dueDate: "2026-10-01" })], "2026-10-27");
    expect(l.Status).toBe("Atrasado");
    expect(l["Valor recebido (R$)"]).toBe(0);
    expect(l.Forma).toBe("");
  });
  it("paga leva valor recebido, forma e data de pagamento", () => {
    const [l] = linhasTransacoes([t({ status: "pago", amountReceived: 70, paidAt: "2026-10-20", forma: "dinheiro" })], "2026-10-27");
    expect(l["Valor recebido (R$)"]).toBe(70);
    expect(l.Forma).toBe("Dinheiro");
    expect(l["Pago em"]).toBe("20/10/2026");
  });
});

describe("abasComissoes", () => {
  it("resumo por barbeiro e detalhe por atendimento", () => {
    const ap: ApuracaoMes = {
      mes: "2026-10", totalFaturamento: 100, totalComissao: 40, qtdInferidas: 0, qtdSemCobranca: 0,
      porBarbeiro: [{
        barbeiroId: "b1", barbeiroNome: "Everton", atendimentos: 2, faturamento: 100, comissao: 40, pct: 40,
        comissaoAvulso: 40, fichas: 0, participacao: 0, valorPote: 0,
      }],
      linhas: [],
      pote: { ativo: false, pct: 0, receitaAssinaturas: 0, valor: 0, totalFichas: 0, valorPorFicha: 0 },
    };
    const [resumo, detalhe] = abasComissoes(ap);
    expect(resumo.linhas[0]["Comissão (R$)"]).toBe(40);
    expect(resumo.linhas[0].Fechamento).toBe("Aberto");
    expect(detalhe.linhas).toEqual([]);
  });
});

describe("utilitários", () => {
  it("linhaCrua achata objetos e booleanos", () => {
    expect(linhaCrua({ a: 1, b: true, c: { x: 1 }, d: null })).toEqual({ a: 1, b: "sim", c: '{"x":1}', d: "" });
  });
  it("nomeArquivo e nomeAba são seguros", () => {
    expect(nomeArquivo("Clientes VIP", "2026-10-27", "xlsx")).toBe("ocartel-clientes-vip-2026-10-27.xlsx");
    expect(nomeArquivo("Backup Barbearia São João", "2026-10-27", "csv")).toBe("ocartel-backup-barbearia-sao-joao-2026-10-27.csv");
    expect(nomeAba("a/b:c*?")).toBe("a b c  ");
    expect(nomeAba("x".repeat(40))).toHaveLength(31);
  });
});
