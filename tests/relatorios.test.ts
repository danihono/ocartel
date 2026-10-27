import { describe, it, expect } from "vitest";
import { duracaoDias, montarRelatorio, periodoAnterior, periodoDoPreset, variacao, type DadosRelatorio } from "@/lib/relatorios";
import type { Agendamento, Transacao } from "@/lib/types";

describe("períodos", () => {
  it("presets relativos a hoje", () => {
    expect(periodoDoPreset("mes", "2026-10-27")).toEqual({ inicio: "2026-10-01", fim: "2026-10-27" });
    expect(periodoDoPreset("mes-passado", "2026-10-27")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(periodoDoPreset("mes-passado", "2026-03-15")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(periodoDoPreset("7d", "2026-10-27")).toEqual({ inicio: "2026-10-21", fim: "2026-10-27" });
    expect(periodoDoPreset("ano", "2026-10-27")).toEqual({ inicio: "2026-01-01", fim: "2026-10-27" });
  });
  it("o anterior tem o mesmo tamanho e termina na véspera", () => {
    const p = { inicio: "2026-10-01", fim: "2026-10-27" };
    expect(duracaoDias(p)).toBe(27);
    expect(periodoAnterior(p)).toEqual({ inicio: "2026-09-04", fim: "2026-09-30" });
  });
  it("variação sem base é null", () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(80, 100)).toBe(-20);
    expect(variacao(5, 0)).toBeNull();
  });
});

const ag = (p: Partial<Agendamento>): Agendamento => ({ id: Math.random().toString(), date: "2026-10-05", barbeiroId: "b1", clienteNome: "Ana", servico: "Corte", inicio: "10:00", duracaoMin: 40, status: "concluido", ...p });
const tr = (p: Partial<Transacao>): Transacao => ({ id: Math.random().toString(), data: "", clienteNome: "Ana", servico: "Corte", barbeiroNome: "Everton", barbeiroId: "b1", valor: 75, status: "pago", forma: "pix", paidAt: "2026-10-05", type: "avulso", ...p });

describe("montarRelatorio", () => {
  const dados: DadosRelatorio = {
    barbeiros: [{ id: "b1", nome: "Everton", iniciais: "EV", cor: "#000" }],
    novosClientes: { atual: 3, anterior: 1 },
    agendamentos: [
      ag({}),
      ag({ date: "2026-10-06", inicio: "15:30" }), // terça
      ag({ date: "2026-10-06", status: "noshow" }),
      ag({ date: "2026-10-07", status: "cancelado" }),
      ag({ date: "2026-10-08", status: "bloqueio" }),
      ag({ date: "2026-09-20" }), // período anterior
    ],
    transacoes: [
      tr({}),
      tr({ paidAt: "2026-10-06", valor: 140, servico: "Corte + Barba", forma: "dinheiro" }),
      tr({ type: "mensalidade", servico: "Mensal", valor: 149, barbeiroId: undefined, barbeiroNome: "" }),
      tr({ status: "pendente", paidAt: undefined }), // não entrou
      tr({ paidAt: "2026-09-15", valor: 100 }), // anterior
    ],
  };
  const r = montarRelatorio(dados, { inicio: "2026-10-01", fim: "2026-10-27" });

  it("receita vem das cobranças pagas no período, incluindo mensalidades", () => {
    expect(r.atual.receita).toBe(75 + 140 + 149);
    expect(r.atual.receitaMensalidades).toBe(149);
    expect(r.atual.pagamentos).toBe(3);
    expect(r.comparacao.receita).toBe(100);
  });
  it("movimento vem da agenda: atendimentos, faltas, cancelamentos", () => {
    expect(r.atual.atendimentos).toBe(2);
    expect(r.atual.faltas).toBe(1);
    expect(r.atual.taxaFaltas).toBe(33);
    expect(r.atual.cancelados).toBe(1);
    expect(r.atual.ticketMedio).toBe(Math.round((75 + 140) / 2));
    expect(r.atual.novosClientes).toBe(3);
  });
  it("rankings", () => {
    expect(r.porServico[0]).toEqual({ nome: "Mensalidades", qtd: 1, receita: 149 });
    expect(r.porBarbeiro).toEqual([{ nome: "Everton", qtd: 2, receita: 215 }]);
    expect(r.porForma.map((f) => f.nome)).toEqual(["Pix", "Dinheiro"]);
  });
  it("série diária cobre o período inteiro", () => {
    expect(r.serie).toHaveLength(27);
    expect(r.serie.find((s) => s.dia === "2026-10-06")?.receita).toBe(140);
  });
  it("mapa de calor ignora bloqueio e cancelado", () => {
    const total = r.calor.flat().reduce((a, b) => a + b, 0);
    expect(total).toBe(3); // 2 concluídos + 1 falta
    const terca = r.calor[1];
    expect(terca[r.horas.indexOf(15)]).toBe(1);
  });
});
