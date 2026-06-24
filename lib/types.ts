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
  email: string;
  /** Rótulo denormalizado do plano (nome do plano ou "Avulso") — exibição/compat. */
  plano: string;
  /** Plano de assinatura do cliente (ref. a `planos`); ausente/"" = avulso (sem plano). */
  planId?: string;
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
  origem?: "admin" | "booking";
  observacoes?: string; // texto livre, editável no painel de detalhe
}

export type FormaPagamento = "pix" | "cartao" | "cartao_debito" | "dinheiro";
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
  /** Dia do mês de vencimento (1..28). Default 5. */
  diaVencimento?: number;
  ativo?: boolean;
}
