import { describe, it, expect } from "vitest";
import { diaAberto, gerarHorarios, slotsLivres } from "@/lib/disponibilidade";

const EXPEDIENTE = { abre: "09:00", fecha: "12:00", diasAtivos: [true, true, true, true, true, true, false] };
// 2026-09-07 é uma segunda; 2026-09-13 é um domingo.
const SEGUNDA = "2026-09-07";
const DOMINGO = "2026-09-13";

describe("gerarHorarios", () => {
  it("vai de 15 em 15 e não passa do fechamento", () => {
    const h = gerarHorarios("09:00", "10:00");
    expect(h).toEqual(["09:00", "09:15", "09:30", "09:45"]);
  });
});

describe("diaAberto", () => {
  it("respeita os dias ativos, Seg..Dom", () => {
    expect(diaAberto(EXPEDIENTE, SEGUNDA)).toBe(true);
    expect(diaAberto(EXPEDIENTE, DOMINGO)).toBe(false);
  });

  it("sem configuração de dias, atende todo dia", () => {
    expect(diaAberto({ abre: "09:00", fecha: "12:00" }, DOMINGO)).toBe(true);
  });
});

describe("slotsLivres", () => {
  const base = { expediente: EXPEDIENTE, dateISO: SEGUNDA, hojeISO: "2026-09-01", duracaoMin: 30, ocupados: [] };

  it("dia fechado não oferece nada", () => {
    expect(slotsLivres({ ...base, dateISO: DOMINGO })).toEqual([]);
  });

  it("o atendimento inteiro precisa caber antes de fechar", () => {
    const slots = slotsLivres({ ...base, duracaoMin: 60 });
    expect(slots.at(-1)).toBe("11:00");
  });

  it("não oferece horário sobreposto ao que já está marcado", () => {
    const slots = slotsLivres({ ...base, ocupados: [{ inicio: "09:30", duracaoMin: 30 }] });
    expect(slots).not.toContain("09:15"); // encostaria no marcado
    expect(slots).not.toContain("09:30");
    expect(slots).not.toContain("09:45");
    expect(slots).toContain("09:00");
    expect(slots).toContain("10:00");
  });

  // Oferecer "hoje às 09:00" às 11h da manhã é o tipo de erro que o cliente percebe na hora.
  it("hoje, não oferece horário que já passou", () => {
    const slots = slotsLivres({ ...base, hojeISO: SEGUNDA, agoraMin: 10 * 60 });
    expect(slots[0]).toBe("10:00");
  });

  it("hoje, respeita a antecedência mínima", () => {
    const slots = slotsLivres({ ...base, hojeISO: SEGUNDA, agoraMin: 10 * 60, antecedenciaMin: 45 });
    expect(slots[0]).toBe("10:45");
  });
});
