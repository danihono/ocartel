// Exportação de dados para planilha (Excel / CSV).
//
// Duas camadas, de propósito:
//   1. Mapeadores PUROS (`linhas*`): domínio → linhas com cabeçalho em português. São o
//      que os testes cobrem, e o que decide o que sai na planilha.
//   2. `baixarPlanilha`: monta o arquivo com a lib `xlsx` (carregada sob demanda, como na
//      importação de clientes) e dispara o download no navegador.
//
// Valores em dinheiro saem como NÚMERO, não como "R$ 75,00": é o que deixa quem abre a
// planilha somar uma coluna. Datas saem como dd/mm/aaaa, que é como o Excel em português
// reconhece sozinho.

import { STATUS_LABEL } from "./status";
import { formaPagamentoLabel, statusCobranca, valorCobrado, valorRecebido } from "./selectors";
import type { ApuracaoMes } from "./comissao";
import type { Agendamento, Barbeiro, Cliente, Transacao, TransacaoStatus } from "./types";

export type Celula = string | number;
export type Linha = Record<string, Celula>;
export interface Aba {
  nome: string;
  linhas: Linha[];
}
export type FormatoExportacao = "xlsx" | "csv";

/** "2026-10-27" (ou "2026-10-27T13:00…") → "27/10/2026". Vazio se não for data. */
export function dataBR(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const STATUS_COBRANCA: Record<TransacaoStatus, string> = { pago: "Pago", pendente: "Pendente", atrasado: "Atrasado" };

export function linhasClientes(clientes: Cliente[]): Linha[] {
  return clientes.map((cl) => ({
    Nome: cl.nome,
    Telefone: cl.telefone ?? "",
    "E-mail": cl.email ?? "",
    CPF: cl.cpf ?? "",
    Nascimento: dataBR(cl.nascimento),
    Plano: cl.plano ?? "",
    "Dia de vencimento": cl.diaVencimento ?? "",
    Tag: cl.tag ?? "",
    Atendimentos: cl.atendimentos ?? 0,
    "Total gasto (R$)": cl.totalGasto ?? 0,
    "Último atendimento": dataBR(cl.ultimoAtendimentoISO) || cl.ultimoAtendimento || "",
    "Cliente desde": cl.desde ?? "",
    Observações: cl.observacoes ?? "",
  }));
}

export function linhasAgendamentos(ags: Agendamento[], barbeiros: Barbeiro[]): Linha[] {
  const nomeBarbeiro = new Map(barbeiros.map((b) => [b.id, b.nome]));
  return [...ags]
    .sort((a, b) => (a.date + a.inicio).localeCompare(b.date + b.inicio))
    .map((a) => ({
      Data: dataBR(a.date),
      Início: a.inicio,
      "Duração (min)": a.duracaoMin,
      Barbeiro: nomeBarbeiro.get(a.barbeiroId) ?? "",
      Cliente: a.status === "bloqueio" ? "" : a.clienteNome,
      Serviço: a.status === "bloqueio" ? `Bloqueio · ${a.clienteNome}` : a.servico,
      Status: STATUS_LABEL[a.status] ?? a.status,
      Origem: a.origem === "booking" ? "Agendamento online" : a.origem === "whatsapp" ? "WhatsApp" : "Painel",
      Observações: a.observacoes ?? "",
    }));
}

export function linhasTransacoes(ts: Transacao[], hojeISO: string): Linha[] {
  return ts.map((t) => {
    const st = statusCobranca(t, hojeISO);
    return {
      Cliente: t.clienteNome,
      Item: t.servico,
      Tipo: t.type === "mensalidade" ? "Mensalidade" : "Avulso",
      Barbeiro: t.barbeiroNome ?? "",
      "Valor cobrado (R$)": valorCobrado(t),
      "Valor recebido (R$)": st === "pago" ? valorRecebido(t) : 0,
      Status: t.cobertoPorPlano ? "Coberto pelo plano" : STATUS_COBRANCA[st],
      Forma: st === "pago" && t.forma ? (formaPagamentoLabel[t.forma] ?? t.forma) : "",
      Vencimento: dataBR(t.dueDate),
      "Pago em": dataBR(t.paidAt),
    };
  });
}

/** Comissões do mês: uma aba de resumo por barbeiro e uma com cada atendimento. */
export function abasComissoes(ap: ApuracaoMes): Aba[] {
  return [
    {
      nome: "Por barbeiro",
      linhas: ap.porBarbeiro.map((r) => ({
        Barbeiro: r.barbeiroNome,
        Atendimentos: r.atendimentos,
        "Recebido (R$)": r.faturamento,
        "Percentual (%)": r.pct,
        "Comissão avulsos (R$)": r.comissaoAvulso,
        Fichas: r.fichas,
        "Parte do pote (%)": Math.round(r.participacao * 10000) / 100,
        "Pote da assinatura (R$)": r.valorPote,
        "Comissão (R$)": r.comissao,
        Fechamento: r.fechamento ? (r.fechamento.pagoEm ? `Pago em ${dataBR(r.fechamento.pagoEm)}` : "Fechado") : "Aberto",
      })),
    },
    {
      nome: "Atendimentos",
      linhas: ap.linhas.map((l) => ({
        Data: dataBR(l.dataISO),
        Barbeiro: l.barbeiroNome,
        Cliente: l.clienteNome,
        Serviço: l.servico,
        Origem: l.origem === "mensalidade" ? "Mensalidade" : "Atendimento",
        "Valor recebido (R$)": l.valorRecebido,
        Fichas: l.fichas,
        "Repetido na semana": l.repetidaNaSemana ? "sim" : "",
        "Comissão (R$)": l.comissao,
        Status: STATUS_COBRANCA[l.status],
      })),
    },
  ];
}

/**
 * Linha "crua" de um documento qualquer (backup): mantém os campos como estão, achata
 * objetos aninhados em JSON para caberem numa célula.
 */
export function linhaCrua(doc: Record<string, unknown>): Linha {
  const out: Linha = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "number" || typeof v === "string") out[k] = v;
    else if (typeof v === "boolean") out[k] = v ? "sim" : "não";
    else out[k] = JSON.stringify(v);
  }
  return out;
}

/**
 * Nome de arquivo previsível: `ocartel-clientes-2026-10-27.xlsx`. O carimbo é a data de
 * hoje, ou o período do conteúdo quando ele tem um (`2026-10` para as comissões do mês).
 */
export function nomeArquivo(base: string, carimbo: string, formato: FormatoExportacao): string {
  const limpo = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `ocartel-${limpo}-${carimbo}.${formato}`;
}

/** Nome de aba aceito pelo Excel: até 31 caracteres, sem `[]:*?/\`. */
export function nomeAba(nome: string): string {
  return nome.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Planilha";
}

/**
 * Gera e baixa a planilha. Em CSV só existe uma aba (a primeira) — CSV não tem abas.
 * O CSV sai com `;` e BOM: é o que o Excel em português abre com acentos e colunas certas.
 */
export async function baixarPlanilha(arquivo: string, abas: Aba[], formato: FormatoExportacao): Promise<void> {
  const XLSX = await import("xlsx");
  let blob: Blob;
  if (formato === "csv") {
    const ws = XLSX.utils.json_to_sheet(abas[0]?.linhas ?? []);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  } else {
    const wb = XLSX.utils.book_new();
    for (const aba of abas) {
      const ws = XLSX.utils.json_to_sheet(aba.linhas.length ? aba.linhas : [{ "": "Sem dados" }]);
      // Largura das colunas pelo maior conteúdo (com teto), para abrir legível.
      const chaves = Object.keys(aba.linhas[0] ?? {});
      ws["!cols"] = chaves.map((k) => ({
        wch: Math.min(48, Math.max(k.length, ...aba.linhas.map((l) => String(l[k] ?? "").length)) + 2),
      }));
      XLSX.utils.book_append_sheet(wb, ws, nomeAba(aba.nome));
    }
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
