import { describe, it, expect } from "vitest";
import {
  agoraNaCadeira,
  escalaPictograma,
  iconeDoServico,
  mesAnterior,
  movimentoPorDia,
  recebidoNoMes,
  reguaDoDia,
} from "@/lib/painel";
import type { AppState } from "@/lib/store";
import type { Agendamento, Transacao } from "@/lib/types";

const HOJE = "2026-11-05";

const ag = (p: Partial<Agendamento>): Agendamento => ({
  id: Math.random().toString(36).slice(2),
  date: HOJE,
  barbeiroId: "b1",
  clienteNome: "Ana Souza",
  servico: "Corte",
  inicio: "10:00",
  duracaoMin: 40,
  status: "agendado",
  ...p,
});
const tr = (p: Partial<Transacao>): Transacao => ({
  id: Math.random().toString(36).slice(2),
  data: "",
  clienteNome: "Ana",
  servico: "Corte",
  barbeiroNome: "Ed",
  valor: 60,
  status: "pago",
  forma: "pix",
  paidAt: HOJE,
  ...p,
});

function estado(p: Partial<AppState>): AppState {
  return {
    barbeiros: [
      { id: "b1", nome: "Eduardo", iniciais: "ED", cor: "#000" },
      { id: "b2", nome: "Everton", iniciais: "EV", cor: "#000" },
    ],
    servicos: [
      { id: "s1", nome: "Corte", duracaoMin: 40, preco: 60 },
      { id: "s2", nome: "Barba", duracaoMin: 30, preco: 40 },
    ],
    clientes: [],
    agendamentos: [],
    transacoes: [],
    config: { nome: "X", endereco: "", telefone: "", horario: { abre: "09:00", fecha: "19:00", diasAtivos: [true, true, true, true, true, true, false] } },
    ...p,
  } as unknown as AppState;
}

describe("mês passado", () => {
  it("mesAnterior vira o ano", () => {
    expect(mesAnterior("2026-11-05")).toBe("2026-10");
    expect(mesAnterior("2026-01-31")).toBe("2025-12");
  });
  it("recebidoNoMes soma só o que foi pago naquele mês", () => {
    const s = estado({
      transacoes: [tr({ paidAt: "2026-10-03", valor: 100 }), tr({ paidAt: "2026-10-30", valor: 50 }), tr({ paidAt: HOJE, valor: 70 }), tr({ status: "pendente", paidAt: undefined, dueDate: "2026-10-10" })],
    });
    expect(recebidoNoMes(s, "2026-10", HOJE)).toBe(150);
    expect(recebidoNoMes(s, "2026-11", HOJE)).toBe(70);
  });
});

describe("movimentoPorDia", () => {
  const s = estado({
    agendamentos: [
      ag({ status: "concluido" }),
      ag({ status: "concluido", servico: "Barba" }),
      ag({ status: "concluido", date: "2026-11-04", cobertoPorPlano: true }),
      ag({ status: "noshow" }),
    ],
    transacoes: [tr({ valor: 60 }), tr({ valor: 40 }), tr({ paidAt: "2026-11-04", valor: 0 })],
  });
  it("conta cortes concluídos e receita por dia, terminando hoje", () => {
    const m = movimentoPorDia(s, 3, HOJE);
    expect(m.map((d) => d.dia)).toEqual(["2026-11-03", "2026-11-04", HOJE]);
    expect(m[2]).toEqual({ dia: HOJE, cortes: 2, receita: 100 });
    expect(m[1].cortes).toBe(1);
  });
});

describe("cadeiras", () => {
  const s = estado({
    agendamentos: [
      ag({ inicio: "10:00", duracaoMin: 60, status: "atendimento", clienteNome: "Bruno Alves" }),
      ag({ inicio: "12:00", duracaoMin: 60, status: "bloqueio", clienteNome: "Almoço" }),
      ag({ inicio: "15:00", duracaoMin: 30, status: "cancelado" }),
      ag({ barbeiroId: "b2", inicio: "16:00", duracaoMin: 30 }),
    ],
  });
  it("agora na cadeira: ocupada, pausa, livre até o próximo, fechada", () => {
    const as10 = agoraNaCadeira(s, HOJE, "10:30");
    expect(as10[0].estado).toEqual({ tipo: "ocupada", cliente: "Bruno Alves", servico: "Corte", ate: "11:00" });
    expect(as10[1].estado).toEqual({ tipo: "livre", ate: "16:00" });
    expect(agoraNaCadeira(s, HOJE, "12:15")[0].estado).toEqual({ tipo: "pausa", motivo: "Almoço", ate: "13:00" });
    // O cancelado das 15:00 não segura a cadeira.
    expect(agoraNaCadeira(s, HOJE, "13:30")[0].estado).toEqual({ tipo: "livre", ate: null });
    expect(agoraNaCadeira(s, HOJE, "20:00")[0].estado).toEqual({ tipo: "fechada" });
  });
});

describe("reguaDoDia", () => {
  const s = estado({
    agendamentos: [
      ag({ inicio: "09:00", status: "concluido" }),
      ag({ inicio: "14:00", status: "confirmado", clienteNome: "Lucas Pereira" }),
      ag({ inicio: "12:00", status: "bloqueio" }),
      ag({ inicio: "11:00", status: "cancelado" }),
    ],
  });
  it("pontos em ordem, sem bloqueio nem cancelado, e o próximo", () => {
    const r = reguaDoDia(s, HOJE, "13:00");
    expect(r.pontos.map((p) => [p.hora, p.pos])).toEqual([
      ["09:00", 0],
      ["14:00", 0.5],
    ]);
    expect(r.agoraPos).toBe(0.4);
    expect(r.aberto).toBe(true);
    expect(r.proximo).toEqual({ hora: "14:00", cliente: "Lucas Pereira" });
  });
  it("fora do expediente a navalha estaciona na ponta", () => {
    expect(reguaDoDia(s, HOJE, "21:00")).toMatchObject({ agoraPos: 1, aberto: false, proximo: null });
    expect(reguaDoDia(s, HOJE, "07:00")).toMatchObject({ agoraPos: 0, aberto: false });
  });
});

describe("pictograma", () => {
  it("um desenho por serviço, pelo nome", () => {
    expect(iconeDoServico("Corte")).toBe("tesoura");
    expect(iconeDoServico("Barba")).toBe("navalha");
    expect(iconeDoServico("Corte + Barba")).toBe("combo");
    expect(iconeDoServico("Luzes")).toBe("pincel");
    expect(iconeDoServico("Sobrancelha")).toBe("pente");
    expect(iconeDoServico("Massagem")).toBe("tesoura");
  });
  it("escala 1-2-5 para caber em 12 desenhos", () => {
    expect(escalaPictograma(9)).toBe(1);
    expect(escalaPictograma(12)).toBe(1);
    expect(escalaPictograma(13)).toBe(2);
    expect(escalaPictograma(37)).toBe(5);
    expect(escalaPictograma(250)).toBe(50);
  });
});
