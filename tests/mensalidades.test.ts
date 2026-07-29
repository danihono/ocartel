import { describe, expect, it } from "vitest";
import { cicloDe, idMensalidade, montarMensalidadesDoCiclo, vencimentoDoCiclo } from "@/lib/mensalidades";
import type { Cliente, Plano, Transacao } from "@/lib/types";

const plano = (over: Partial<Plano> = {}): Plano => ({
  id: "p1",
  nome: "Mensal Ouro",
  valor: 180,
  diaVencimento: 5,
  ativo: true,
  ...over,
});

const cliente = (over: Partial<Cliente> = {}): Cliente =>
  ({
    id: "c1",
    nome: "João Silva",
    telefone: "",
    plano: "Mensal Ouro",
    tag: "",
    ...over,
  }) as Cliente;

const cobranca = (over: Partial<Transacao> = {}): Transacao =>
  ({
    id: "tx1",
    data: "05 mar",
    clienteNome: "João Silva",
    clienteId: "c1",
    servico: "Mensal Ouro",
    barbeiroNome: "",
    valor: 180,
    status: "pendente",
    forma: "pix",
    type: "mensalidade",
    dueDate: "2026-03-05",
    ...over,
  }) as Transacao;

const base = { clientes: [cliente()], planos: [plano()], transacoes: [] as Transacao[], cicloMes: "2026-03" };

describe("idMensalidade", () => {
  it("é estável para o mesmo cliente e ciclo — é o que garante a idempotência", () => {
    expect(idMensalidade("c1", "2026-03")).toBe(idMensalidade("c1", "2026-03"));
  });

  it("separa ciclos e clientes diferentes", () => {
    expect(idMensalidade("c1", "2026-03")).not.toBe(idMensalidade("c1", "2026-04"));
    expect(idMensalidade("c1", "2026-03")).not.toBe(idMensalidade("c2", "2026-03"));
  });
});

describe("vencimentoDoCiclo", () => {
  it("usa o dia do plano", () => {
    expect(vencimentoDoCiclo("2026-03", 10)).toBe("2026-03-10");
  });

  it("cai no dia 5 quando o plano não define", () => {
    expect(vencimentoDoCiclo("2026-03")).toBe("2026-03-05");
  });

  it("limita a 28 para o vencimento existir em fevereiro", () => {
    expect(vencimentoDoCiclo("2026-02", 31)).toBe("2026-02-28");
  });

  it("limita o mínimo em 1", () => {
    expect(vencimentoDoCiclo("2026-03", 0)).toBe("2026-03-01");
  });
});

describe("cicloDe", () => {
  it("extrai YYYY-MM de uma data ISO", () => {
    expect(cicloDe("2026-03-17")).toBe("2026-03");
  });
});

describe("montarMensalidadesDoCiclo", () => {
  it("gera uma cobrança por assinante com plano vigente", () => {
    const { novas, semPlano } = montarMensalidadesDoCiclo(base);
    expect(semPlano).toBe(0);
    expect(novas).toHaveLength(1);
    expect(novas[0]).toMatchObject({
      id: idMensalidade("c1", "2026-03"),
      clienteId: "c1",
      type: "mensalidade",
      status: "pendente",
      planId: "p1",
      valor: 180,
      amount: 180,
      dueDate: "2026-03-05",
    });
  });

  it("não gera de novo quando a cobrança do ciclo já existe", () => {
    const { novas } = montarMensalidadesDoCiclo({ ...base, transacoes: [cobranca()] });
    expect(novas).toHaveLength(0);
  });

  it("ignora cobrança já paga do ciclo — pagar não reabre a cobrança", () => {
    const paga = cobranca({ status: "pago", paidAt: "2026-03-06" });
    expect(montarMensalidadesDoCiclo({ ...base, transacoes: [paga] }).novas).toHaveLength(0);
  });

  it("gera no ciclo seguinte mesmo com a cobrança do mês anterior presente", () => {
    const { novas } = montarMensalidadesDoCiclo({ ...base, transacoes: [cobranca()], cicloMes: "2026-04" });
    expect(novas).toHaveLength(1);
    expect(novas[0].dueDate).toBe("2026-04-05");
  });

  it("não confunde cobrança avulsa do mês com mensalidade", () => {
    const avulso = cobranca({ id: "tx9", type: "avulso", servico: "Corte" });
    expect(montarMensalidadesDoCiclo({ ...base, transacoes: [avulso] }).novas).toHaveLength(1);
  });

  it("casa o plano pelo vínculo planId, não pelo rótulo", () => {
    const cl = cliente({ planId: "p2", plano: "rótulo antigo qualquer" });
    const planos = [plano(), plano({ id: "p2", nome: "Mensal Prata", valor: 120 })];
    const { novas } = montarMensalidadesDoCiclo({ ...base, clientes: [cl], planos });
    expect(novas[0]).toMatchObject({ planId: "p2", valor: 120, servico: "Mensal Prata" });
  });

  it("não cobra plano inativo, e conta o cliente como sem plano", () => {
    const { novas, semPlano } = montarMensalidadesDoCiclo({ ...base, planos: [plano({ ativo: false })] });
    expect(novas).toHaveLength(0);
    expect(semPlano).toBe(1);
  });

  it("conta assinante sem plano cadastrado correspondente", () => {
    const { novas, semPlano } = montarMensalidadesDoCiclo({ ...base, planos: [] });
    expect(novas).toHaveLength(0);
    expect(semPlano).toBe(1);
  });

  it("não cobra nem conta cliente avulso", () => {
    const { novas, semPlano } = montarMensalidadesDoCiclo({
      ...base,
      clientes: [cliente({ id: "c2", nome: "Avulso", plano: "Avulso" })],
      planos: [],
    });
    expect(novas).toHaveLength(0);
    expect(semPlano).toBe(0);
  });

  it("deduplica cobrança antiga sem clienteId, casando pelo nome", () => {
    const legado = cobranca({ id: "txLegado", clienteId: undefined });
    expect(montarMensalidadesDoCiclo({ ...base, transacoes: [legado] }).novas).toHaveLength(0);
  });

  it("recusa ciclo malformado em vez de gerar vencimento inválido", () => {
    expect(montarMensalidadesDoCiclo({ ...base, cicloMes: "2026-3" }).novas).toHaveLength(0);
    expect(montarMensalidadesDoCiclo({ ...base, cicloMes: "" }).novas).toHaveLength(0);
  });

  it("gera para vários clientes de uma vez, cada um com seu id", () => {
    const clientes = [cliente(), cliente({ id: "c2", nome: "Maria" })];
    const { novas } = montarMensalidadesDoCiclo({ ...base, clientes });
    expect(novas.map((n) => n.id)).toEqual([idMensalidade("c1", "2026-03"), idMensalidade("c2", "2026-03")]);
  });
});
