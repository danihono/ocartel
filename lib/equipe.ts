// Acesso dos barbeiros ao sistema: regras puras, sem Firebase, para poderem ser testadas.
//
// O barbeiro entra com e-mail e senha próprios e cai em /barbeiro, vendo só a agenda
// dele (as regras do Firestore já limitam o que o papel `barbeiro` alcança). Quem cria
// o acesso é a dona, pela tela de Equipe. A conta nasce SEM senha: o que volta é um link
// para o próprio barbeiro definir a dele, então ninguém além dele a conhece.
//
// O vínculo (barbeiro → e-mail/uid) fica em `tenants/{t}/private/equipe`, e não no doc
// do barbeiro: `barbeiros/*` é leitura pública (alimenta a vitrine de /book), e e-mail de
// funcionário não é dado de vitrine.

export interface AcessoBarbeiro {
  uid: string;
  email: string;
  /** ISO datetime da criação (ou da última vez que o acesso foi refeito). */
  criadoEm: string;
}

/** Conteúdo de `tenants/{t}/private/equipe`. */
export interface EquipeAcessos {
  acessos?: Record<string, AcessoBarbeiro>;
}

/** O que importa de um `users/{uid}` que já exista para aquele e-mail. */
export interface PerfilExistente {
  role?: string;
  tenantId?: string;
  barbeiroId?: string;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizaEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function emailValido(email: string): boolean {
  return RE_EMAIL.test(normalizaEmail(email));
}

/**
 * Por que este e-mail NÃO pode virar o acesso deste barbeiro — ou `null` se pode.
 *
 * Um perfil aponta para uma barbearia e um papel só. Aceitar um e-mail que já tem outro
 * papel seria rebaixar (ou trocar de barbearia) alguém sem aviso: a dona perderia o
 * próprio painel, ou um barbeiro sumiria da agenda de outra casa.
 *
 * O mesmo e-mail para o MESMO barbeiro passa: é o "reenviar link".
 */
export function conflitoAcessoBarbeiro(perfil: PerfilExistente | null, tenantId: string, barbeiroId: string): string | null {
  if (!perfil) return null;
  if (perfil.role === "superAdmin") return "Este e-mail é de um super admin. Use outro e-mail.";
  if (perfil.role === "admin") return "Este e-mail já administra uma barbearia. Use outro e-mail para o barbeiro.";
  if (perfil.tenantId && perfil.tenantId !== tenantId) return "Este e-mail já está ligado a outra barbearia.";
  if (perfil.role === "barbeiro" && perfil.barbeiroId && perfil.barbeiroId !== barbeiroId) {
    return "Este e-mail já é o acesso de outro barbeiro da equipe.";
  }
  return null;
}

/** Mensagem pronta para mandar o link ao barbeiro pelo WhatsApp. */
export function mensagemAcessoBarbeiro(d: { barbeiro: string; barbearia: string; email: string; link: string }): string {
  const primeiro = d.barbeiro.trim().split(/\s+/)[0] || d.barbeiro;
  return [
    `Oi, ${primeiro}! Seu acesso à agenda da ${d.barbearia || "barbearia"} está pronto.`,
    ``,
    `1. Abra o link e crie sua senha: ${d.link}`,
    `2. Depois entre com o e-mail ${d.email} e a senha que você criou.`,
    ``,
    `Lá você vê seus horários do dia e pode bloquear a sua agenda.`,
  ].join("\n");
}
