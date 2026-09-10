// Ciclo automático de cobrança — chamado por um agendador externo (timer na VPS), de hora
// em hora. A rota é que decide QUAIS barbearias rodam naquela hora, olhando a config de
// cada uma: assim um único agendador atende todas, sem cron por barbearia. Mesmo desenho
// de `/api/confirmacoes/disparar`.
//
// Quatro etapas, nesta ordem, por barbearia:
//   1. gera as mensalidades que faltam no mês (idempotente);
//   2. avisa por WhatsApp quem vence em N dias (com convite de cartão, se cabe);
//   3. cobra no cartão salvo de quem venceu e não pagou;
//   4. emite boleto no CPF de quem venceu, não pagou e NÃO tem cartão.
//
// A etapa 3 é a única do sistema que move dinheiro sem ninguém presente, e a ordem das
// escritas ali é deliberada — ver `cobrarNoCartaoDosCandidatos`.
//
// Protegida por segredo compartilhado. Não é rota de usuário.

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { canalDoTenant, WhatsAppNaoConfigurado, type Canal } from "@/lib/canal";
import { cobradorDoTenant, CobradorNaoConfigurado, type Cobrador } from "@/lib/cobrador";
import {
  lerCartao,
  lerCartaoVitrine,
  registrarFalhaCartao,
  zerarFalhas,
  garantirLinkToken,
  type CartaoSalvo,
} from "@/lib/cobrador/cartoes";
import { linkCartao, montarCodigoCartao } from "@/lib/cartao-link";
import { telefoneWhatsApp, normalizarCpf, validarCpf } from "@/lib/clientes-import";
import {
  mensagemBoleto,
  mensagemCartaoCobrado,
  mensagemCartaoRecusado,
  mensagemRenovacao,
} from "@/lib/cobranca-mensagem";
import {
  agoraEmBrasilia,
  cartaoUtilizavel,
  deveAlertar,
  deveCobrarNoCartao,
  deveDispararAgora,
  deveEmitirBoleto,
  mensalidadesAGerar,
  montarReferencia,
  precisaReconciliarCartao,
  situacaoReconciliada,
  vencimentoBoleto,
  PADRAO_DIAS_ANTES_ALERTA,
  PADRAO_DIAS_VENCIMENTO_BOLETO,
} from "@/lib/cobranca-ciclo";
import { ehDoCliente } from "@/lib/selectors";
import type { Cliente, CobrancaAutomatica, CobrancaCartao, Plano, Transacao } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Resultado {
  tenantId: string;
  mensalidadesGeradas: number;
  alertas: number;
  boletos: number;
  falhas: number;
  /** Venceu, não pagou, mas o cadastro não tem CPF válido — boleto impossível. */
  semCpf: number;
  /** Marcado como assinante, mas o plano não existe mais no cadastro. */
  semPlano: number;
  /** Mensalidades quitadas no cartão salvo, sem ninguém tocar em nada. */
  cartoes: number;
  /** Recusas do emissor. NÃO viram boleto: ficam pendentes para a dona decidir. */
  cartoesRecusados: number;
  /** Cartões aposentados depois de recusas seguidas. */
  cartoesDesativados: number;
  /** Cobranças presas em "enviando" que a conciliação por referência resolveu. */
  cartoesReconciliados: number;
  /** Avisos de renovação que levaram junto o convite para cadastrar o cartão. */
  convitesCartao: number;
  /** O que ficou de fora e por quê (sem WhatsApp vinculado, sem gateway, erro). */
  avisos?: string[];
}

export async function POST(req: Request) {
  const segredo = process.env.COBRANCAS_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "COBRANCAS_SECRET não configurado." }, { status: 500 });
  }
  if (req.headers.get("x-cobrancas-secret") !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const { dataISO, hora } = agoraEmBrasilia();
  // Mesma resolução de `/api/confirmacoes/disparar`: a variável quando existe, o host da
  // requisição como reserva. O link do cartão precisa de origin absoluta — ele vai para o
  // WhatsApp do cliente.
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || new URL(req.url).origin;

  const tenants = await adminDb.collection("tenants").get();
  const resultados: Resultado[] = [];

  for (const tenantDoc of tenants.docs) {
    const tenantId = tenantDoc.id;
    const configSnap = await adminDb.doc(`tenants/${tenantId}/config/main`).get();
    const config = configSnap.data() ?? {};
    const cobranca = config.cobranca as CobrancaAutomatica | undefined;

    if (!deveDispararAgora(cobranca, hora)) continue;

    try {
      resultados.push(
        await rodarTenant({
          tenantId,
          nomeBarbearia: String(config.nome ?? ""),
          dataISO,
          origin,
          cobranca: cobranca!,
        }),
      );
    } catch (err) {
      resultados.push({ ...vazio(tenantId), avisos: [String(err)] });
    }
  }

  return NextResponse.json({ dataISO, hora, tenants: resultados });
}

function vazio(tenantId: string): Resultado {
  return {
    tenantId,
    mensalidadesGeradas: 0,
    alertas: 0,
    boletos: 0,
    falhas: 0,
    semCpf: 0,
    semPlano: 0,
    cartoes: 0,
    cartoesRecusados: 0,
    cartoesDesativados: 0,
    cartoesReconciliados: 0,
    convitesCartao: 0,
  };
}

function docs<T>(snap: FirebaseFirestore.QuerySnapshot): T[] {
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as T[];
}

/**
 * As cobranças que interessam ao ciclo, sem varrer o histórico inteiro:
 *   - tudo que vence NESTE mês (paga ou não) — é o que impede gerar mensalidade duplicada;
 *   - tudo que continua em aberto de meses anteriores — é o que ainda merece boleto.
 * Um doc que caia nas duas pontas entra uma vez só.
 */
async function cobrancasRelevantes(tenantId: string, cicloMes: string): Promise<Transacao[]> {
  const col = adminDb.collection(`tenants/${tenantId}/transacoes`);
  const [doMes, emAberto] = await Promise.all([
    col.where("dueDate", ">=", `${cicloMes}-01`).get(),
    col.where("status", "in", ["pendente", "atrasado"]).get(),
  ]);

  const porId = new Map<string, Transacao>();
  for (const t of [...docs<Transacao>(doMes), ...docs<Transacao>(emAberto)]) porId.set(t.id, t);
  return [...porId.values()];
}

async function rodarTenant(params: {
  tenantId: string;
  nomeBarbearia: string;
  dataISO: string;
  origin: string;
  cobranca: CobrancaAutomatica;
}): Promise<Resultado> {
  const { tenantId, nomeBarbearia, dataISO, origin, cobranca } = params;
  const cicloMes = dataISO.slice(0, 7);
  const r = vazio(tenantId);

  const [clientesSnap, planosSnap, transacoes] = await Promise.all([
    adminDb.collection(`tenants/${tenantId}/clientes`).get(),
    adminDb.collection(`tenants/${tenantId}/planos`).get(),
    cobrancasRelevantes(tenantId, cicloMes),
  ]);
  const clientes = docs<Cliente>(clientesSnap);
  const planos = docs<Plano>(planosSnap);

  // ---- 1. Mensalidades que faltam no ciclo ----
  const { novas, semPlano } = mensalidadesAGerar({ clientes, planos, transacoes }, cicloMes);
  r.semPlano = semPlano;

  const col = adminDb.collection(`tenants/${tenantId}/transacoes`);
  if (novas.length > 0) {
    const batch = adminDb.batch();
    const criadas: Transacao[] = [];
    for (const nova of novas) {
      const ref = col.doc();
      batch.set(ref, { ...nova, createdAt: new Date().toISOString() });
      criadas.push({ ...nova, id: ref.id });
    }
    await batch.commit();
    r.mensalidadesGeradas = criadas.length;
    // Uma mensalidade criada hoje que já vence hoje precisa entrar nas etapas seguintes na
    // MESMA rodada — senão o boleto dela só sairia amanhã.
    transacoes.push(...criadas);
  }

  // Os canais são resolvidos sob demanda: uma barbearia sem WhatsApp ainda emite boleto, e
  // uma sem gateway ainda avisa os clientes. Uma coisa não pode derrubar a outra.
  let canal: Canal | null | undefined;
  const pegarCanal = async (): Promise<Canal | null> => {
    if (canal === undefined) {
      try {
        canal = await canalDoTenant(tenantId);
      } catch (err) {
        canal = null;
        if (!(err instanceof WhatsAppNaoConfigurado)) throw err;
      }
    }
    return canal;
  };

  let cobrador: Cobrador | null | undefined;
  const pegarCobrador = async (): Promise<Cobrador | null> => {
    if (cobrador === undefined) {
      try {
        cobrador = await cobradorDoTenant(tenantId);
      } catch (err) {
        cobrador = null;
        if (!(err instanceof CobradorNaoConfigurado)) throw err;
      }
    }
    return cobrador;
  };

  const avisar = (texto: string) => {
    r.avisos = [...(r.avisos ?? []), texto];
  };

  const clienteDa = (t: Transacao): Cliente | undefined => clientes.find((c) => ehDoCliente(t, c));
  const diasAntes = cobranca.diasAntesAlerta ?? PADRAO_DIAS_ANTES_ALERTA;

  // A vitrine do cartão é lida SOB DEMANDA e memoizada: varrer a subcoleção inteira toda
  // hora custaria uma leitura por cliente cadastrado, e o que interessa são os poucos que
  // vencem hoje.
  const vitrines = new Map<string, Awaited<ReturnType<typeof lerCartaoVitrine>>>();
  const vitrineDo = async (clienteId: string) => {
    if (!vitrines.has(clienteId)) vitrines.set(clienteId, await lerCartaoVitrine(tenantId, clienteId));
    return vitrines.get(clienteId)!;
  };

  const linkDoCartao = async (clienteId: string) =>
    linkCartao(origin, montarCodigoCartao({ tenantId, clienteId, token: await garantirLinkToken(tenantId, clienteId) }));

  // ---- 2. Aviso de renovação (D-N) ----
  for (const t of transacoes) {
    if (!deveAlertar(t, dataISO, diasAntes)) continue;

    const cliente = clienteDa(t);
    const telefone = telefoneWhatsApp(cliente?.telefone ?? "");
    if (!cliente || !telefone) continue; // sem número utilizável — nada a fazer

    const zap = await pegarCanal();
    if (!zap) {
      // Sem WhatsApp vinculado nenhum alerta sai, e não adianta tentar os próximos. Os
      // BOLETOS seguem normalmente — uma coisa não derruba a outra.
      avisar("sem WhatsApp vinculado: alertas não enviados");
      break;
    }

    // O convite do cartão pega carona no aviso que já ia sair: custo zero, nenhuma
    // mensagem a mais, e é o canal natural de adoção. Só para quem ainda não tem cartão
    // utilizável — oferecer cadastro a quem já cadastrou é ruído.
    let convite: string | undefined;
    if (cobranca.cobrarNoCartao && !cartaoUtilizavel(await vitrineDo(cliente.id))) {
      try {
        convite = await linkDoCartao(cliente.id);
        r.convitesCartao += 1;
      } catch {
        // Sem link o aviso sai como sempre saiu. Não é motivo para não avisar ninguém.
      }
    }

    try {
      await zap.enviarMensagem(
        telefone,
        mensagemRenovacao({
          cliente: cliente.nome,
          barbearia: nomeBarbearia,
          plano: t.servico,
          valor: t.amount ?? t.valor,
          vencimentoISO: t.dueDate!,
          linkCartao: convite,
        }),
      );
      // Só marca DEPOIS do envio: marcar antes faria uma falha de rede virar cliente que
      // nunca é avisado, silenciosamente.
      await col.doc(t.id).set({ alertaEnviadoEm: new Date().toISOString() }, { merge: true });
      r.alertas += 1;
    } catch {
      // Uma falha não interrompe a fila. Como `alertaEnviadoEm` continua ausente, a janela
      // de retentativa (horas seguintes) pega este de novo.
      r.falhas += 1;
    }
  }

  // ---- 3. Cobrança no cartão salvo ----
  if (cobranca.cobrarNoCartao) {
    await rodarCartao({
      tenantId,
      nomeBarbearia,
      dataISO,
      transacoes,
      col,
      r,
      clienteDa,
      vitrineDo,
      linkDoCartao,
      pegarCanal,
      pegarCobrador,
      avisar,
    });
  }

  // ---- 4. Boleto para quem venceu, não pagou e não tem cartão ----
  //
  // `deveEmitirBoleto` recua diante de qualquer `cartaoCobranca`, e a etapa 3 acabou de
  // gravar essa trava. Então quem foi ao cartão — passando ou recusando — não cai aqui.
  if (!cobranca.emitirBoleto) return r;

  // Os candidatos são separados ANTES de tocar no gateway, de propósito. Contar `semCpf`
  // só depois de resolver o cobrador esconderia justamente o diagnóstico de quem ainda não
  // configurou o gateway — que é exatamente quem está montando tudo agora e precisa saber
  // que dois cadastros estão sem CPF.
  const candidatos: { t: Transacao; cliente: Cliente; cpf: string }[] = [];
  for (const t of transacoes) {
    if (!deveEmitirBoleto(t, dataISO)) continue;

    const cliente = clienteDa(t);
    const cpf = normalizarCpf(cliente?.cpf ?? "");
    if (!cliente || !validarCpf(cpf)) {
      // Sem CPF válido não existe boleto. Não é falha do sistema: é cadastro incompleto, e
      // a barbearia precisa ver isso no diagnóstico (e no painel) para arrumar.
      r.semCpf += 1;
      continue;
    }
    candidatos.push({ t, cliente, cpf });
  }

  if (candidatos.length === 0) return r;

  const gateway = await pegarCobrador();
  if (!gateway) {
    avisar("sem gateway de cobrança configurado");
    return r;
  }

  for (const { t, cliente, cpf } of candidatos) {
    try {
      const asaasId =
        cliente.asaasId ||
        (await gateway.garantirCliente({
          nome: cliente.nome,
          cpf,
          email: cliente.email || undefined,
          telefone: telefoneWhatsApp(cliente.telefone ?? "") ?? undefined,
        }));

      if (!cliente.asaasId) {
        await adminDb.doc(`tenants/${tenantId}/clientes/${cliente.id}`).set({ asaasId }, { merge: true });
        cliente.asaasId = asaasId;
      }

      const vencISO = vencimentoBoleto(dataISO, cobranca.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO);
      const emitido = await gateway.emitirBoleto({
        clienteExterno: asaasId,
        valor: t.amount ?? t.valor,
        vencimentoISO: vencISO,
        descricao: `${t.servico} · ${nomeBarbearia}`,
        referencia: montarReferencia(tenantId, t.id),
      });

      // Gravar ANTES de mandar a mensagem: o boleto já existe no gateway, e perder o
      // vínculo aqui significaria emitir um segundo na próxima rodada.
      await col.doc(t.id).set(
        {
          boleto: {
            provedor: "asaas",
            cobrancaId: emitido.cobrancaId,
            url: emitido.url,
            linhaDigitavel: emitido.linhaDigitavel,
            vencimentoISO: emitido.vencimentoISO,
            emitidoEm: new Date().toISOString(),
          },
        },
        { merge: true },
      );
      r.boletos += 1;

      const zap = await pegarCanal();
      const telefone = telefoneWhatsApp(cliente.telefone ?? "");
      if (zap && telefone) {
        await zap.enviarMensagem(
          telefone,
          mensagemBoleto({
            cliente: cliente.nome,
            barbearia: nomeBarbearia,
            plano: t.servico,
            valor: t.amount ?? t.valor,
            vencimentoISO: t.dueDate!,
            linkBoleto: emitido.url,
            linhaDigitavel: emitido.linhaDigitavel,
            vencimentoBoletoISO: emitido.vencimentoISO,
          }),
        );
      }
    } catch {
      r.falhas += 1;
    }
  }

  return r;
}

/**
 * Etapa 3 — debita a mensalidade no cartão salvo.
 *
 * É a única parte do sistema que tira dinheiro da conta de alguém sem ninguém presente,
 * e a ordem das escritas aqui é o que impede que isso aconteça duas vezes.
 *
 * O Asaas não tem header de idempotência. Um `POST /payments` que dá timeout pode ter
 * debitado o cartão de verdade, e a rodada seguinte não tem como saber. Por isso, e só
 * aqui, a trava é gravada em DUAS FASES: "enviando" antes da chamada, o resultado depois.
 * Um crash no meio deixa a cobrança presa em "enviando" — que é o estado seguro, porque
 * nem cobra de novo nem emite boleto — e quem a desatola é a conciliação por
 * `externalReference` na abertura da rodada seguinte.
 *
 * A etapa NÃO escreve `status: "pago"`. Quem dá baixa é o webhook, como no boleto: duas
 * fontes de verdade para "pago" divergiriam, e a divergência apareceria na tela como
 * mensalidade cobrada e ainda pendente.
 */
async function rodarCartao(p: {
  tenantId: string;
  nomeBarbearia: string;
  dataISO: string;
  transacoes: Transacao[];
  col: FirebaseFirestore.CollectionReference;
  r: Resultado;
  clienteDa: (t: Transacao) => Cliente | undefined;
  vitrineDo: (clienteId: string) => Promise<{ ativo?: boolean; falhasSeguidas?: number } | null>;
  linkDoCartao: (clienteId: string) => Promise<string>;
  pegarCanal: () => Promise<Canal | null>;
  pegarCobrador: () => Promise<Cobrador | null>;
  avisar: (texto: string) => void;
}): Promise<void> {
  const { tenantId, nomeBarbearia, dataISO, transacoes, col, r, clienteDa, avisar } = p;
  const agoraISO = new Date().toISOString();

  // ---- 3.0 Conciliação: o que ficou pendurado em "enviando" ----
  const penduradas = transacoes.filter((t) => precisaReconciliarCartao(t, agoraISO));
  const candidatos = juntarCandidatos({ transacoes, dataISO, clienteDa });

  if (penduradas.length === 0 && candidatos.length === 0) return;

  const gateway = await p.pegarCobrador();
  if (!gateway) {
    avisar("sem gateway de cobrança configurado: cartão não cobrado");
    return;
  }

  for (const t of penduradas) {
    try {
      const achadas = await gateway.procurarCobrancas(montarReferencia(tenantId, t.id));
      const situacao = situacaoReconciliada(achadas);
      const daCobranca = achadas.find((c) => c.billingType === "CREDIT_CARD");

      await gravarSituacao(col, t, {
        situacao,
        ...(daCobranca ? { cobrancaId: daCobranca.id } : {}),
        ...(situacao === "recusada" ? { motivo: "Não confirmada no gateway (conciliação)." } : {}),
      });
      r.cartoesReconciliados += 1;
    } catch {
      // Segue presa em "enviando" para a próxima rodada. Chutar uma situação aqui é o que
      // não se pode fazer: "aprovada" errado deixa a mensalidade em aberto para sempre,
      // "recusada" errado pode virar uma segunda cobrança.
      r.falhas += 1;
    }
  }

  // ---- 3.1/3.2 Cobrança de quem venceu ----
  for (const { t, cliente } of candidatos) {
    const vitrine = await p.vitrineDo(cliente.id);
    if (!cartaoUtilizavel(vitrine)) continue; // sem cartão, ou aposentado: é caso de boleto

    const cartao = await lerCartao(tenantId, cliente.id);
    if (!cartao) continue;
    if (!cartao.ipCadastro) {
      // O gateway exige `remoteIp` na recobrança, e o IP certo é o de quem autorizou.
      // Sem ele não se cobra — e a barbearia precisa ver isso, não descobrir pelo silêncio.
      avisar(`cartão de ${cliente.nome} sem IP de cadastro: não cobrável`);
      continue;
    }

    // FASE 1: a trava, antes de qualquer chamada. Um crash a partir daqui deixa a
    // cobrança presa em "enviando", não cobrada duas vezes.
    const tentadoEm = new Date().toISOString();
    await col.doc(t.id).set(
      { cartaoCobranca: { provedor: "asaas", situacao: "enviando", tentadoEm } satisfies CobrancaCartao },
      { merge: true },
    );

    try {
      const valor = t.amount ?? t.valor;
      const resultado = await gateway.cobrarNoCartao({
        // O id do gateway vem do próprio doc do cartão, não de `cliente.asaasId`: o
        // token é por cliente lá dentro, e é aquele par que o gateway aceita.
        clienteExterno: cartao.clienteExterno,
        cartaoToken: cartao.token,
        valor,
        vencimentoISO: dataISO,
        descricao: `${t.servico} · ${nomeBarbearia}`,
        referencia: montarReferencia(tenantId, t.id),
        ipRemoto: cartao.ipCadastro,
      });

      // FASE 2: o resultado.
      if (resultado.situacao === "aprovada") {
        await gravarSituacao(col, t, {
          situacao: "aprovada",
          cobrancaId: resultado.cobrancaId,
          tentadoEm,
          ...(resultado.bandeira ? { bandeira: resultado.bandeira } : {}),
          ...(resultado.ultimosDigitos ? { ultimosDigitos: resultado.ultimosDigitos } : {}),
        });
        await zerarFalhas(tenantId, cliente.id);
        r.cartoes += 1;
        await avisarCliente(p, cliente, (link) =>
          mensagemCartaoCobrado({
            cliente: cliente.nome,
            barbearia: nomeBarbearia,
            plano: t.servico,
            valor,
            ultimosDigitos: cartao.ultimosDigitos,
            link,
          }),
        );
        continue;
      }

      await gravarSituacao(col, t, {
        situacao: "recusada",
        tentadoEm,
        motivo: resultado.motivo,
        ...(resultado.codigo ? { codigo: resultado.codigo } : {}),
      });
      const { aposentado } = await registrarFalhaCartao(tenantId, cliente.id, resultado.motivo);
      r.cartoesRecusados += 1;
      if (aposentado) r.cartoesDesativados += 1;

      // NÃO emite boleto: por decisão de produto, quem tem cartão salvo não recebe boleto
      // automático. A cobrança fica pendente e a recusa aparece destacada no painel, onde
      // a dona resolve caso a caso — inclusive emitindo o boleto pelo botão manual.
      await avisarCliente(p, cliente, (link) =>
        mensagemCartaoRecusado({
          cliente: cliente.nome,
          barbearia: nomeBarbearia,
          plano: t.servico,
          valor,
          ultimosDigitos: cartao.ultimosDigitos,
          link,
          aposentado,
        }),
      );
    } catch {
      // Falha do GATEWAY, não do cartão (recusa não lança). A transação fica em
      // "enviando" e a conciliação da próxima rodada descobre se debitou ou não.
      r.falhas += 1;
    }
  }
}

/** Quem vence hoje (ou antes), está em aberto e ainda não teve tentativa de cartão. */
function juntarCandidatos(p: {
  transacoes: Transacao[];
  dataISO: string;
  clienteDa: (t: Transacao) => Cliente | undefined;
}): { t: Transacao; cliente: Cliente }[] {
  const out: { t: Transacao; cliente: Cliente }[] = [];
  for (const t of p.transacoes) {
    if (!deveCobrarNoCartao(t, p.dataISO)) continue;
    const cliente = p.clienteDa(t);
    if (!cliente) continue;
    out.push({ t, cliente });
  }
  return out;
}

/**
 * Fecha a trava com a situação final, preservando `tentadoEm` da fase 1.
 *
 * O objeto é gravado INTEIRO (e não com merge de campo) porque `cartaoCobranca` é o que
 * as regras do Firestore tratam como imutável: meia trava é pior que trava nenhuma.
 */
async function gravarSituacao(
  col: FirebaseFirestore.CollectionReference,
  t: Transacao,
  patch: Partial<CobrancaCartao> & { situacao: CobrancaCartao["situacao"] },
): Promise<void> {
  const cartaoCobranca: CobrancaCartao = {
    provedor: "asaas",
    tentadoEm: patch.tentadoEm ?? t.cartaoCobranca?.tentadoEm ?? new Date().toISOString(),
    ...t.cartaoCobranca,
    ...patch,
    resolvidoEm: new Date().toISOString(),
  };
  await col.doc(t.id).set({ cartaoCobranca }, { merge: true });
}

/**
 * Manda o recado ao cliente, com o link do cartão já resolvido.
 *
 * Falha de WhatsApp não pode desfazer nem repetir uma cobrança: o dinheiro já saiu (ou
 * já foi recusado). Então tudo aqui é engolido — o registro na tela é a fonte de verdade,
 * e o diagnóstico da rota mostra a cobrança do mesmo jeito.
 */
async function avisarCliente(
  p: { tenantId: string; linkDoCartao: (clienteId: string) => Promise<string>; pegarCanal: () => Promise<Canal | null> },
  cliente: Cliente,
  texto: (link: string) => string,
): Promise<void> {
  try {
    const telefone = telefoneWhatsApp(cliente.telefone ?? "");
    if (!telefone) return;
    const zap = await p.pegarCanal();
    if (!zap) return;
    await zap.enviarMensagem(telefone, texto(await p.linkDoCartao(cliente.id)));
  } catch {
    // silêncio deliberado — ver doc acima
  }
}
