import { describe, expect, it } from "vitest";
import {
  agoraEmBrasilia,
  deveAvisar,
  deveDispararAgora,
  horaConfigurada,
} from "@/lib/confirmacao-disparo";

// O servidor que dispara roda em UTC e a barbearia pensa em horário de Brasília
// (UTC-3, sem horário de verão desde 2019). Errar isto manda a confirmação 3 h fora,
// e o erro só aparece em produção — daí estes testes.
describe("agoraEmBrasilia", () => {
  it("converte a hora de UTC para Brasília", () => {
    const { hora } = agoraEmBrasilia(new Date("2026-08-13T11:00:00Z"));
    expect(hora).toBe(8);
  });

  it("usa o DIA de Brasília, não o de UTC, na virada", () => {
    // 02:00Z de 13/ago ainda é 23:00 do dia 12 em São Paulo. Pegar o dia de UTC aqui
    // faria o disparo varrer a agenda do dia errado.
    const { dataISO, hora } = agoraEmBrasilia(new Date("2026-08-13T02:00:00Z"));
    expect(dataISO).toBe("2026-08-12");
    expect(hora).toBe(23);
  });
});

describe("horaConfigurada", () => {
  it("lê a hora de formatos comuns", () => {
    expect(horaConfigurada("08:00")).toBe(8);
    expect(horaConfigurada("8:30")).toBe(8);
    expect(horaConfigurada("19:45")).toBe(19);
  });

  it("recusa o que não dá para interpretar", () => {
    expect(horaConfigurada("")).toBeNull();
    expect(horaConfigurada(undefined)).toBeNull();
    expect(horaConfigurada("manhã")).toBeNull();
    expect(horaConfigurada("25:00")).toBeNull();
  });
});

describe("deveDispararAgora", () => {
  it("não dispara quando está desligado", () => {
    expect(deveDispararAgora({ hora: "08:00", ativa: false }, 8)).toBe(false);
    expect(deveDispararAgora(undefined, 8)).toBe(false);
  });

  it("dispara na hora configurada", () => {
    expect(deveDispararAgora({ hora: "08:00", ativa: true }, 8)).toBe(true);
  });

  it("continua disparando na janela de retentativa", () => {
    // Uma falha de rede às 8h precisa de nova chance; `confirmacaoEnviadaEm` garante
    // que quem já recebeu não recebe de novo.
    expect(deveDispararAgora({ hora: "08:00", ativa: true }, 9)).toBe(true);
    expect(deveDispararAgora({ hora: "08:00", ativa: true }, 10)).toBe(true);
  });

  it("para depois da janela", () => {
    expect(deveDispararAgora({ hora: "08:00", ativa: true }, 11)).toBe(false);
    expect(deveDispararAgora({ hora: "08:00", ativa: true }, 7)).toBe(false);
  });

  it("não dá a volta na meia-noite", () => {
    // Configurada às 23h, não pode disparar à 1h — ali "hoje" já é outro dia e a
    // agenda varrida seria a errada.
    expect(deveDispararAgora({ hora: "23:00", ativa: true }, 1)).toBe(false);
  });
});

describe("deveAvisar", () => {
  const base = { status: "agendado", confirmToken: "abc123" };

  it("avisa agendamento pendente com token", () => {
    expect(deveAvisar(base)).toBe(true);
  });

  it("avisa também quem já confirmou (vira lembrete)", () => {
    expect(deveAvisar({ ...base, status: "confirmado" })).toBe(true);
  });

  it("não repete quem já foi avisado", () => {
    expect(deveAvisar({ ...base, confirmacaoEnviadaEm: "2026-08-13T11:00:00.000Z" })).toBe(false);
  });

  it("ignora cancelado, concluído e bloqueio de agenda", () => {
    expect(deveAvisar({ ...base, status: "cancelado" })).toBe(false);
    expect(deveAvisar({ ...base, status: "concluido" })).toBe(false);
    expect(deveAvisar({ ...base, status: "bloqueio" })).toBe(false);
  });

  it("não avisa sem token — o link de confirmação seria inválido", () => {
    expect(deveAvisar({ status: "agendado" })).toBe(false);
  });
});
