import type {
  AtendimentoHistorico,
  AtividadeSaaS,
  BlocoAgenda,
  Cliente,
  DesempenhoBarbeiro,
  ProximoAgendamento,
  Servico,
  Tenant,
} from "./types";

export const BARBEARIA = {
  nome: "Barbearia Cartel",
  endereco: "R. Augusta, 1200 · São Paulo",
};

export const servicos: Servico[] = [
  { id: "corte", nome: "Corte", duracaoMin: 40, preco: 75 },
  { id: "barba", nome: "Barba", duracaoMin: 30, preco: 75 },
  { id: "corte-barba", nome: "Corte + Barba", duracaoMin: 60, preco: 140 },
  { id: "luzes", nome: "Luzes", duracaoMin: 90, preco: 120 },
  { id: "raspar", nome: "Raspar", duracaoMin: 30, preco: 50 },
];

// ---- Dashboard ----
export const kpis = [
  { label: "Faturamento do mês", value: "R$ 38.450", delta: "▲ 12% vs. mês anterior", deltaTone: "green" as const },
  { label: "Agendamentos hoje", value: "18", delta: "4 aguardando confirmação", deltaTone: "muted" as const },
  { label: "Ticket médio", value: "R$ 92", delta: "▲ 5% no período", deltaTone: "green" as const },
  { label: "Taxa de ocupação", value: "78%", bar: 78 },
];

export const faturamento30d = [150, 138, 156, 128, 140, 108, 120, 92, 104, 74, 86, 58]
  .map((v) => 210 - v); // invert so higher = more revenue

export const servicosMaisVendidos = [
  { nome: "Corte + Barba", qtd: 64, pct: 100, cor: "#5D4037" },
  { nome: "Corte", qtd: 52, pct: 81, cor: "#6B4A36" },
  { nome: "Barba", qtd: 38, pct: 59, cor: "#8A6A4E" },
  { nome: "Luzes", qtd: 21, pct: 33, cor: "#A98A63" },
  { nome: "Raspar", qtd: 14, pct: 22, cor: "#C9A86A" },
];

export const proximos: ProximoAgendamento[] = [
  { hora: "09:00", cliente: "João Pedro", servico: "Corte + Barba", barbeiro: "Everton", status: "confirmado" },
  { hora: "09:40", cliente: "Marcos V.", servico: "Corte", barbeiro: "Raimundo", status: "atendimento" },
  { hora: "10:30", cliente: "Felipe Costa", servico: "Barba", barbeiro: "Eduardo", status: "agendado" },
  { hora: "11:00", cliente: "Rafael Lima", servico: "Luzes", barbeiro: "Everton", status: "agendado" },
  { hora: "13:30", cliente: "Bruno Alves", servico: "Corte + Barba", barbeiro: "Raimundo", status: "confirmado" },
];

export const desempenhoBarbeiros: DesempenhoBarbeiro[] = [
  { nome: "Everton", iniciais: "EV", atendimentos: "8 atend.", comissao: "R$ 420", pct: 100 },
  { nome: "Raimundo", iniciais: "RA", atendimentos: "7 atend.", comissao: "R$ 365", pct: 86 },
  { nome: "Eduardo", iniciais: "ED", atendimentos: "6 atend.", comissao: "R$ 310", pct: 72 },
];

export const financeiro = {
  recebido: "R$ 32.110",
  pendente: "R$ 4.280",
  inadimplencia: "R$ 2.060",
  comissoesAPagar: "R$ 6.240",
  recebidoPct: 83.5,
  pendentePct: 11.1,
  inadimplenciaPct: 5.4,
};

// ---- Agenda (day view, 09:00–19:00) ----
export const agendaBarbeiros = [
  { nome: "Everton", iniciais: "EV", cor: "#4A342A", hoje: 4 },
  { nome: "Raimundo", iniciais: "RA", cor: "#5D4037", hoje: 4 },
  { nome: "Eduardo", iniciais: "ED", cor: "#6B4A36", hoje: 3 },
];

export const agendaBlocos: BlocoAgenda[][] = [
  // Everton
  [
    { inicio: "09:00", duracaoMin: 60, cliente: "João Pedro", servico: "Corte + Barba · 1h", status: "confirmado" },
    { inicio: "11:00", duracaoMin: 90, cliente: "Rafael Lima", servico: "Luzes · 1h30", status: "agendado" },
    { inicio: "14:00", duracaoMin: 40, cliente: "Lucas Pereira", servico: "Corte · 40min", status: "agendado" },
    { inicio: "16:30", duracaoMin: 60, cliente: "Diego Souza", servico: "Corte + Barba · 1h", status: "confirmado" },
  ],
  // Raimundo
  [
    { inicio: "09:40", duracaoMin: 40, cliente: "Marcos V.", servico: "Corte · em atendimento", status: "atendimento" },
    { inicio: "12:00", duracaoMin: 60, cliente: "Almoço", servico: "Bloqueado · 1h", status: "bloqueio" },
    { inicio: "13:30", duracaoMin: 60, cliente: "Bruno Alves", servico: "Corte + Barba · 1h", status: "confirmado" },
    { inicio: "15:00", duracaoMin: 30, cliente: "Pedro Henrique", servico: "Barba · 30min", status: "agendado" },
  ],
  // Eduardo
  [
    { inicio: "10:30", duracaoMin: 30, cliente: "Felipe Costa", servico: "Barba · 30min", status: "agendado" },
    { inicio: "12:00", duracaoMin: 40, cliente: "Sérgio Matos", servico: "Corte · 40min", status: "confirmado" },
    { inicio: "14:40", duracaoMin: 60, cliente: "André Lima", servico: "Corte + Barba · 1h", status: "agendado" },
    { inicio: "16:00", duracaoMin: 30, cliente: "Caio Nunes", servico: "Raspar · no-show", status: "noshow" },
  ],
];

export const agoraHora = "14:24";

// ---- Clientes ----
export const clientes: Cliente[] = [
  { id: "c1", nome: "João Pedro Almeida", telefone: "(11) 98876-2310", email: "joaopedro@email.com", plano: "Mensal C+B", tag: "VIP", ultimoAtendimento: "há 3 dias", totalGasto: "R$ 1.840", atendimentos: 24, desde: "jan/24", iniciais: "JP" },
  { id: "c2", nome: "Marcos Vinícius", telefone: "(11) 99120-4488", email: "marcosv@email.com", plano: "Avulso", tag: "Novo", ultimoAtendimento: "hoje", totalGasto: "R$ 215", atendimentos: 3, desde: "jun/26", iniciais: "MV" },
  { id: "c3", nome: "Felipe Costa", telefone: "(11) 97744-1290", email: "felipe.costa@email.com", plano: "Mensal Corte", tag: "", ultimoAtendimento: "há 1 semana", totalGasto: "R$ 980", atendimentos: 13, desde: "set/24", iniciais: "FC" },
  { id: "c4", nome: "Rafael Lima", telefone: "(11) 98010-7765", email: "rafalima@email.com", plano: "Avulso", tag: "Inadimplente", ultimoAtendimento: "há 2 meses", totalGasto: "R$ 430", atendimentos: 6, desde: "mar/25", iniciais: "RL" },
  { id: "c5", nome: "Bruno Alves", telefone: "(11) 99655-3321", email: "bruno.alves@email.com", plano: "Mensal C+B", tag: "VIP", ultimoAtendimento: "há 5 dias", totalGasto: "R$ 2.120", atendimentos: 29, desde: "nov/23", iniciais: "BA" },
  { id: "c6", nome: "Thiago Mendes", telefone: "(11) 98233-0091", email: "thiagom@email.com", plano: "Avulso", tag: "", ultimoAtendimento: "há 2 semanas", totalGasto: "R$ 360", atendimentos: 5, desde: "fev/25", iniciais: "TM" },
];

export const clienteFiltros = [
  { label: "Todos", count: 318 },
  { label: "VIP", count: 42 },
  { label: "Avulsos", count: 176 },
  { label: "Inadimplentes", count: 9 },
];

export const historicoCliente: AtendimentoHistorico[] = [
  { data: "15 jun", servico: "Corte + Barba", barbeiro: "Everton", valor: "R$ 140" },
  { data: "01 jun", servico: "Corte", barbeiro: "Everton", valor: "R$ 75" },
  { data: "18 mai", servico: "Corte + Barba", barbeiro: "Raimundo", valor: "R$ 140" },
  { data: "04 mai", servico: "Barba", barbeiro: "Eduardo", valor: "R$ 75" },
];

// ---- Super Admin ----
export const saasKpis = [
  { label: "Barbearias ativas", value: "47", delta: "▲ 5 no mês", tone: "green" as const },
  { label: "MRR", value: "R$ 9.870", delta: "▲ 8% vs. mês anterior", tone: "green" as const },
  { label: "Em trial", value: "6", delta: "3 convertendo essa semana", tone: "amber" as const },
  { label: "Churn", value: "2,1%", delta: "▼ 0,4 p.p.", tone: "green" as const },
];

export const mrr12m = [20, 28, 40, 38, 56, 68, 80, 94, 98, 120, 134, 152];

export const planosSaas = [
  { nome: "Pro · R$ 249", qtd: 31, pct: 66, cor: "#C9A86A" },
  { nome: "Básico · R$ 129", qtd: 16, pct: 34, cor: "#6B4A36" },
];

export const tenants: Tenant[] = [
  { nome: "Barbearia Cartel", cidade: "São Paulo · SP", monograma: "BC", plano: "Pro", status: "ativo", mrr: "R$ 249", agendamentosMes: "412" },
  { nome: "Studio Navalha", cidade: "Campinas · SP", monograma: "SN", plano: "Pro", status: "ativo", mrr: "R$ 249", agendamentosMes: "288" },
  { nome: "Dom Barber Club", cidade: "Rio de Janeiro · RJ", monograma: "DB", plano: "Básico", status: "ativo", mrr: "R$ 129", agendamentosMes: "176" },
  { nome: "Old School BBR", cidade: "Belo Horizonte · MG", monograma: "OS", plano: "Pro", status: "trial", mrr: "—", agendamentosMes: "63" },
  { nome: "Lâmina & Cia", cidade: "Curitiba · PR", monograma: "LC", plano: "Básico", status: "atrasado", mrr: "R$ 129", agendamentosMes: "94" },
  { nome: "Barbearia Imperial", cidade: "Porto Alegre · RS", monograma: "BI", plano: "Pro", status: "ativo", mrr: "R$ 249", agendamentosMes: "330" },
];

export const atividadeSaas: AtividadeSaaS[] = [
  { cor: "#5E7A52", texto: "Studio Navalha assinou o plano Pro", quando: "há 2h" },
  { cor: "#C9A86A", texto: "Old School BBR iniciou um trial", quando: "há 5h" },
  { cor: "#5E7A52", texto: "Barbearia Imperial fez upgrade para Pro", quando: "há 1 dia" },
  { cor: "#A35C4F", texto: "Lâmina & Cia — pagamento em atraso", quando: "há 2 dias" },
];

// ---- Booking público ----
export const bookingServicos = [
  { nome: "Corte", preco: "R$ 75", dur: "40 min" },
  { nome: "Barba", preco: "R$ 75", dur: "30 min" },
  { nome: "Corte + Barba", preco: "R$ 140", dur: "60 min" },
  { nome: "Luzes", preco: "R$ 120", dur: "90 min" },
  { nome: "Raspar", preco: "R$ 50", dur: "30 min" },
];

export const bookingBarbeiros = [
  { nome: "Everton", iniciais: "EV", rating: "4,9", especialidade: "Degradê" },
  { nome: "Raimundo", iniciais: "RA", rating: "4,8", especialidade: "Barba" },
  { nome: "Eduardo", iniciais: "ED", rating: "4,7", especialidade: "Clássico" },
];

export const bookingDias = [
  { dia: "Seg", num: "23" },
  { dia: "Ter", num: "24" },
  { dia: "Qua", num: "25" },
  { dia: "Qui", num: "26" },
  { dia: "Sex", num: "27" },
  { dia: "Sáb", num: "28" },
];

export const bookingHorarios = [
  { hora: "09:00", estado: "livre" as const },
  { hora: "09:40", estado: "ocupado" as const },
  { hora: "10:20", estado: "livre" as const },
  { hora: "11:00", estado: "livre" as const },
  { hora: "14:00", estado: "livre" as const },
  { hora: "14:40", estado: "livre" as const },
  { hora: "15:20", estado: "ocupado" as const },
  { hora: "16:00", estado: "livre" as const },
];
