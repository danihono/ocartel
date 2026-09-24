// Domain types for the O Cartel UI (used to type the mock data).
// These mirror the intended multi-tenant Firestore schema, minus persistence concerns.

export type Role = "superAdmin" | "admin" | "barbeiro" | "cliente";

export type AgendamentoStatus =
  | "agendado"
  | "confirmado"
  | "atendimento"
  | "concluido"
  | "noshow"
  | "cancelado"
  | "bloqueio";

export type ClienteTag = "VIP" | "Novo" | "Inadimplente" | "";

export type PlanoSaaS = "Básico" | "Pro";
export type TenantStatus = "ativo" | "trial" | "atrasado";

export interface Barbeiro {
  id: string;
  nome: string;
  iniciais: string;
  cor: string;
  rating?: string;
  especialidade?: string;
  /** Derivado por seletor a partir dos agendamentos do dia (não persistido). */
  atendimentosHoje?: number;
}

export interface Servico {
  id: string;
  nome: string;
  duracaoMin: number;
  preco: number;
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  /** Telefone só dígitos (ex.: "11990000000") — base de deduplicação; o booking já grava. */
  telefoneNorm?: string;
  /**
   * Id do contato deste cliente no espelho do WhatsApp (`wa_<55…>`). É o vínculo guardado
   * entre o cadastro e a conversa — ver lib/canal/vinculo.ts.
   */
  waContactId?: string;
  /** CPF só dígitos (11) — identificador forte; obrigatório na importação em massa. */
  cpf?: string;
  /**
   * Id deste cliente no gateway de cobrança (Asaas). Gravado na primeira emissão de
   * boleto e reusado nas seguintes — sem ele o ciclo criaria um cadastro novo lá todo
   * mês, e o mesmo CPF viraria N clientes no painel do provedor.
   */
  asaasId?: string;
  email: string;
  /** Rótulo denormalizado do plano (nome do plano ou "Avulso") — exibição/compat. */
  plano: string;
  /** Plano de assinatura do cliente (ref. a `planos`); ausente/"" = avulso (sem plano). */
  planId?: string;
  /**
   * Dia do mês em que a mensalidade deste cliente vence (1..28). O vencimento é
   * por pessoa, não por plano — cada assinante fecha num dia diferente.
   * Ausente = usa o dia herdado do plano (legado) ou 5.
   */
  diaVencimento?: number;
  tag: ClienteTag;
  /** Rótulo legado de exibição ("há 3 dias"); usado como fallback quando não há ISO. */
  ultimoAtendimento: string;
  /** Data ISO do último atendimento concluído — fonte real do "há quanto tempo". */
  ultimoAtendimentoISO?: string;
  /** Contador agregado em reais (incrementado no concluir()). */
  totalGasto: number;
  atendimentos: number;
  desde: string;
  iniciais: string;
  /** Texto livre (preferências de corte etc.); editável no painel de detalhe. */
  observacoes?: string;
}

export interface AtendimentoHistorico {
  data: string;
  servico: string;
  barbeiro: string;
  valor: string;
}

export interface ProximoAgendamento {
  hora: string;
  cliente: string;
  servico: string;
  barbeiro: string;
  status: AgendamentoStatus;
}

export interface BlocoAgenda {
  inicio: string; // "09:00"
  duracaoMin: number;
  cliente: string;
  servico: string;
  status: AgendamentoStatus;
}

export interface Tenant {
  /** Id do doc no Firestore (ausente nos mocks de exemplo). */
  id?: string;
  /** Slug público usado em /book/[slug]. */
  slug?: string;
  nome: string;
  cidade: string;
  monograma: string;
  plano: PlanoSaaS;
  status: TenantStatus;
  mrr: string;
  agendamentosMes: string;
}

export interface AtividadeSaaS {
  cor: string;
  texto: string;
  quando: string;
}

export interface DesempenhoBarbeiro {
  nome: string;
  iniciais: string;
  atendimentos: string;
  comissao: string;
  pct: number;
}

// ---- Modelo único de agendamento (fonte da verdade) ----
// A agenda (blocos por barbeiro) e os "próximos" do dashboard são derivados
// daqui via lib/selectors.ts; o booking público escreve aqui também.
export interface Agendamento {
  id: string;
  date: string; // "YYYY-MM-DD"
  barbeiroId: string;
  clienteNome: string;
  clienteId?: string;
  servico: string; // nome limpo, ex.: "Corte + Barba" (ou "Bloqueado")
  servicoId?: string;
  inicio: string; // "HH:MM"
  duracaoMin: number;
  status: AgendamentoStatus;
  /** "whatsapp" = nasceu de uma sugestão do atendente automático, confirmada por gente. */
  origem?: "admin" | "booking" | "whatsapp";
  observacoes?: string; // texto livre, editável no painel de detalhe
  /** Conclusão coberta pela assinatura do cliente (atendimento R$ 0; ver selectors). */
  cobertoPorPlano?: boolean;
  /** Liga este agendamento a uma série criada em massa. Ausente nos individuais. */
  recorrenciaId?: string;
  /**
   * Segredo do link de confirmação enviado ao cliente pelo WhatsApp. Fica só no
   * doc (privado nas regras) e no link — nunca é exibido na tela.
   */
  confirmToken?: string;
  /** Marcado quando foi o PRÓPRIO cliente quem respondeu, pelo link. */
  confirmadoPeloCliente?: boolean;
  /** Quando o cliente respondeu pelo link (ISO datetime). */
  respondidoEm?: string;
  /**
   * Quando a confirmação automática foi enviada (ISO datetime). É o que torna o disparo
   * idempotente: rodar de novo não remanda a mensagem. Gravado DEPOIS do envio confirmado.
   */
  confirmacaoEnviadaEm?: string;
}

export type FormaPagamento = "pix" | "cartao" | "cartao_debito" | "dinheiro" | "boleto";
/**
 * Status GRAVADO de uma cobrança. "atrasado" é DERIVADO na leitura
 * (pendente + `dueDate` vencida) via selectors.statusCobranca — não grave-o.
 * Permanece no union só para tolerar docs legados que ainda o tenham.
 */
export type TransacaoStatus = "pago" | "pendente" | "atrasado";

export type TipoCobranca = "mensalidade" | "avulso";

export interface Transacao {
  id: string;
  data: string; // rótulo curto, ex.: "23 jun"
  clienteNome: string;
  /** Vínculo robusto ao cliente (preenchido na conclusão; ausente em lançamentos manuais/legados). */
  clienteId?: string;
  /**
   * Agendamento que gerou esta cobrança (preenchido na conclusão do atendimento).
   *
   * É o que liga o dinheiro ao corte na apuração de comissão. Ausente nas mensalidades
   * (que não nascem de agendamento), nos lançamentos manuais e nos docs legados — nesses
   * a apuração cai num casamento por nome+serviço+data e marca a linha como inferida.
   */
  agendamentoId?: string;
  /**
   * Barbeiro que fez o atendimento, por id. `barbeiroNome` é texto e não sobrevive a uma
   * renomeação — comissão amarrada em nome erra de pessoa. Ausente ⇒ doc legado.
   */
  barbeiroId?: string;
  servico: string; // nome do item cobrado (plano ou serviço)
  barbeiroNome: string;
  valor: number;
  status: TransacaoStatus;
  /** Método de pagamento — preenchido quando pago (é o "method" do prompt). */
  forma: FormaPagamento;
  // ---- Modelo de cobrança (campos opcionais; ausentes em docs legados) ----
  /** mensalidade (vinculada a plano) ou avulso (serviço). Ausente ⇒ tratar como "avulso". */
  type?: TipoCobranca;
  /** Mensalidade → plano de assinatura (ref. a `planos`). */
  planId?: string;
  /** Avulso → serviço (ref. a `servicos`). */
  servicoId?: string;
  /** Vencimento (ISO "YYYY-MM-DD") — base do cálculo de atraso derivado. */
  dueDate?: string;
  /** Data do recebimento (ISO) — base do "recebido este mês". */
  paidAt?: string;
  /** Valor cobrado original. Ausente ⇒ usar `valor`. */
  amount?: number;
  /** Valor efetivamente recebido (pode divergir de `amount`). Ausente ⇒ usar `valor`. */
  amountReceived?: number;
  /** Origem da cobrança. Aberto p/ gateway futuro (ex.: "gateway" via webhook). */
  source?: "manual" | "gateway";
  /** Nome do admin que confirmou o pagamento (auditoria). */
  confirmedBy?: string;
  /**
   * Atendimento coberto pela assinatura do cliente: registro de R$ 0,00 gerado na
   * conclusão (não cobra o corte). Em Pagamentos exibe "Coberto pelo plano".
   */
  cobertoPorPlano?: boolean;
  /**
   * Quando o aviso de renovação saiu para o cliente (ISO datetime). É o que torna o
   * alerta idempotente: rodar o ciclo duas vezes no mesmo dia não remanda a mensagem.
   * Gravado DEPOIS do envio confirmado — mesma disciplina de `confirmacaoEnviadaEm`.
   */
  alertaEnviadoEm?: string;
  /**
   * Boleto emitido no gateway para esta cobrança. A PRESENÇA deste campo é o que
   * impede uma segunda emissão — nunca cobre o mesmo cliente duas vezes.
   */
  boleto?: Boleto;
}

/** Boleto emitido no gateway (hoje só Asaas) para uma cobrança. */
export interface Boleto {
  provedor: "asaas";
  /** Id da cobrança no provedor — chave para conciliar e para cancelar, se preciso. */
  cobrancaId: string;
  /** Página do boleto (o que vai no WhatsApp do cliente). */
  url: string;
  /** Linha digitável, para quem prefere copiar e colar no app do banco. */
  linhaDigitavel: string;
  /** Vencimento do BOLETO (ISO) — alguns dias à frente do vencimento da mensalidade. */
  vencimentoISO: string;
  emitidoEm: string;
}

export interface ConfigBarbearia {
  nome: string;
  endereco: string;
  telefone: string;
  horario: {
    abre: string; // "09:00"
    fecha: string; // "19:00"
    diasAtivos: boolean[]; // 7 posições, Seg..Dom
  };
  /**
   * Disparo automático da confirmação pelo WhatsApp, na MANHÃ do dia do atendimento —
   * e não quando o agendamento é criado. Quem marca na terça para sexta só é avisado na
   * sexta. Ausente ⇒ desligado, para nenhuma barbearia existente começar a mandar
   * mensagem sozinha sem alguém ter pedido.
   */
  confirmacao?: {
    /** "HH:MM" no fuso de Brasília. A HORA é o que dispara; os minutos são informativos. */
    hora: string;
    ativa: boolean;
  };
  /**
   * Ciclo automático de cobrança: gera as mensalidades do mês, avisa o cliente antes do
   * vencimento e emite boleto no CPF de quem não pagou até o dia. Ausente ⇒ DESLIGADO —
   * mesma decisão de produto da `confirmacao`, e aqui ela pesa mais: nenhuma barbearia
   * existente deve começar a emitir boleto sozinha sem alguém ter pedido.
   */
  cobranca?: CobrancaAutomatica;
  /**
   * Atendente automático no WhatsApp. Ausente ⇒ DESLIGADO — nenhuma barbearia existente
   * começa a responder cliente sozinha sem alguém ter ligado.
   *
   * Ligado, o atendente responde qualquer número que escrever. Ele NUNCA marca: quando o
   * papo fecha num horário, nasce uma sugestão para uma pessoa confirmar.
   */
  ia?: {
    ativa: boolean;
    /** Como o atendente se apresenta. Vazio ⇒ fala como a própria barbearia. */
    assinatura?: string;
  };
}

/**
 * Um agendamento PROPOSTO pelo atendente automático, esperando confirmação de gente.
 *
 * Não é agendamento: não ocupa horário, não aparece na agenda como marcado e não impede
 * ninguém de pegar o mesmo horário. Vira agendamento só quando alguém clica em confirmar
 * — e aí passa por `criarAgendamentoValidado`, que pode recusar se o horário tiver sido
 * tomado no meio do caminho.
 */
export interface Sugestao {
  id: string;
  /** Conversa de onde ela saiu (`wa_<55…>`). */
  contactId: string;
  clienteId?: string;
  clienteNome: string;
  clienteTelefone: string;
  servicoId: string;
  servico: string;
  barbeiroId: string;
  barbeiro: string;
  date: string; // YYYY-MM-DD
  inicio: string; // HH:MM
  duracaoMin: number;
  status: "pendente" | "confirmada" | "descartada";
  /** Preenchido quando vira agendamento de verdade. */
  agendamentoId?: string;
  criadoEm?: string;
}

export interface CobrancaAutomatica {
  ativa: boolean;
  /** "HH:MM" no fuso de Brasília. Só a HORA dispara; os minutos são informativos. */
  hora: string;
  /** Quantos dias antes do vencimento sai o aviso de renovação. */
  diasAntesAlerta: number;
  /** Emitir boleto automaticamente para quem venceu e não pagou. */
  emitirBoleto: boolean;
  /** Folga, em dias, entre a emissão do boleto e o vencimento DELE. */
  diasVencimentoBoleto: number;
}

export interface PlanoTier {
  id: "basico" | "pro";
  nome: string;
  preco: number;
  descricao: string;
}

/**
 * Plano de assinatura do cliente, definido por barbearia (admin).
 * É a fonte do valor de mensalidade cobrado dos clientes — distinto de
 * `PlanoTier` (a assinatura SaaS da própria barbearia no O Cartel).
 */
export interface Plano {
  id: string;
  nome: string;
  /** Mensalidade vigente em R$. */
  valor: number;
  /**
   * @deprecated O vencimento passou a ser por cliente (`Cliente.diaVencimento`).
   * Continua sendo lido apenas como fallback dos assinantes antigos, que ainda
   * não têm um dia próprio gravado — não é mais editável na tela de Planos.
   */
  diaVencimento?: number;
  ativo?: boolean;
}

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

/**
 * Regra de cálculo da comissão vigente na barbearia.
 *
 * Vive em `tenants/{t}/private/comissao` — e NÃO em `config/main` nem em `barbeiros`,
 * que são `allow read: if true` nas regras para alimentar a vitrine pública de
 * /book/[slug]. Percentual de comissão ali seria legível pela internet inteira.
 *
 * Esta é a regra PROVISÓRIA (percentual sobre o valor do atendimento). A fórmula real
 * de cada barbearia — que depende de plano, de ter sido pago na hora, de quantidade —
 * entra depois trocando `comissaoDaLinha` em lib/comissao.ts. Por isso a apuração
 * carrega todos esses fatos em `LinhaComissao` desde já: quando a fórmula mudar, o
 * dado de que ela precisa já está lá, sem migração.
 */
export interface RegraComissao {
  /** Percentual (0..100) aplicado a quem não tem um próprio. */
  pctPadrao: number;
  /** Percentual por barbeiro (`barbeiroId` → 0..100). Ausente ⇒ usa `pctPadrao`. */
  pctPorBarbeiro?: Record<string, number>;
}

/** De onde a linha da apuração veio. */
export type OrigemComissao = "atendimento" | "mensalidade";

/**
 * Como a linha achou a cobrança correspondente.
 * - `forte`: pelo `agendamentoId` gravado na transação (o caminho novo).
 * - `inferido`: casado por nome do barbeiro + serviço + data (transações antigas, que
 *   não têm `agendamentoId`). A tela avisa quando um mês tem linhas assim — fechar em
 *   cima de vínculo adivinhado é como um erro de comissão entra no sistema.
 * - `sem-cobranca`: atendimento concluído sem transação encontrada.
 */
export type VinculoComissao = "forte" | "inferido" | "sem-cobranca";

/**
 * Uma linha da apuração do mês. DERIVADA — nunca gravada no Firestore.
 *
 * Carrega de propósito mais fatos do que a regra provisória usa: é o contrato que
 * permite trocar a fórmula sem mexer em schema, tela ou fechamento já gravado.
 */
export interface LinhaComissao {
  /** Id do agendamento (atendimento) ou da transação (mensalidade). */
  id: string;
  origem: OrigemComissao;
  /** "YYYY-MM-DD" — data do atendimento, ou do vencimento da mensalidade. */
  dataISO: string;
  /** Vazio nas mensalidades: elas não têm barbeiro. */
  barbeiroId: string;
  barbeiroNome: string;
  clienteNome: string;
  servico: string;
  /** Uma linha = um atendimento. Existe para a fórmula futura poder somar quantidade. */
  quantidade: number;
  /** Atendimento coberto pela assinatura do cliente (não cobrou o corte). */
  cobertoPorPlano: boolean;
  tipoCobranca: TipoCobranca;
  /** Ausente ⇒ não há cobrança vinculada. */
  forma?: FormaPagamento;
  /** Status DERIVADO da cobrança (ver selectors.statusCobranca). */
  status: TransacaoStatus;
  /** Pago no mesmo dia do atendimento — o "pagou na hora" da regra futura. */
  pagoNoAto: boolean;
  valorCobrado: number;
  valorRecebido: number;
  vinculo: VinculoComissao;
  /** O que `comissaoDaLinha` devolveu para esta linha, em R$. */
  comissao: number;
}

/**
 * Fechamento do mês de um barbeiro — o único registro GRAVADO deste módulo.
 *
 * O relatório é sempre recalculado dos atendimentos; o fechamento é o que congela o
 * valor acordado. Guarda um retrato da regra usada (`regra`) justamente porque a
 * fórmula vai mudar: sem isso, mudar o percentual reescreveria o passado.
 *
 * Id determinístico `{mes}_{barbeiroId}` — fechar duas vezes não duplica.
 */
export interface FechamentoComissao {
  id: string;
  /** "YYYY-MM". */
  mes: string;
  barbeiroId: string;
  /** Nome no momento do fechamento (o barbeiro pode ser renomeado ou sair depois). */
  barbeiroNome: string;
  /** Comissão apurada, em R$. Imutável depois de gravada (ver firestore.rules). */
  total: number;
  /** Faturamento que gerou essa comissão, em R$ — contexto para conferência. */
  faturamento: number;
  qtdLinhas: number;
  /** Retrato da regra aplicada. Imutável depois de gravada. */
  regra: RegraComissao;
  fechadoPor: string;
  /** ISO datetime. */
  fechadoEm: string;
  /** Quando a comissão foi efetivamente paga ao barbeiro (ISO). Ausente ⇒ a pagar. */
  pagoEm?: string;
  pagoPor?: string;
}

// ---------------------------------------------------------------------------
// Estoque — solicitações de produto
// ---------------------------------------------------------------------------

export type StatusSolicitacao = "pendente" | "comprado" | "cancelado";
export type UrgenciaSolicitacao = "normal" | "urgente";

/**
 * Um produto que faltou e precisa ser comprado.
 *
 * Esta fase NÃO controla saldo: não há quantidade em mãos, estoque mínimo nem baixa de
 * consumo. O fluxo é o que a barbearia já faz no papel — faltou, alguém anota; comprou,
 * alguém dá baixa.
 *
 * `status` é GRAVADO (e não derivado da presença de `compradoEm`) porque "cancelado" é
 * um terceiro estado que nenhuma data expressa: um pedido pode morrer sem compra.
 */
export interface SolicitacaoProduto {
  id: string;
  produto: string;
  quantidade: number;
  /** "un", "cx", "L"… Ausente ⇒ unidade avulsa. */
  unidade?: string;
  urgencia: UrgenciaSolicitacao;
  observacoes?: string;
  solicitadoPor: string;
  /** "YYYY-MM-DD" — base do filtro por mês. */
  solicitadoEm: string;
  status: StatusSolicitacao;
  compradoPor?: string;
  /** "YYYY-MM-DD". */
  compradoEm?: string;
  /** Quanto custou de fato, em R$. Ausente ⇒ não informado. */
  custo?: number;
  /** "YYYY-MM-DD". */
  canceladoEm?: string;
  motivo?: string;
}
