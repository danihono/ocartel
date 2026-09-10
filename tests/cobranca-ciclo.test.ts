import { describe, expect, it } from "vitest";
import {
  cartaoUtilizavel,
  deveAlertar,
  deveCobrarNoCartao,
  deveEmitirBoleto,
  JANELA_RECONCILIACAO_MIN,
  lerReferencia,
  MAX_RECUSAS_CARTAO,
  mensalidadesAGerar,
  montarReferencia,
  precisaReconciliarCartao,
  situacaoReconciliada,
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

// ---- Cartão de crédito ----
//
// Estes testes existem por um motivo específico: aqui, ao contrário do boleto, o erro
// não é um papel a mais no WhatsApp de alguém — é dinheiro debitado duas vezes da conta
// de um cliente. A trava é o assunto.

const CARTAO = { provedor: "asaas" as const, tentadoEm: "2026-07-05T12:00:00.000Z" };

describe("deveCobrarNoCartao", () => {
  it("cobra a mensalidade vencida e em aberto", () => {
    expect(deveCobrarNoCartao(cobranca({ id: "t1", dueDate: "2026-07-05" }), "2026-07-05")).toBe(true);
  });

  // Mesmo `<=` do boleto: se o disparo ficou fora do ar no dia exato, quem venceu ontem
  // ainda precisa ser cobrado.
  it("pega quem venceu antes de hoje", () => {
    expect(deveCobrarNoCartao(cobranca({ id: "t1", dueDate: "2026-07-04" }), "2026-07-05")).toBe(true);
  });

  it("não cobra antes do vencimento", () => {
    expect(deveCobrarNoCartao(cobranca({ id: "t1", dueDate: "2026-07-09" }), "2026-07-05")).toBe(false);
  });

  it("não cobra o que já foi pago", () => {
    const paga = cobranca({ id: "t1", dueDate: "2026-07-05", status: "pago", paidAt: "2026-07-03" });
    expect(deveCobrarNoCartao(paga, "2026-07-05")).toBe(false);
  });

  it("não cobra avulso — cartão salvo é coisa de assinatura", () => {
    const avulso = cobranca({ id: "t1", dueDate: "2026-07-05", type: "avulso" });
    expect(deveCobrarNoCartao(avulso, "2026-07-05")).toBe(false);
  });

  it("não cobra sem vencimento", () => {
    expect(deveCobrarNoCartao(cobranca({ id: "t1", dueDate: undefined }), "2026-07-05")).toBe(false);
  });

  // A TRAVA. Um `true` em qualquer destes três é débito em dobro no cartão de alguém.
  it.each(["enviando", "aprovada", "recusada"] as const)(
    "não tenta de novo quando já existe tentativa %s",
    (situacao) => {
      const t = cobranca({ id: "t1", dueDate: "2026-07-05", cartaoCobranca: { ...CARTAO, situacao } });
      expect(deveCobrarNoCartao(t, "2026-07-05")).toBe(false);
    },
  );

  it("não abre um segundo caminho quando o boleto já está na mão do cliente", () => {
    const t = cobranca({
      id: "t1",
      dueDate: "2026-07-05",
      boleto: {
        provedor: "asaas",
        cobrancaId: "pay_1",
        url: "https://asaas/x",
        linhaDigitavel: "0001",
        vencimentoISO: "2026-07-08",
        emitidoEm: "2026-07-05T12:00:00.000Z",
      },
    });
    expect(deveCobrarNoCartao(t, "2026-07-05")).toBe(false);
  });
});

describe("deveEmitirBoleto com cartão em jogo", () => {
  // Quem tem cartão não recebe boleto automático — nem depois da recusa. A dona decide.
  it.each(["enviando", "aprovada", "recusada"] as const)(
    "não emite boleto quando houve tentativa de cartão %s",
    (situacao) => {
      const t = cobranca({ id: "t1", dueDate: "2026-07-05", cartaoCobranca: { ...CARTAO, situacao } });
      expect(deveEmitirBoleto(t, "2026-07-05")).toBe(false);
    },
  );

  // Regressão: sem cartão nenhum, nada mudou para as barbearias que já usam boleto.
  it("segue emitindo normalmente para quem nunca cadastrou cartão", () => {
    expect(deveEmitirBoleto(cobranca({ id: "t1", dueDate: "2026-07-05" }), "2026-07-05")).toBe(true);
  });

  /**
   * As duas funções são elegíveis ao mesmo tempo numa mensalidade vencida, e têm que
   * ser: `deveCobrarNoCartao` responde "esta cobrança PODE ir para o cartão", sem saber
   * se o cliente tem cartão — quem sabe é a rota, que filtra por `cartaoUtilizavel`.
   *
   * O que garante que ninguém é cobrado duas vezes é a SEQUÊNCIA: a etapa do cartão roda
   * antes e grava a trava, e é a trava que fecha o boleto. Este teste percorre essa
   * sequência, que é a invariante que interessa.
   */
  it.each(["enviando", "aprovada", "recusada"] as const)(
    "uma vez tentado o cartão (%s), o boleto está fechado para aquela cobrança",
    (situacao) => {
      const t = cobranca({ id: "t1", dueDate: "2026-07-05" });

      // Antes: elegível aos dois caminhos, e é a rota que escolhe pelo cartão do cliente.
      expect(deveCobrarNoCartao(t, "2026-07-05")).toBe(true);
      expect(deveEmitirBoleto(t, "2026-07-05")).toBe(true);

      // Depois da trava gravada pela etapa do cartão: nenhum dos dois caminhos reabre.
      const tentada: Transacao = { ...t, cartaoCobranca: { ...CARTAO, situacao } };
      expect(deveCobrarNoCartao(tentada, "2026-07-05")).toBe(false);
      expect(deveEmitirBoleto(tentada, "2026-07-05")).toBe(false);
    },
  );
});

describe("cartaoUtilizavel", () => {
  it("aceita o cartão saudável", () => {
    expect(cartaoUtilizavel({ ativo: true })).toBe(true);
    expect(cartaoUtilizavel({ ativo: true, falhasSeguidas: MAX_RECUSAS_CARTAO - 1 })).toBe(true);
  });

  it("aposenta no limite de recusas", () => {
    expect(cartaoUtilizavel({ ativo: true, falhasSeguidas: MAX_RECUSAS_CARTAO })).toBe(false);
  });

  it("recusa cartão desativado e cliente sem cartão", () => {
    expect(cartaoUtilizavel({ ativo: false })).toBe(false);
    expect(cartaoUtilizavel(null)).toBe(false);
    expect(cartaoUtilizavel(undefined)).toBe(false);
  });
});

describe("conciliação do cartão", () => {
  const enviando = (tentadoEm: string) =>
    cobranca({ id: "t1", dueDate: "2026-07-05", cartaoCobranca: { provedor: "asaas", situacao: "enviando", tentadoEm } });

  it("deixa em paz a cobrança que acabou de sair", () => {
    expect(precisaReconciliarCartao(enviando("2026-07-05T12:00:00.000Z"), "2026-07-05T12:05:00.000Z")).toBe(false);
  });

  it("confere a que passou da janela", () => {
    const agora = new Date(Date.parse("2026-07-05T12:00:00.000Z") + JANELA_RECONCILIACAO_MIN * 60_000).toISOString();
    expect(precisaReconciliarCartao(enviando("2026-07-05T12:00:00.000Z"), agora)).toBe(true);
  });

  it("ignora quem não está em voo", () => {
    const t = cobranca({ id: "t1", cartaoCobranca: { ...CARTAO, situacao: "aprovada" } });
    expect(precisaReconciliarCartao(t, "2026-07-06T12:00:00.000Z")).toBe(false);
    expect(precisaReconciliarCartao(cobranca({ id: "t1" }), "2026-07-06T12:00:00.000Z")).toBe(false);
  });

  it("não trava com data podre — só não reconcilia", () => {
    expect(precisaReconciliarCartao(enviando("ontem de manhã"), "2026-07-06T12:00:00.000Z")).toBe(false);
  });

  it("lê o gateway: pago é aprovada", () => {
    expect(situacaoReconciliada([{ status: "CONFIRMED", billingType: "CREDIT_CARD" }])).toBe("aprovada");
    expect(situacaoReconciliada([{ status: "RECEIVED", billingType: "CREDIT_CARD" }])).toBe("aprovada");
  });

  // Na dúvida, recusada: a dona vê no painel e confere, e o webhook corrige o registro.
  it("qualquer outra coisa é recusada", () => {
    expect(situacaoReconciliada([{ status: "PENDING", billingType: "CREDIT_CARD" }])).toBe("recusada");
    expect(situacaoReconciliada([{ status: "OVERDUE", billingType: "CREDIT_CARD" }])).toBe("recusada");
    expect(situacaoReconciliada([])).toBe("recusada");
  });

  // Um boleto pago na mesma referência não prova que o CARTÃO passou.
  it("não confunde boleto pago com cartão aprovado", () => {
    expect(situacaoReconciliada([{ status: "RECEIVED", billingType: "BOLETO" }])).toBe("recusada");
  });
});
