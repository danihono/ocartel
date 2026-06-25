// Núcleo da importação em massa de clientes (Excel/CSV).
// Tudo aqui é puro/determinístico (exceto `parseArquivo`, que lê o arquivo com
// SheetJS no navegador) — fácil de testar isoladamente. Nenhum dado pessoal sai
// do navegador: parsing, validação e deduplicação acontecem no cliente.

import type { Cliente, Plano } from "@/lib/types";
import { mesAnoCurto, HOJE_ISO } from "@/lib/date";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Telefone (compartilhado com o ClienteModal) ----

/** Máscara de telefone BR conforme digita: (11) 90000-0000. */
export function maskTelefone(v: string): string {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

/** Só dígitos (máx. 11) — base de deduplicação. */
export function normalizarTelefone(v: string): string {
  return (v ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Iniciais a partir do nome (até 2 letras). */
export function iniciaisDe(nome: string): string {
  const partes = (nome ?? "").trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ---- CPF ----

/** Só dígitos (máx. 11). */
export function normalizarCpf(v: string): string {
  return (v ?? "").replace(/\D/g, "").slice(0, 11);
}

/** Valida CPF brasileiro (11 dígitos + 2 verificadores; rejeita repetidos). */
export function validarCpf(v: string): boolean {
  const cpf = normalizarCpf(v);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000..., 111..., etc.
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/** Formata como 000.000.000-00 (devolve o original se não tiver 11 dígitos). */
export function formatarCpf(v: string): string {
  const c = normalizarCpf(v);
  if (c.length !== 11) return v ?? "";
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/** Máscara de CPF conforme digita: 000.000.000-00. */
export function maskCpf(v: string): string {
  const d = normalizarCpf(v);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ---- Mapeamento de cabeçalhos ----

export type CampoImport = "nome" | "cpf" | "telefone" | "email" | "plano";

export const CAMPOS: { key: CampoImport; label: string }[] = [
  { key: "nome", label: "Nome completo" },
  { key: "cpf", label: "CPF" },
  { key: "telefone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "plano", label: "Plano" },
];

/** minúsculo, sem acento, espaços colapsados. */
function normalizarTexto(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Sinônimos já normalizados (sem acento, minúsculo).
const SINONIMOS: Record<CampoImport, string[]> = {
  nome: ["nome", "nome completo", "cliente", "nome do cliente", "name", "full name"],
  cpf: ["cpf", "documento", "doc", "cpf/cnpj"],
  telefone: ["telefone", "celular", "fone", "whatsapp", "whats", "numero", "tel", "contato", "phone"],
  email: ["email", "e-mail", "e mail", "mail"],
  plano: ["plano", "assinatura", "plano atual", "pacote"],
};

/**
 * Sugere, para cada campo, o índice da coluna no cabeçalho (ou -1). Casa por
 * igualdade primeiro, depois por "contém". Cada coluna é usada uma só vez.
 */
export function mapearCabecalhos(headers: string[]): Record<CampoImport, number> {
  const norm = headers.map(normalizarTexto);
  const usado = new Set<number>();
  const result: Record<CampoImport, number> = { nome: -1, cpf: -1, telefone: -1, email: -1, plano: -1 };
  for (const campo of Object.keys(SINONIMOS) as CampoImport[]) {
    let idx = norm.findIndex((h, i) => !usado.has(i) && h !== "" && SINONIMOS[campo].includes(h));
    if (idx === -1) idx = norm.findIndex((h, i) => !usado.has(i) && h !== "" && SINONIMOS[campo].some((s) => h.includes(s)));
    if (idx !== -1) {
      result[campo] = idx;
      usado.add(idx);
    }
  }
  return result;
}

// ---- Leitura do arquivo (SheetJS) ----

export interface ArquivoParseado {
  headers: string[];
  rows: string[][];
}

/** Lê a 1ª planilha de um .xlsx/.xls/.csv e devolve cabeçalho + linhas (texto). */
export async function parseArquivo(file: File): Promise<ArquivoParseado> {
  // Carrega o SheetJS sob demanda — só baixa quando o usuário escolhe um arquivo.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  // `raw: false` usa o texto formatado da célula (preserva CPF/telefone como string).
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "", raw: false });
  const arr = matrix.map((r) => (Array.isArray(r) ? r.map((cell) => String(cell ?? "").trim()) : []));
  const headerIdx = arr.findIndex((r) => r.some((cell) => cell !== ""));
  if (headerIdx === -1) return { headers: [], rows: [] };
  const headers = arr[headerIdx];
  const rows = arr.slice(headerIdx + 1).filter((r) => r.some((cell) => cell !== ""));
  return { headers, rows };
}

// ---- Montagem + validação das linhas ----

export type StatusLinha = "ok" | "invalido" | "duplicado";

export interface LinhaImport {
  raw: string[];
  /** Pronto pra gravar quando status === "ok" (id é ignorado na escrita). */
  cliente: Cliente | null;
  status: StatusLinha;
  /** Motivos de bloqueio (status "invalido"). */
  erros: string[];
  /** Avisos não-bloqueantes (ex.: plano não encontrado → Avulso). */
  avisos: string[];
}

export interface Existentes {
  cpfs: Set<string>;
  telefones: Set<string>;
}

/** Índices de CPF/telefone dos clientes já cadastrados (pra deduplicar). */
export function indexarExistentes(clientes: Cliente[]): Existentes {
  const cpfs = new Set<string>();
  const telefones = new Set<string>();
  for (const c of clientes) {
    if (c.cpf) cpfs.add(normalizarCpf(c.cpf));
    const tel = c.telefoneNorm || normalizarTelefone(c.telefone || "");
    if (tel.length >= 10) telefones.add(tel);
  }
  return { cpfs, telefones };
}

export interface MontarParams {
  rows: string[][];
  mapping: Record<CampoImport, number>;
  planos: Plano[];
  existentes: Existentes;
}

/**
 * Transforma as linhas cruas em registros validados. CPF é obrigatório e
 * validado; duplicados (por CPF ou telefone, contra a base e dentro do próprio
 * arquivo) são marcados — a 1ª ocorrência fica "ok", as seguintes "duplicado".
 */
export function montarLinhas({ rows, mapping, planos, existentes }: MontarParams): LinhaImport[] {
  const planoPorNome = new Map<string, Plano>();
  for (const p of planos) planoPorNome.set(normalizarTexto(p.nome), p);

  const cpfsArquivo = new Set<string>();
  const telsArquivo = new Set<string>();

  const get = (r: string[], campo: CampoImport): string => {
    const i = mapping[campo];
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };

  return rows.map((r): LinhaImport => {
    const nome = get(r, "nome");
    const cpf = normalizarCpf(get(r, "cpf"));
    const telefone = normalizarTelefone(get(r, "telefone"));
    const email = get(r, "email");
    const planoTexto = get(r, "plano");

    const erros: string[] = [];
    const avisos: string[] = [];

    if (!nome) erros.push("Nome vazio");
    if (!cpf) erros.push("CPF ausente");
    else if (!validarCpf(cpf)) erros.push("CPF inválido");
    if (telefone && telefone.length < 10) erros.push("Telefone incompleto");
    if (email && !EMAIL_RE.test(email)) erros.push("E-mail inválido");

    // Casa o plano pelo nome; sem match/vazio → Avulso (aviso, não bloqueia).
    let planId = "";
    let planoLabel = "Avulso";
    if (planoTexto) {
      const p = planoPorNome.get(normalizarTexto(planoTexto));
      if (p) {
        planId = p.id;
        planoLabel = p.nome;
      } else {
        avisos.push(`Plano "${planoTexto}" não encontrado → Avulso`);
      }
    }

    if (erros.length) {
      return { raw: r, cliente: null, status: "invalido", erros, avisos };
    }

    const dupCpf = existentes.cpfs.has(cpf) || cpfsArquivo.has(cpf);
    const dupTel = telefone.length >= 10 && (existentes.telefones.has(telefone) || telsArquivo.has(telefone));
    cpfsArquivo.add(cpf);
    if (telefone.length >= 10) telsArquivo.add(telefone);

    const cliente: Cliente = {
      id: "", // ignorado na escrita — o Firestore gera o seu
      nome,
      telefone: telefone ? maskTelefone(telefone) : "",
      telefoneNorm: telefone,
      cpf,
      email,
      plano: planoLabel,
      planId,
      tag: "",
      observacoes: "",
      ultimoAtendimento: "—",
      totalGasto: 0,
      atendimentos: 0,
      desde: mesAnoCurto(HOJE_ISO),
      iniciais: iniciaisDe(nome),
    };

    const status: StatusLinha = dupCpf || dupTel ? "duplicado" : "ok";
    return { raw: r, cliente, status, erros, avisos };
  });
}

// ---- Modelo (template) para download ----

export const CABECALHOS_MODELO = ["Nome completo", "CPF", "Telefone", "E-mail", "Plano"];

/** CSV de exemplo (com BOM p/ Excel abrir acentos certos). */
export function modeloCsv(): string {
  const exemplo = ["João da Silva", "111.444.777-35", "(11) 99999-0000", "joao@exemplo.com", "Mensal"];
  return "﻿" + [CABECALHOS_MODELO.join(","), exemplo.join(",")].join("\r\n");
}
