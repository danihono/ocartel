import { describe, it, expect } from "vitest";
import { resumoParaModelo, type Contexto } from "@/lib/ia/contexto";

function contexto(p: Partial<Contexto> = {}): Contexto {
  return {
    tenantId: "t1",
    contactId: "wa_5519984487271",
    hojeISO: "2026-09-07",
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

describe("resumoParaModelo", () => {
  it("leva o id junto do nome — é por id que o modelo devolve a escolha", () => {
    const texto = resumoParaModelo(contexto());
    expect(texto).toContain("s1 · Corte · 30 min · R$ 50,00");
    expect(texto).toContain("b1 · João");
  });

  it("diz em que dias a barbearia abre", () => {
    const texto = resumoParaModelo(contexto());
    expect(texto).toContain("segunda");
    expect(texto).not.toContain("domingo");
  });

  // Chamar a pessoa pelo nome é metade do que faz a conversa não parecer robô.
  it("apresenta o cliente cadastrado, com plano e o que ele já tem marcado", () => {
    const texto = resumoParaModelo(
      contexto({
        cliente: {
          id: "c1",
          nome: "Ricardo Alves",
          telefone: "5519984487271",
          plano: "Mensal",
          proximos: [{ date: "2026-09-10", inicio: "14:00", servico: "Corte", barbeiro: "João" }],
        },
      }),
    );
    expect(texto).toContain("Ricardo Alves");
    expect(texto).toContain("Mensal");
    expect(texto).toContain("2026-09-10 às 14:00");
  });

  it("é explícito quando quem escreveu não é cliente", () => {
    const texto = resumoParaModelo(contexto());
    expect(texto).toContain("não está cadastrado");
  });

  it("diz que o cliente conhecido não tem nada marcado, em vez de omitir", () => {
    const texto = resumoParaModelo(contexto({ cliente: { id: "c1", nome: "Ana", telefone: "55", proximos: [] } }));
    expect(texto).toContain("Não tem nenhum horário marcado");
  });
});
