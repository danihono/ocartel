import { describe, it, expect } from "vitest";
import { aniversariantes, clientesSumidos, diasAteAniversario, mensagemAniversario, mensagemReativacao } from "@/lib/reativacao";
import type { Agendamento, Cliente } from "@/lib/types";

const cl = (p: Partial<Cliente>): Cliente => ({ id: p.id ?? "c", nome: "Cliente", telefone: "", email: "", plano: "Avulso", tag: "", ultimoAtendimento: "", totalGasto: 0, atendimentos: 0, desde: "", iniciais: "C", ...p });
const ag = (p: Partial<Agendamento>): Agendamento => ({ id: "a", date: "2026-11-02", barbeiroId: "b", clienteNome: "X", servico: "Corte", inicio: "10:00", duracaoMin: 30, status: "agendado", ...p });

describe("diasAteAniversario", () => {
  it("hoje, daqui a pouco e no ano que vem", () => {
    expect(diasAteAniversario("1990-10-27", "2026-10-27")).toBe(0);
    expect(diasAteAniversario("1990-10-30", "2026-10-27")).toBe(3);
    expect(diasAteAniversario("1990-10-26", "2026-10-27")).toBe(364);
    expect(diasAteAniversario(undefined, "2026-10-27")).toBeNull();
  });
  it("29/02 vira 28/02 em ano comum", () => {
    expect(diasAteAniversario("2000-02-29", "2027-02-28")).toBe(0);
  });
});

describe("aniversariantes", () => {
  it("só os da janela, do mais próximo ao mais distante", () => {
    const lista = aniversariantes(
      [cl({ id: "a", nome: "A", nascimento: "1990-11-02" }), cl({ id: "b", nome: "B", nascimento: "1990-10-27" }), cl({ id: "c", nome: "C", nascimento: "1990-12-25" })],
      "2026-10-27",
    );
    expect(lista.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("clientesSumidos", () => {
  const hoje = "2026-10-27";
  const base = [
    cl({ id: "longe", nome: "Longe", ultimoAtendimentoISO: "2026-07-01" }),
    cl({ id: "perto", nome: "Perto", ultimoAtendimentoISO: "2026-10-20" }),
    cl({ id: "nunca", nome: "Nunca" }),
    cl({ id: "marcado", nome: "Marcado", ultimoAtendimentoISO: "2026-06-01" }),
    cl({ id: "meio", nome: "Meio", ultimoAtendimentoISO: "2026-09-01" }),
  ];
  it("45+ dias sem vir, sem horário marcado, do mais antigo ao mais recente", () => {
    const s = clientesSumidos(base, [ag({ clienteId: "marcado" })], hoje);
    expect(s.map((c) => c.id)).toEqual(["longe", "meio"]);
  });
  it("horário marcado também é reconhecido pelo nome, sem vínculo", () => {
    const s = clientesSumidos(base, [ag({ clienteNome: "longe " })], hoje);
    expect(s.map((c) => c.id)).toEqual(["marcado", "meio"]);
  });
  it("agendamento passado, cancelado ou falta não conta como marcado", () => {
    const s = clientesSumidos(base, [ag({ clienteId: "marcado", date: "2026-10-01" }), ag({ clienteId: "marcado", status: "cancelado" })], hoje);
    expect(s.map((c) => c.id)).toContain("marcado");
  });
});

describe("mensagens", () => {
  it("reativação usa o primeiro nome e leva o link", () => {
    const m = mensagemReativacao({ cliente: "Rafael Lima", barbearia: "Cartel", link: "https://x/book/cartel" });
    expect(m).toContain("Fala, Rafael!");
    expect(m).toContain("https://x/book/cartel");
  });
  it("aniversário muda no próprio dia", () => {
    expect(mensagemAniversario({ cliente: "Ana", barbearia: "Cartel", hoje: true })).toContain("Parabéns, Ana!");
    expect(mensagemAniversario({ cliente: "Ana", barbearia: "Cartel", hoje: false })).toContain("está chegando");
  });
});
