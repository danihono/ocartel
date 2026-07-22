import { describe, it, expect } from "vitest";
import {
  validarCpf,
  normalizarCpf,
  normalizarTelefone,
  maskTelefone,
  maskCpf,
  formatarCpf,
  iniciaisDe,
  mapearCabecalhos,
  indexarExistentes,
  montarLinhas,
} from "@/lib/clientes-import";
import type { Cliente, Plano } from "@/lib/types";

describe("validarCpf", () => {
  it("aceita CPF válido", () => {
    expect(validarCpf("111.444.777-35")).toBe(true); // exemplo do modelo CSV
  });
  it("rejeita dígitos verificadores errados", () => {
    expect(validarCpf("111.444.777-00")).toBe(false);
  });
  it("rejeita repetidos e tamanho errado", () => {
    expect(validarCpf("111.111.111-11")).toBe(false);
    expect(validarCpf("123")).toBe(false);
  });
});

describe("máscaras / normalização", () => {
  it("normalizarTelefone deixa só dígitos (máx 11)", () => {
    expect(normalizarTelefone("(11) 99999-0000")).toBe("11999990000");
    expect(normalizarTelefone("11 9 9999 0000 123")).toBe("11999990000");
  });
  it("maskTelefone formata progressivamente", () => {
    expect(maskTelefone("11999990000")).toBe("(11) 99999-0000");
    expect(maskTelefone("1133601200")).toBe("(11) 3360-1200");
  });
  it("normalizarCpf / maskCpf / formatarCpf", () => {
    expect(normalizarCpf("111.444.777-35")).toBe("11144477735");
    expect(maskCpf("11144477735")).toBe("111.444.777-35");
    expect(formatarCpf("11144477735")).toBe("111.444.777-35");
    expect(formatarCpf("123")).toBe("123"); // devolve original se != 11 dígitos
  });
  it("iniciaisDe pega até duas letras maiúsculas", () => {
    expect(iniciaisDe("joão pedro almeida")).toBe("JP");
    expect(iniciaisDe("Maria")).toBe("M");
    expect(iniciaisDe("")).toBe("?");
  });
});

describe("mapearCabecalhos", () => {
  it("casa colunas por sinônimo, cada coluna usada uma vez", () => {
    const m = mapearCabecalhos(["Nome completo", "CPF", "Celular", "E-mail", "Plano"]);
    expect(m).toEqual({ nome: 0, cpf: 1, telefone: 2, email: 3, plano: 4 });
  });
  it("colunas ausentes ficam -1", () => {
    const m = mapearCabecalhos(["Nome", "Telefone"]);
    expect(m.nome).toBe(0);
    expect(m.telefone).toBe(1);
    expect(m.cpf).toBe(-1);
    expect(m.email).toBe(-1);
    expect(m.plano).toBe(-1);
  });
});

describe("montarLinhas", () => {
  const planos: Plano[] = [{ id: "p1", nome: "Mensal", valor: 89 }];
  const mapping = { nome: 0, cpf: 1, telefone: 2, email: 3, plano: 4 };
  const vazio = indexarExistentes([]);

  it("valida CPF obrigatório e marca inválidos", () => {
    const linhas = montarLinhas({
      rows: [["Fulano", "", "", "", ""]],
      mapping,
      planos,
      existentes: vazio,
    });
    expect(linhas[0].status).toBe("invalido");
    expect(linhas[0].erros).toContain("CPF ausente");
  });

  it("linha válida vira cliente pronto e casa o plano", () => {
    const linhas = montarLinhas({
      rows: [["João da Silva", "111.444.777-35", "(11) 99999-0000", "joao@ex.com", "Mensal"]],
      mapping,
      planos,
      existentes: vazio,
    });
    expect(linhas[0].status).toBe("ok");
    expect(linhas[0].cliente?.planId).toBe("p1");
    expect(linhas[0].cliente?.plano).toBe("Mensal");
    expect(linhas[0].cliente?.telefoneNorm).toBe("11999990000");
  });

  it("plano desconhecido vira Avulso com aviso (não bloqueia)", () => {
    const linhas = montarLinhas({
      rows: [["Ana", "111.444.777-35", "", "", "Inexistente"]],
      mapping,
      planos,
      existentes: vazio,
    });
    expect(linhas[0].status).toBe("ok");
    expect(linhas[0].cliente?.plano).toBe("Avulso");
    expect(linhas[0].avisos.join(" ")).toMatch(/não encontrado/i);
  });

  it("deduplica dentro do arquivo (1ª ok, 2ª duplicado)", () => {
    const linhas = montarLinhas({
      rows: [
        ["Cliente A", "111.444.777-35", "", "", ""],
        ["Cliente A copia", "111.444.777-35", "", "", ""],
      ],
      mapping,
      planos,
      existentes: vazio,
    });
    expect(linhas[0].status).toBe("ok");
    expect(linhas[1].status).toBe("duplicado");
  });

  it("deduplica contra a base existente (por telefone)", () => {
    const base: Cliente[] = [
      { id: "c1", nome: "Já existe", telefone: "(11) 99999-0000", telefoneNorm: "11999990000", email: "", plano: "Avulso", tag: "", ultimoAtendimento: "—", totalGasto: 0, atendimentos: 0, desde: "jan/26", iniciais: "JE" },
    ];
    const linhas = montarLinhas({
      rows: [["Outro Nome", "111.444.777-35", "(11) 99999-0000", "", ""]],
      mapping,
      planos,
      existentes: indexarExistentes(base),
    });
    expect(linhas[0].status).toBe("duplicado");
  });
});
