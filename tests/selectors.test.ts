import { describe, it, expect } from "vitest";
import {
  slug,
  fmtDur,
  formatBRL,
  rotuloServico,
  statusCobranca,
  valorCobrado,
  valorRecebido,
  tipoCobranca,
  clientePossuiPlanoAtivo,
  diaVencimentoCliente,
  ehDoCliente,
  selectResumoFinanceiro,
} from "@/lib/selectors";
import type { AppState } from "@/lib/store";
import type { Cliente, Plano, Transacao } from "@/lib/types";

describe("slug", () => {
  it("minúsculo, sem acento, hifenizado", () => {
    expect(slug("João Pedro")).toBe("joao-pedro");
    expect(slug("Barbearia do Zé!!")).toBe("barbearia-do-ze");
  });
});

describe("fmtDur", () => {
  it("formata durações", () => {
    expect(fmtDur(40)).toBe("40min");
    expect(fmtDur(60)).toBe("1h");
    expect(fmtDur(90)).toBe("1h30");
    expect(fmtDur(125)).toBe("2h05");
  });
});

describe("formatBRL", () => {
  it("separador de milhar determinístico", () => {
    expect(formatBRL(1005)).toBe("R$ 1.005");
    expect(formatBRL(0)).toBe("R$ 0");
    expect(formatBRL(1234567)).toBe("R$ 1.234.567");
  });
});

describe("rotuloServico", () => {
  it("anexa o estado ao rótulo", () => {
    expect(rotuloServico("Corte", 60, "agendado")).toBe("Corte · 1h");
    expect(rotuloServico("Corte", 60, "atendimento")).toBe("Corte · em atendimento");
    expect(rotuloServico("Corte", 60, "concluido")).toBe("Corte · concluído");
    expect(rotuloServico("Corte", 60, "noshow")).toBe("Corte · não compareceu");
  });
});

describe("diaVencimentoCliente", () => {
  const cliente = (patch: Partial<Cliente> = {}): Cliente =>
    ({ id: "c1", nome: "X", telefone: "", email: "", plano: "Mensal", tag: "", ultimoAtendimento: "—", totalGasto: 0, atendimentos: 0, desde: "", iniciais: "X", ...patch }) as Cliente;
  const plano = (diaVencimento?: number): Plano => ({ id: "p1", nome: "Mensal", valor: 99, diaVencimento });

  it("usa o dia do próprio cliente quando existe", () => {
    expect(diaVencimentoCliente(cliente({ diaVencimento: 12 }), plano(3))).toBe(12);
  });
  it("herda o dia do plano nos assinantes antigos (sem dia próprio)", () => {
    expect(diaVencimentoCliente(cliente(), plano(3))).toBe(3);
  });
  it("cai no padrão quando não há nem um nem outro", () => {
    expect(diaVencimentoCliente(cliente(), plano())).toBe(5);
    expect(diaVencimentoCliente(null)).toBe(5);
  });
  it("mantém o dia dentro de 1..28", () => {
    expect(diaVencimentoCliente(cliente({ diaVencimento: 31 }))).toBe(28);
    expect(diaVencimentoCliente(cliente({ diaVencimento: 0 }))).toBe(5); // 0 é falsy → padrão
    expect(diaVencimentoCliente(cliente({ diaVencimento: -4 }))).toBe(1);
  });
});

describe("cobranças — helpers", () => {
  const base: Transacao = {
    id: "t", data: "01 jun", clienteNome: "X", servico: "Corte", barbeiroNome: "Y",
    valor: 50, status: "pendente", forma: "pix",
  };
  it("statusCobranca deriva 'atrasado' de dueDate vencida", () => {
    expect(statusCobranca({ ...base, dueDate: "2026-06-01" }, "2026-06-23")).toBe("atrasado");
    expect(statusCobranca({ ...base, dueDate: "2026-07-01" }, "2026-06-23")).toBe("pendente");
    expect(statusCobranca({ ...base, status: "pago" }, "2026-06-23")).toBe("pago");
  });
  it("valorCobrado/valorRecebido caem em `valor` quando ausentes", () => {
    expect(valorCobrado(base)).toBe(50);
    expect(valorCobrado({ ...base, amount: 80 })).toBe(80);
    expect(valorRecebido(base)).toBe(50);
    expect(valorRecebido({ ...base, amountReceived: 45 })).toBe(45);
  });
  it("tipoCobranca default é avulso", () => {
    expect(tipoCobranca(base)).toBe("avulso");
    expect(tipoCobranca({ ...base, type: "mensalidade" })).toBe("mensalidade");
  });
});

describe("clientePossuiPlanoAtivo", () => {
  it("qualquer plano != Avulso conta como ativo", () => {
    expect(clientePossuiPlanoAtivo({ plano: "Mensal" } as Cliente)).toBe(true);
    expect(clientePossuiPlanoAtivo({ plano: "Avulso" } as Cliente)).toBe(false);
    expect(clientePossuiPlanoAtivo({ plano: "" } as Cliente)).toBe(false);
    expect(clientePossuiPlanoAtivo(null)).toBe(false);
  });
});

describe("ehDoCliente", () => {
  const cli = { id: "c1", nome: "João" } as Cliente;
  it("prefere id, cai para nome (legado)", () => {
    expect(ehDoCliente({ clienteId: "c1" }, cli)).toBe(true);
    expect(ehDoCliente({ clienteId: "c2" }, cli)).toBe(false);
    expect(ehDoCliente({ clienteNome: "João" }, cli)).toBe(true);
    expect(ehDoCliente({ clienteNome: "Outro" }, cli)).toBe(false);
  });
});

describe("selectResumoFinanceiro", () => {
  it("soma recebido no mês, a receber e em atraso", () => {
    const transacoes: Transacao[] = [
      { id: "1", data: "", clienteNome: "", servico: "", barbeiroNome: "", forma: "pix", status: "pago", paidAt: "2026-06-10", amountReceived: 100, valor: 100 },
      { id: "2", data: "", clienteNome: "", servico: "", barbeiroNome: "", forma: "pix", status: "pago", paidAt: "2026-05-10", amountReceived: 50, valor: 50 },
      { id: "3", data: "", clienteNome: "", servico: "", barbeiroNome: "", forma: "pix", status: "pendente", dueDate: "2026-06-01", amount: 80, valor: 80 },
      { id: "4", data: "", clienteNome: "", servico: "", barbeiroNome: "", forma: "pix", status: "pendente", dueDate: "2026-07-01", amount: 70, valor: 70 },
    ];
    const state = { transacoes } as AppState;
    const r = selectResumoFinanceiro(state, "2026-06-23");
    expect(r.recebidoMes).toBe(100); // só o pago em junho
    expect(r.aReceber).toBe(70); // pendente futuro
    expect(r.emAtraso).toBe(80); // pendente vencido
    expect(r.qtdAtraso).toBe(1);
  });
});
