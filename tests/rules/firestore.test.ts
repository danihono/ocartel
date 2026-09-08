// Testes das Firebase Security Rules contra o emulador do Firestore.
//
// Cada bloco aqui é a REGRESSÃO de um achado da auditoria de segurança
// (docs/auditoria-seguranca.md). Não são testes de "a regra compila": são o ataque,
// escrito, provando que a porta está fechada — e, do outro lado, provando que a vitrine
// pública e o painel legítimo continuam funcionando.
//
// Rode com: npm run test:rules
//
// `RULES_FILE` aponta para outro arquivo de regras. É como se reproduz a evidência da
// auditoria: rodando esta MESMA suíte contra as regras antigas, os casos de F-01, F-02 e
// F-04 falham — ou seja, o ataque passava.

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const T_VITIMA = "tenantVitima";
const T_ATACANTE = "tenantAtacante";

let env: RulesTestEnvironment;

/** Cliente do dono legítimo da barbearia-vítima. */
const admVitima = () => env.authenticatedContext("uidAdminVitima").firestore();
/** Cliente de quem acabou de se cadastrar e ainda não tem perfil nenhum. */
const forasteiro = () => env.authenticatedContext("uidForasteiro").firestore();
const barbeiro = () => env.authenticatedContext("uidBarbeiro").firestore();
const superAdmin = () => env.authenticatedContext("uidSuper").firestore();
/** Visitante da vitrine: sem conta, sem sessão. */
const anonimo = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "ocartel-497f8",
    firestore: { rules: readFileSync(process.env.RULES_FILE ?? "firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

// Estado inicial de cada teste, gravado SEM regras (é o servidor que grava isto na vida
// real: perfis vêm do onboarding, o espelho de WhatsApp vem do daemon).
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/uidAdminVitima"), { role: "admin", tenantId: T_VITIMA, nome: "Dona", email: "dona@x.com" });
    await setDoc(doc(db, "users/uidBarbeiro"), { role: "barbeiro", tenantId: T_VITIMA, nome: "Zé", email: "ze@x.com" });
    await setDoc(doc(db, "users/uidSuper"), { role: "superAdmin", tenantId: "", nome: "Super", email: "s@x.com" });

    await setDoc(doc(db, `tenants/${T_VITIMA}`), { nome: "Barbearia Vítima", slug: "vitima", ownerUid: "uidAdminVitima", mrr: "R$ 249", status: "ativo" });
    await setDoc(doc(db, `tenants/${T_ATACANTE}`), { nome: "Outra", slug: "outra", ownerUid: "uidForasteiro" });
    await setDoc(doc(db, "slugs/vitima"), { tenantId: T_VITIMA });

    await setDoc(doc(db, `tenants/${T_VITIMA}/config/main`), { nome: "Barbearia Vítima", endereco: "R. X", horario: { abre: "09:00", fecha: "19:00" } });
    await setDoc(doc(db, `tenants/${T_VITIMA}/servicos/corte`), { nome: "Corte", preco: 75, duracaoMin: 40 });
    await setDoc(doc(db, `tenants/${T_VITIMA}/barbeiros/ze`), { nome: "Zé" });
    await setDoc(doc(db, `tenants/${T_VITIMA}/clientes/c1`), { nome: "Cliente Um", telefone: "11999999999" });
    await setDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`), { valor: 100, amount: 100, clienteNome: "Cliente Um", status: "pendente" });
    await setDoc(doc(db, `tenants/${T_VITIMA}/agendamentos/a1`), { status: "agendado", duracaoMin: 40, date: "2030-01-01", inicio: "10:00", barbeiroId: "ze", clienteNome: "Cliente Um" });
    await setDoc(doc(db, `tenants/${T_VITIMA}/planos/p1`), { nome: "Mensal", valor: 120 });
    await setDoc(doc(db, `tenants/${T_VITIMA}/planosTiers/pro`), { id: "pro", nome: "Pro", preco: 249 });

    // O segredo do reino: chave do gateway de cobrança e vínculo do WhatsApp.
    await setDoc(doc(db, `tenants/${T_VITIMA}/private/asaas`), { apiKey: "CHAVE_SECRETA", ambiente: "producao", webhookToken: "tok" });
    await setDoc(doc(db, `tenants/${T_VITIMA}/private/whatsapp`), { uid: `barbearia-${T_VITIMA}` });

    // Espelho das conversas de WhatsApp da vítima.
    await setDoc(doc(db, `users/barbearia-${T_VITIMA}/contacts/ct1`), { nome: "Cliente Um", whatsappDigits: "5511999999999" });
    await setDoc(doc(db, `users/barbearia-${T_VITIMA}/contacts/ct1/messages/m1`), { text: "oi", fromMe: false });
  });
});

// ---------------------------------------------------------------------------
describe("F-01 · escalação de privilégio pelo auto-cadastro", () => {
  it("conta nova NÃO cria o próprio perfil apontando para a barbearia de outro", async () => {
    // ESTE é o ataque. Antes da correção, esta escrita passava — e com ela vinha tudo
    // que os casos abaixo verificam.
    await assertFails(
      setDoc(doc(forasteiro(), "users/uidForasteiro"), {
        role: "admin",
        tenantId: T_VITIMA,
        nome: "Invasor",
        email: "invasor@x.com",
      }),
    );
  });

  it("conta nova não cria perfil nem para uma barbearia própria (o vínculo é do servidor)", async () => {
    await assertFails(
      setDoc(doc(forasteiro(), "users/uidForasteiro"), {
        role: "admin",
        tenantId: T_ATACANTE,
        nome: "Invasor",
        email: "invasor@x.com",
      }),
    );
  });

  it("sem perfil, não lê nada da barbearia alheia", async () => {
    const db = forasteiro();
    await assertFails(getDoc(doc(db, `tenants/${T_VITIMA}/private/asaas`)));
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/clientes`)));
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/transacoes`)));
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/agendamentos`)));
    await assertFails(getDoc(doc(db, `tenants/${T_VITIMA}`)));
  });

  it("sem perfil, não lê o espelho de WhatsApp da barbearia alheia", async () => {
    const db = forasteiro();
    await assertFails(getDocs(collection(db, `users/barbearia-${T_VITIMA}/contacts`)));
    await assertFails(getDocs(collection(db, `users/barbearia-${T_VITIMA}/contacts/ct1/messages`)));
  });

  it("o admin não promove a si mesmo nem troca de barbearia", async () => {
    const db = admVitima();
    await assertFails(updateDoc(doc(db, "users/uidAdminVitima"), { role: "superAdmin" }));
    await assertFails(updateDoc(doc(db, "users/uidAdminVitima"), { tenantId: T_ATACANTE }));
    // Nem planta campo novo (um barbeiroId apontando para outro profissional, p.ex.).
    await assertFails(updateDoc(doc(db, "users/uidAdminVitima"), { barbeiroId: "ze" }));
    // Trocar o próprio nome de exibição continua valendo.
    await assertSucceeds(updateDoc(doc(db, "users/uidAdminVitima"), { nome: "Dona Maria" }));
  });

  it("ninguém lê o perfil de outra pessoa", async () => {
    await assertFails(getDoc(doc(forasteiro(), "users/uidAdminVitima")));
    await assertSucceeds(getDoc(doc(admVitima(), "users/uidAdminVitima")));
    await assertSucceeds(getDoc(doc(superAdmin(), "users/uidAdminVitima")));
  });
});

// ---------------------------------------------------------------------------
describe("F-02 · enumeração pública das barbearias", () => {
  it("visitante não lista tenants nem slugs", async () => {
    await assertFails(getDocs(collection(anonimo(), "tenants")));
    await assertFails(getDocs(collection(anonimo(), "slugs")));
  });

  it("usuário comum também não lista tenants", async () => {
    await assertFails(getDocs(collection(forasteiro(), "tenants")));
  });

  it("visitante não lê o doc do tenant (ownerUid, plano, MRR)", async () => {
    await assertFails(getDoc(doc(anonimo(), `tenants/${T_VITIMA}`)));
  });

  it("a VITRINE continua funcionando sem login", async () => {
    const db = anonimo();
    await assertSucceeds(getDoc(doc(db, "slugs/vitima")));
    await assertSucceeds(getDoc(doc(db, `tenants/${T_VITIMA}/config/main`)));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/servicos`)));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/barbeiros`)));
  });

  it("a agenda e o cadastro NÃO são públicos", async () => {
    const db = anonimo();
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/agendamentos`)));
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/clientes`)));
    await assertFails(getDocs(collection(db, `tenants/${T_VITIMA}/config`)));
  });
});

// ---------------------------------------------------------------------------
describe("F-03 · o papel `barbeiro` não é um admin", () => {
  it("barbeiro NÃO lê a chave do gateway de cobrança", async () => {
    await assertFails(getDoc(doc(barbeiro(), `tenants/${T_VITIMA}/private/asaas`)));
    await assertFails(getDoc(doc(barbeiro(), `tenants/${T_VITIMA}/private/whatsapp`)));
  });

  it("barbeiro não mexe no financeiro nem no catálogo", async () => {
    const db = barbeiro();
    await assertFails(updateDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`), { status: "pago", paidAt: "2030-01-01", amountReceived: 100 }));
    await assertFails(deleteDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`)));
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/servicos/novo`), { nome: "X", preco: 1, duracaoMin: 10 }));
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/config/main`), { nome: "Renomeada" }));
    await assertFails(deleteDoc(doc(db, `tenants/${T_VITIMA}/clientes/c1`)));
  });

  it("barbeiro trabalha na agenda e vê o cadastro (a tela dele não quebra)", async () => {
    const db = barbeiro();
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/agendamentos`)));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/clientes`)));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/transacoes`)));
    await assertSucceeds(
      setDoc(doc(db, `tenants/${T_VITIMA}/agendamentos/bloqueio1`), { status: "bloqueio", duracaoMin: 60, date: "2030-01-02", inicio: "12:00", barbeiroId: "ze" }),
    );
  });
});

// ---------------------------------------------------------------------------
describe("F-04 · criação livre de tenants e squatting de slugs", () => {
  it("o navegador não cria tenant", async () => {
    await assertFails(setDoc(doc(forasteiro(), "tenants/novoTenant"), { nome: "Grátis", ownerUid: "uidForasteiro" }));
    await assertFails(setDoc(doc(admVitima(), "tenants/outroQualquer"), { nome: "Grátis", ownerUid: "uidAdminVitima" }));
  });

  it("o navegador não reserva nem sequestra slug", async () => {
    await assertFails(setDoc(doc(forasteiro(), "slugs/barbearia-do-joao"), { tenantId: T_ATACANTE }));
    await assertFails(setDoc(doc(forasteiro(), "slugs/vitima"), { tenantId: T_ATACANTE }));
    await assertFails(deleteDoc(doc(admVitima(), "slugs/vitima")));
  });
});

// ---------------------------------------------------------------------------
describe("F-13 · credencial não entra no doc público", () => {
  it("gravar apiKey/token em config/main é negado", async () => {
    const db = admVitima();
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/config/main`), { nome: "X", apiKey: "vazou" }));
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/config/main`), { nome: "X", webhookToken: "vazou" }));
    await assertSucceeds(setDoc(doc(db, `tenants/${T_VITIMA}/config/main`), { nome: "X", endereco: "R. Y" }));
  });
});

// ---------------------------------------------------------------------------
describe("não-regressão · o painel legítimo continua inteiro", () => {
  it("admin faz o CRUD da própria barbearia", async () => {
    const db = admVitima();
    await assertSucceeds(getDoc(doc(db, `tenants/${T_VITIMA}`)));
    await assertSucceeds(getDoc(doc(db, `tenants/${T_VITIMA}/private/asaas`)));
    await assertSucceeds(setDoc(doc(db, `tenants/${T_VITIMA}/private/asaas`), { apiKey: "nova", ambiente: "sandbox" }));
    await assertSucceeds(setDoc(doc(db, `tenants/${T_VITIMA}/clientes/c2`), { nome: "Cliente Dois" }));
    await assertSucceeds(deleteDoc(doc(db, `tenants/${T_VITIMA}/clientes/c2`)));
    await assertSucceeds(setDoc(doc(db, `tenants/${T_VITIMA}/servicos/barba`), { nome: "Barba", preco: 50, duracaoMin: 30 }));
    await assertSucceeds(setDoc(doc(db, `tenants/${T_VITIMA}/planos/p2`), { nome: "Anual", valor: 1200 }));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/sugestoes`)));
    await assertSucceeds(getDocs(collection(db, `tenants/${T_VITIMA}/conversas`)));
    await assertSucceeds(updateDoc(doc(db, `tenants/${T_VITIMA}`), { cidade: "Campinas · SP" }));
  });

  it("admin lê o espelho de WhatsApp da PRÓPRIA barbearia", async () => {
    const db = admVitima();
    await assertSucceeds(getDocs(collection(db, `users/barbearia-${T_VITIMA}/contacts`)));
    await assertSucceeds(getDocs(collection(db, `users/barbearia-${T_VITIMA}/contacts/ct1/messages`)));
    // ...e nunca ESCREVE nele: quem escreve é o daemon, pelo Admin SDK.
    await assertFails(setDoc(doc(db, `users/barbearia-${T_VITIMA}/contacts/ct1`), { unreadCount: 0 }));
  });

  it("superAdmin lista as barbearias (console do O Cartel)", async () => {
    await assertSucceeds(getDocs(collection(superAdmin(), "tenants")));
    await assertSucceeds(getDoc(doc(superAdmin(), `tenants/${T_VITIMA}/private/asaas`)));
  });

  it("as travas de auditoria das transações continuam de pé", async () => {
    const db = admVitima();
    // "pago" sem registro de recebimento: negado.
    await assertFails(updateDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`), { status: "pago" }));
    // reescrever o valor cobrado original: negado.
    await assertFails(updateDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`), { amount: 1 }));
    // o caminho legítimo: pago, com data e valor recebido.
    await assertSucceeds(
      updateDoc(doc(db, `tenants/${T_VITIMA}/transacoes/t1`), { status: "pago", paidAt: "2030-01-01", amountReceived: 100 }),
    );
  });

  it("a trava de idempotência da cobrança automática não é apagável pelo navegador", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `tenants/${T_VITIMA}/transacoes/t2`), {
        valor: 100, amount: 100, clienteNome: "C", status: "pendente", alertaEnviadoEm: "2030-01-01T00:00:00Z",
      });
    });
    await assertFails(updateDoc(doc(admVitima(), `tenants/${T_VITIMA}/transacoes/t2`), { alertaEnviadoEm: null }));
  });

  it("sugestões da IA e estado das conversas são somente-leitura para o navegador", async () => {
    const db = admVitima();
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/sugestoes/s1`), { status: "pendente" }));
    await assertFails(setDoc(doc(db, `tenants/${T_VITIMA}/conversas/ct1`), { iaPausadaAte: 0 }));
  });

  it("os caminhos do daemon são invisíveis para o navegador", async () => {
    const db = admVitima();
    await assertFails(getDoc(doc(db, "whatsappDaemon/heartbeat")));
    await assertFails(getDoc(doc(db, `whatsappStatus/barbearia-${T_VITIMA}`)));
    await assertFails(setDoc(doc(db, `users/barbearia-${T_VITIMA}/waCommands/x`), { type: "session.connect" }));
    // Os contadores do freio anti-robô também não são do navegador.
    await assertFails(getDoc(doc(db, "rateLimits/qualquer")));
  });
});
