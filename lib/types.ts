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
  plano: string;
  tag: ClienteTag;
  ultimoAtendimento: string;
  totalGasto: string;
  atendimentos: number;
  desde: string;
  iniciais: string;
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
}

export type FormaPagamento = "pix" | "cartao" | "dinheiro";
export type TransacaoStatus = "pago" | "pendente" | "atrasado";

export interface Transacao {
  id: string;
  data: string; // rótulo curto, ex.: "23 jun"
  clienteNome: string;
  servico: string;
  barbeiroNome: string;
  valor: number;
  status: TransacaoStatus;
  forma: FormaPagamento;
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
