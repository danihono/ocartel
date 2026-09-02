import { describe, it, expect } from "vitest";
import { validarProposta } from "@/lib/ia/sugestao";
import type { Contexto } from "@/lib/ia/contexto";

// 2026-09-07 é uma segunda-feira.
const HOJE = "2026-09-07";

function contexto(p: Partial<Contexto> = {}): Contexto {
  return {
    tenantId: "t1",
    contactId: "wa_5519984487271",
    hojeISO: HOJE,
    agoraMin: 8 * 60,
    barbearia: {
      nome: "O Cartel",
      expediente: { abre: "09:00", fecha: "18:00", diasAtivos: [true, true, true, true, true, true, false] },
    },
    servicos: [{ id: "s1", nome: "Corte", duracaoMin: 30, preco: 50 }],
    barbeiros: [{ id: "b1", nome: "João" }],
    cliente: { telefone: "5519984487271", proximos: [] },
    historico: [],
    ...p,
  };
}

const PROPOSTA = { servicoId: "s1", barbeiroId: "b1", date: HOJE, inicio: "10:00" };

describe("validarProposta", () => {
  it("aceita o que existe e está livre", () => {
    expect(validarProposta(contexto(), PROPOSTA, [])).toMatchObject({ ok: true });
  });

  // Cada uma destas é uma alucinação plausível do modelo — e todas custariam caro na porta
  // da barbearia, com o cliente parado esperando um horário que nunca existiu.
  it("recusa serviço que não existe", () => {
    const r = validarProposta(contexto(), { ...PROPOSTA, servicoId: "inventado" }, []);
    expect(r.ok).toBe(false);
  });

  it("recusa profissional que não existe", () => {
    const r = validarProposta(contexto(), { ...PROPOSTA, barbeiroId: "outro" }, []);
    expect(r.ok).toBe(false);
  });

  it("recusa data que já passou", () => {
    const r = validarProposta(contexto(), { ...PROPOSTA, date: "2026-09-06" }, []);
    expect(r.ok).toBe(false);
  });

  it("recusa dia em que a barbearia não abre", () => {
    const r = validarProposta(contexto(), { ...PROPOSTA, date: "2026-09-13" }, []); // domingo
    expect(r.ok).toBe(false);
  });

  it("recusa horário fora do formato", () => {
    expect(validarProposta(contexto(), { ...PROPOSTA, inicio: "10h" }, []).ok).toBe(false);
    expect(validarProposta(contexto(), { ...PROPOSTA, date: "07/09/2026" }, []).ok).toBe(false);
  });

  it("recusa horário já ocupado, e diz quais estão livres", () => {
    const r = validarProposta(contexto(), PROPOSTA, [{ inicio: "10:00", duracaoMin: 30 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("09:00");
  });

  it("recusa horário que não cabe antes de fechar", () => {
    const ctx = contexto({ servicos: [{ id: "s1", nome: "Barba+Corte", duracaoMin: 60, preco: 90 }] });
    expect(validarProposta(ctx, { ...PROPOSTA, inicio: "17:30" }, []).ok).toBe(false);
    expect(validarProposta(ctx, { ...PROPOSTA, inicio: "17:00" }, []).ok).toBe(true);
  });

  it("recusa horário de hoje que já passou", () => {
    const ctx = contexto({ agoraMin: 14 * 60 });
    expect(validarProposta(ctx, { ...PROPOSTA, inicio: "10:00" }, []).ok).toBe(false);
    expect(validarProposta(ctx, { ...PROPOSTA, inicio: "15:00" }, []).ok).toBe(true);
  });

  it("amanhã de manhã continua valendo, mesmo já sendo tarde hoje", () => {
    const ctx = contexto({ agoraMin: 17 * 60 });
    expect(validarProposta(ctx, { ...PROPOSTA, date: "2026-09-08", inicio: "09:00" }, []).ok).toBe(true);
  });
});
