import { describe, it, expect } from "vitest";
import { montarLista, waDoCliente } from "@/lib/whatsapp/lista";
import type { Conversa } from "@/lib/whatsapp/espelho";
import type { Cliente } from "@/lib/types";

function cliente(p: Partial<Cliente> & { id: string; nome: string }): Cliente {
  return {
    telefone: "",
    email: "",
    plano: "Avulso",
    tag: "",
    ultimoAtendimento: "—",
    totalGasto: 0,
    atendimentos: 0,
    desde: "jan/25",
    iniciais: "XX",
    ...p,
  } as Cliente;
}

function conversa(p: Partial<Conversa> & { id: string }): Conversa {
  return { name: "", whatsappDigits: "", ...p } as Conversa;
}

const RICARDO = cliente({ id: "c1", nome: "Ricardo Alves", telefone: "(19) 98448-7271" });
const ANGELA = cliente({ id: "c2", nome: "Ângela Souza", telefone: "19991110000" });
const SEM_TEL = cliente({ id: "c3", nome: "Zoraide", telefone: "" });

describe("waDoCliente", () => {
  it("aceita telefone com máscara e cai no telefoneNorm quando falta o telefone", () => {
    expect(waDoCliente(RICARDO)).toBe("5519984487271");
    expect(waDoCliente(cliente({ id: "x", nome: "X", telefone: "", telefoneNorm: "19984487271" }))).toBe(
      "5519984487271",
    );
    expect(waDoCliente(SEM_TEL)).toBeNull();
  });
});

describe("montarLista — casamento", () => {
  it("usa o nome do cadastro no lugar do pushName do WhatsApp", () => {
    const c = conversa({ id: "wa_5519984487271", whatsappDigits: "5519984487271", name: "Ricardo 💈" });
    const { conversas } = montarLista([c], [RICARDO], "");
    expect(conversas[0].nome).toBe("Ricardo Alves");
    expect(conversas[0].cliente?.id).toBe("c1");
  });

  // O vínculo é um fato gravado; o telefone é coincidência de string. Quando os dois
  // discordam (cadastro corrigido, por exemplo), vence o vínculo.
  it("prefere o vínculo guardado ao telefone", () => {
    const c = conversa({ id: "wa_5519984487271", whatsappDigits: "5519984487271", clienteId: "c2" });
    const { conversas } = montarLista([c], [RICARDO, ANGELA], "");
    expect(conversas[0].cliente?.id).toBe("c2");
  });

  it("mostra o número quando quem escreveu não é cliente", () => {
    const c = conversa({ id: "wa_5511999998888", whatsappDigits: "5511999998888" });
    const { conversas } = montarLista([c], [RICARDO], "");
    expect(conversas[0].nome).toBe("+5511999998888");
    expect(conversas[0].cliente).toBeUndefined();
  });

  it("cliente que já tem conversa não reaparece em 'sem conversa'", () => {
    const c = conversa({ id: "wa_5519984487271", whatsappDigits: "5519984487271" });
    const { semConversa } = montarLista([c], [RICARDO, ANGELA], "");
    expect(semConversa.map((i) => i.cliente.id)).toEqual(["c2"]);
  });
});

describe("montarLista — contador e ordem", () => {
  it("conta só quem dá para adicionar, e ignora a busca", () => {
    const lista = montarLista([], [RICARDO, ANGELA, SEM_TEL], "ricardo");
    expect(lista.totalSemConversa).toBe(2); // Zoraide não tem telefone
    expect(lista.semConversa.map((i) => i.cliente.id)).toEqual(["c1"]);
  });

  it("cadastro sem telefone aparece por último, marcado", () => {
    const lista = montarLista([], [SEM_TEL, ANGELA], "");
    expect(lista.semConversa.map((i) => i.cliente.id)).toEqual(["c2", "c3"]);
    expect(lista.semConversa[1].wa).toBeNull();
  });

  it("busca sem acento acha o cliente", () => {
    expect(montarLista([], [ANGELA], "angela").semConversa).toHaveLength(1);
    expect(montarLista([], [ANGELA], "ÂNGELA").semConversa).toHaveLength(1);
  });

  it("busca na conversa também acha pelo número", () => {
    const c = conversa({ id: "wa_5511999998888", whatsappDigits: "5511999998888" });
    expect(montarLista([c], [], "99999").conversas).toHaveLength(1);
    expect(montarLista([c], [], "outro").conversas).toHaveLength(0);
  });
});
