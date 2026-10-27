// Backup completo: quais coleções entram e como cada uma vira aba de planilha.
// A leitura (servidor) mora em app/(admin)/configuracoes/dados-actions.ts.

import { linhaCrua, linhasAgendamentos, linhasClientes, linhasTransacoes, type Aba } from "./exportar";
import type { Agendamento, Barbeiro, Cliente, Transacao } from "./types";

export const COLECOES_BACKUP = ["clientes", "agendamentos", "transacoes", "servicos", "barbeiros", "planos", "fechamentos", "config"] as const;
export type ColecaoBackup = (typeof COLECOES_BACKUP)[number];
export type DadosBackup = Record<ColecaoBackup, Record<string, unknown>[]>;

/**
 * Uma aba por coleção. Clientes, agenda e cobranças saem no formato legível (o mesmo das
 * exportações das telas); o resto sai cru, campo a campo — é backup, não relatório.
 */
export function abasBackup(d: DadosBackup, hojeISO: string): Aba[] {
  const barbeiros = d.barbeiros as unknown as Barbeiro[];
  return [
    { nome: "Clientes", linhas: linhasClientes(d.clientes as unknown as Cliente[]) },
    { nome: "Agenda", linhas: linhasAgendamentos(d.agendamentos as unknown as Agendamento[], barbeiros) },
    { nome: "Cobranças", linhas: linhasTransacoes(d.transacoes as unknown as Transacao[], hojeISO) },
    { nome: "Serviços", linhas: d.servicos.map(linhaCrua) },
    { nome: "Barbeiros", linhas: d.barbeiros.map(linhaCrua) },
    { nome: "Planos", linhas: d.planos.map(linhaCrua) },
    ...(d.fechamentos.length ? [{ nome: "Comissões fechadas", linhas: d.fechamentos.map(linhaCrua) }] : []),
    { nome: "Configuração", linhas: d.config.map(linhaCrua) },
  ];
}
