import { describe, expect, it } from "vitest";
import {
  deveAlertar,
  deveEmitirBoleto,
  lerReferencia,
  mensalidadesAGerar,
  montarReferencia,
  vencimentoBoleto,
  type DadosCiclo,
} from "@/lib/cobranca-ciclo";
import type { Cliente, Plano, Transacao } from "@/lib/types";

// Este módulo decide quem é cobrado e quando. Errar aqui não gera um bug de tela: gera um
// boleto duplicado no CPF de alguém. Daí o peso dos testes de idempotência.

function cliente(p: Partial<Cliente> & { id: string; nome: string }): Cliente {
  return {
    telefone: "11990000000",
    email: "",
    plano: "Mensal",
    tag: "",
    ultimoAtendimento: "",
    totalGasto: 0,
    atendimentos: 0,
    desde: "2026-01-01",
    iniciais: "XX",
    ...p,
  };
}

function cobranca(p: Partial<Transacao> & { id: string }): Transacao {
  return {
    data: "05 jul",
    clienteNome: "Rui Alves",
    servico: "Mensal",
    barbeiroNome: "",
    valor: 140,
    status: "pendente",
    forma: "pix",
    type: "mensalidade",
    ...p,
  };
}

const PLANO: Plano = { id: "pl1", nome: "Mensal", valor: 140 };
const RUI = cliente({ id: "c1", nome: "Rui Alves", planId: "pl1", diaVencimento: 5 });

function dados(p: Partial<DadosCiclo> = {}): DadosCiclo {
  return { clientes: [RUI], planos: [PLANO], transacoes: [], ...p };
}

describe("mensalidadesAGerar", () => {
  it("gera a mensalidade do assinante no dia de vencimento DELE", () => {
    const { novas } = mensalidadesAGerar(dados(), "2026-07");
    expect(novas).toHaveLength(1);
    expect(novas[0]).toMatchObject({
      clienteId: "c1",
      type: "mensalidade",
      planId: "pl1",
      status: "pendente",
      dueDate: "2026-07-05",
      valor: 140,
      amount: 140,
    });
  });

  // O ponto mais importante do módulo: o botão manual e o disparo agendado rodam a mesma
  // função, e o agendador bate de hora em hora. Sem isto, um assinante receberia várias
  // cobranças pelo mesmo mês.
  it("é idempotente — não gera de novo se já existe uma no ciclo", () => {
    const jaExiste = cobranca({ id: "t1", clienteId: "c1", dueDate: "2026-07-05" });
    const { novas } = mensalidadesAGerar(dados({ transacoes: [jaExiste] }), "2026-07");
    expect(novas).toHaveLength(0);
  });

  it("não regera a mensalidade do mês que o cliente JÁ PAGOU", () => {
    const paga = cobranca({ id: "t1", clienteId: "c1", dueDate: "2026-07-05", status: "pago", paidAt: "2026-07-03" });
    const { novas } = mensalidadesAGerar(dados({ transacoes: [paga] }), "2026-07");
    expect(novas).toHaveLength(0);
  });

  it("a cobrança do mês passado não impede a deste mês", () => {
    const antiga = cobranca({ id: "t1", clienteId: "c1", dueDate: "2026-06-05" });
    const { novas } = mensalidadesAGerar(dados({ transacoes: [antiga] }), "2026-07");
    expect(novas).toHaveLength(1);
    expect(novas[0].dueDate).toBe("2026-07-05");
  });

  it("ignora cliente avulso e conta o assinante cujo plano sumiu do cadastro", () => {
    const avulso = cliente({ id: "c2", nome: "Zé", plano: "Avulso" });
    const orfao = cliente({ id: "c3", nome: "Ana", plano: "Premium" }); // plano não existe mais
    const { novas, semPlano } = mensalidadesAGerar(
      dados({ clientes: [avulso, orfao], transacoes: [] }),
      "2026-07",
    );
    expect(novas).toHaveLength(0);
    expect(semPlano).toBe(1);
  });

  it("uma cobrança AVULSA no mês não conta como mensalidade já gerada", () => {
    const corte = cobranca({ id: "t1", clienteId: "c1", dueDate: "2026-07-05", type: "avulso" });
    const { novas } = mensalidadesAGerar(dados({ transacoes: [corte] }), "2026-07");
    expect(novas).toHaveLength(1);
  });
});

describe("deveAlertar", () => {
  const t = cobranca({ id: "t1", dueDate: "2026-07-05" });

  it("avisa exatamente N dias antes do vencimento", () => {
    expect(deveAlertar(t, "2026-07-02", 3)).toBe(true);
  });

  // A janela é exata e não "faltam até 3 dias": o ciclo roda todo dia, e um "até" faria a
  // mesma pessoa receber a mesma mensagem três dias seguidos.
  it("não avisa nos outros dias da janela", () => {
    expect(deveAlertar(t, "2026-07-01", 3)).toBe(false);
    expect(deveAlertar(t, "2026-07-03", 3)).toBe(false);
    expect(deveAlertar(t, "2026-07-04", 3)).toBe(false);
  });

  it("não remanda o que já foi enviado", () => {
    const enviado = cobranca({ id: "t1", dueDate: "2026-07-05", alertaEnviadoEm: "2026-07-02T11:00:00.000Z" });
    expect(deveAlertar(enviado, "2026-07-02", 3)).toBe(false);
  });

  it("não avisa quem já pagou", () => {
    const pago = cobranca({ id: "t1", dueDate: "2026-07-05", status: "pago", paidAt: "2026-07-01" });
    expect(deveAlertar(pago, "2026-07-02", 3)).toBe(false);
  });

  it("ignora cobrança avulsa e cobrança sem vencimento", () => {
    expect(deveAlertar(cobranca({ id: "t1", dueDate: "2026-07-05", type: "avulso" }), "2026-07-02", 3)).toBe(false);
    expect(deveAlertar(cobranca({ id: "t1" }), "2026-07-02", 3)).toBe(false);
  });

  it("atravessa a virada do mês", () => {
    const agosto = cobranca({ id: "t1", dueDate: "2026-08-02" });
    expect(deveAlertar(agosto, "2026-07-30", 3)).toBe(true);
  });
});

describe("deveEmitirBoleto", () => {
  const t = cobranca({ id: "t1", dueDate: "2026-07-05" });

  it("emite no dia do vencimento, se não pagou", () => {
    expect(deveEmitirBoleto(t, "2026-07-05")).toBe(true);
  });

  it("não emite antes do vencimento", () => {
    expect(deveEmitirBoleto(t, "2026-07-04")).toBe(false);
  });

  // Se o disparo ficou fora do ar no dia exato, quem venceu ontem ainda precisa ser cobrado.
  it("emite para quem já venceu em dias anteriores", () => {
    expect(deveEmitirBoleto(t, "2026-07-09")).toBe(true);
  });

  // A trava que impede cobrar a mesma pessoa duas vezes.
  it("nunca emite um segundo boleto para a mesma cobrança", () => {
    const comBoleto = cobranca({
      id: "t1",
      dueDate: "2026-07-05",
      boleto: {
        provedor: "asaas",
        cobrancaId: "pay_1",
        url: "https://x",
        linhaDigitavel: "0000",
        vencimentoISO: "2026-07-08",
        emitidoEm: "2026-07-05T11:00:00.000Z",
      },
    });
    expect(deveEmitirBoleto(comBoleto, "2026-07-05")).toBe(false);
  });

  it("não emite para quem pagou — inclusive o 'atrasado' legado que tem paidAt", () => {
    expect(deveEmitirBoleto(cobranca({ id: "t1", dueDate: "2026-07-05", status: "pago" }), "2026-07-09")).toBe(false);
    expect(
      deveEmitirBoleto(cobranca({ id: "t1", dueDate: "2026-07-05", status: "atrasado", paidAt: "2026-07-06" }), "2026-07-09"),
    ).toBe(false);
  });

  it("boleto é só de mensalidade", () => {
    expect(deveEmitirBoleto(cobranca({ id: "t1", dueDate: "2026-07-05", type: "avulso" }), "2026-07-09")).toBe(false);
  });
});

describe("vencimentoBoleto", () => {
  it("dá a folga pedida a partir de hoje", () => {
    expect(vencimentoBoleto("2026-07-05", 3)).toBe("2026-07-08");
  });

  it("nunca vence hoje nem no passado, mesmo se configurado com 0", () => {
    expect(vencimentoBoleto("2026-07-05", 0)).toBe("2026-07-08");
    expect(vencimentoBoleto("2026-07-05", -4)).toBe("2026-07-06");
  });

  it("atravessa a virada do mês", () => {
    expect(vencimentoBoleto("2026-07-30", 3)).toBe("2026-08-02");
  });
});

describe("referência do gateway", () => {
  it("vai e volta", () => {
    expect(lerReferencia(montarReferencia("tenantA", "tx9"))).toEqual({ tenantId: "tenantA", transacaoId: "tx9" });
  });

  // O webhook é público: o que chega nele não é confiável e não pode virar caminho de doc.
  it("recusa o que está fora do formato", () => {
    expect(lerReferencia("")).toBeNull();
    expect(lerReferencia("soUmPedaco")).toBeNull();
    expect(lerReferencia("a.b.c")).toBeNull();
    expect(lerReferencia("tenant/../outro.tx")).toBeNull();
    expect(lerReferencia("tenant.tx/../../outro")).toBeNull();
  });
});
