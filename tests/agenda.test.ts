import { describe, it, expect } from "vitest";
import { horaParaMin, intervalosSobrepoem, horarioLivre, ocupaHorario } from "@/lib/agenda";

describe("horaParaMin", () => {
  it("converte HH:MM em minutos", () => {
    expect(horaParaMin("00:00")).toBe(0);
    expect(horaParaMin("09:30")).toBe(570);
    expect(horaParaMin("19:00")).toBe(1140);
  });
});

describe("intervalosSobrepoem", () => {
  it("detecta sobreposição", () => {
    expect(intervalosSobrepoem("09:00", 60, "09:30", 30)).toBe(true);
    expect(intervalosSobrepoem("09:00", 30, "09:15", 30)).toBe(true);
  });
  it("intervalos adjacentes NÃO se sobrepõem (fim exclusivo)", () => {
    expect(intervalosSobrepoem("09:00", 30, "09:30", 30)).toBe(false);
    expect(intervalosSobrepoem("09:30", 30, "09:00", 30)).toBe(false);
  });
});

describe("horarioLivre", () => {
  const ocupados = [
    { inicio: "09:00", duracaoMin: 30 },
    { inicio: "14:00", duracaoMin: 60 },
  ];
  it("livre quando não colide com nada", () => {
    expect(horarioLivre(ocupados, "10:00", 30)).toBe(true);
    expect(horarioLivre(ocupados, "09:30", 30)).toBe(true); // encosta no fim do primeiro
  });
  it("ocupado quando colide", () => {
    expect(horarioLivre(ocupados, "09:15", 30)).toBe(false);
    expect(horarioLivre(ocupados, "14:30", 30)).toBe(false);
  });
  it("lista vazia é sempre livre", () => {
    expect(horarioLivre([], "12:00", 120)).toBe(true);
  });
});

describe("ocupaHorario", () => {
  it("todo status ocupa a cadeira, exceto cancelado", () => {
    expect(ocupaHorario("agendado")).toBe(true);
    expect(ocupaHorario("bloqueio")).toBe(true);
    expect(ocupaHorario("concluido")).toBe(true);
    expect(ocupaHorario("cancelado")).toBe(false);
  });
});
