import { describe, expect, it } from "vitest";
import { GESTAO_TOKEN_RE, MENSAGEM_BLOQUEIO, podeGerenciar } from "@/lib/gestao-agendamento";

const HOJE = "2026-03-17";
const AGORA = "14:30";
const ag = (over: Partial<{ date: string; inicio: string; status: string }> = {}) => ({
  date: "2026-03-20",
  inicio: "10:00",
  status: "agendado",
  ...over,
});

describe("GESTAO_TOKEN_RE", () => {
  it("aceita 32 caracteres hexadecimais", () => {
    expect(GESTAO_TOKEN_RE.test("a".repeat(32))).toBe(true);
    expect(GESTAO_TOKEN_RE.test("0123456789abcdef0123456789abcdef")).toBe(true);
  });

  it("recusa tamanho errado, maiúsculas e caracteres fora do hex", () => {
    expect(GESTAO_TOKEN_RE.test("a".repeat(31))).toBe(false);
    expect(GESTAO_TOKEN_RE.test("a".repeat(33))).toBe(false);
    expect(GESTAO_TOKEN_RE.test("A".repeat(32))).toBe(false);
    expect(GESTAO_TOKEN_RE.test("z".repeat(32))).toBe(false);
    expect(GESTAO_TOKEN_RE.test("")).toBe(false);
  });

  it("recusa tentativa de injeção de caminho", () => {
    expect(GESTAO_TOKEN_RE.test("../../etc/passwd")).toBe(false);
  });
});

describe("podeGerenciar", () => {
  it("libera agendamento futuro", () => {
    expect(podeGerenciar(ag(), HOJE, AGORA)).toEqual({ ok: true });
  });

  it("bloqueia o que já foi cancelado", () => {
    expect(podeGerenciar(ag({ status: "cancelado" }), HOJE, AGORA)).toEqual({ ok: false, motivo: "cancelado" });
  });

  it("bloqueia atendimento já realizado, em curso ou dado como no-show", () => {
    for (const status of ["concluido", "atendimento", "noshow"]) {
      expect(podeGerenciar(ag({ status }), HOJE, AGORA).motivo).toBe("finalizado");
    }
  });

  it("bloqueia data que já passou", () => {
    expect(podeGerenciar(ag({ date: "2026-03-16" }), HOJE, AGORA).motivo).toBe("passado");
  });

  it("libera horário de hoje ainda por vir", () => {
    expect(podeGerenciar(ag({ date: HOJE, inicio: "15:00" }), HOJE, AGORA)).toEqual({ ok: true });
  });

  it("bloqueia horário de hoje que já passou", () => {
    expect(podeGerenciar(ag({ date: HOJE, inicio: "13:00" }), HOJE, AGORA).motivo).toBe("passado");
  });

  it("trata o exato instante de início como já começado", () => {
    expect(podeGerenciar(ag({ date: HOJE, inicio: AGORA }), HOJE, AGORA).motivo).toBe("passado");
  });

  it("cancelamento tem precedência sobre horário passado", () => {
    expect(podeGerenciar(ag({ date: "2026-01-01", status: "cancelado" }), HOJE, AGORA).motivo).toBe("cancelado");
  });

  it("todo motivo de bloqueio tem mensagem para o cliente", () => {
    const motivos = [
      podeGerenciar(ag({ status: "cancelado" }), HOJE, AGORA).motivo,
      podeGerenciar(ag({ status: "concluido" }), HOJE, AGORA).motivo,
      podeGerenciar(ag({ date: "2026-01-01" }), HOJE, AGORA).motivo,
    ];
    for (const m of motivos) {
      expect(m).toBeDefined();
      expect(MENSAGEM_BLOQUEIO[m!]).toBeTruthy();
    }
  });
});
