// Tipos mínimos usados pelo worker (espelham os campos relevantes do app Next).

export type WhatsAppStatus = "desconectado" | "connecting" | "qr" | "connected" | "loggedOut";

export interface ServicoDoc {
  id: string;
  nome: string;
  duracaoMin: number;
  preco: number;
}

export interface BarbeiroDoc {
  id: string;
  nome: string;
}

export interface ConfigHorario {
  abre?: string;
  fecha?: string;
  diasAtivos?: boolean[];
}
