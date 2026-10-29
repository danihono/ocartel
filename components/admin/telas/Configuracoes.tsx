"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import * as repo from "@/lib/firebase/repos";
import { novoToken } from "@/lib/confirmacao";
import { PADRAO_DIAS_ANTES_ALERTA, PADRAO_DIAS_VENCIMENTO_BOLETO } from "@/lib/cobranca-ciclo";
import { ITENS_FICHA, POTE_PADRAO, itensDoServico, pctDoBarbeiro } from "@/lib/comissao";
import { signOutApp, useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { PAPEL_LABEL, iniciaisDe } from "@/lib/pessoa";
import type { Barbeiro, ItemFicha, RegraPote } from "@/lib/types";
import type { EquipeAcessos } from "@/lib/equipe";
import { AcessoBarbeiroModal } from "@/components/admin/AcessoBarbeiroModal";
import { acaoRemoverAcessoBarbeiro } from "@/app/(admin)/configuracoes/equipe-actions";
import { acaoBackupCompleto } from "@/app/(admin)/configuracoes/dados-actions";
import { abasBackup } from "@/lib/backup";
import { baixarPlanilha, nomeArquivo } from "@/lib/exportar";
import {
  acaoConsultarPareamento,
  acaoDesconectarPareamento,
  acaoIniciarPareamento,
} from "@/app/(admin)/configuracoes/actions";
import type { EstadoPareamento } from "@/lib/canal/pareamento";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
// Cor de cada barbeiro (gravada no Firestore, então hex fixo): tons médios que leem
// bem nos dois temas, abrindo com o oliva da marca.
const PALETA = ["#7FB520", "#3D7FC4", "#7A5FE0", "#C98A1A", "#D9527A"];
const HORAS = Array.from({ length: 15 }, (_, i) => `${String(7 + i).padStart(2, "0")}:00`);
const DIAS_ALERTA = [1, 2, 3, 5, 7];
const DIAS_BOLETO = [1, 2, 3, 5, 7];

/**
 * Campo de percentual (0..100). Guarda texto enquanto se digita — com número puro, apagar
 * o conteúdo viraria 0 na hora e gravaria "sem comissão" no meio da digitação.
 * Com `sufixo`/`max` serve também para as fichas do pote.
 */
function PctInput({
  valor,
  onChange,
  onLimpar,
  placeholder,
  sufixo = "%",
  max = 100,
}: {
  valor: number | null;
  onChange: (n: number) => void;
  onLimpar?: () => void;
  placeholder?: string;
  sufixo?: string;
  max?: number;
}) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor));

  // Segue o valor gravado quando ele muda por fora (outro dispositivo, ou o reset do "usar padrão").
  useEffect(() => {
    setTexto(valor === null ? "" : String(valor));
  }, [valor]);

  function confirmar() {
    const limpo = texto.trim().replace(",", ".");
    if (limpo === "") {
      onLimpar?.();
      return;
    }
    const n = Number(limpo);
    if (!Number.isFinite(n) || n < 0 || n > max) {
      setTexto(valor === null ? "" : String(valor));
      return;
    }
    if (n !== valor) onChange(n);
  }

  return (
    <div style={{ position: "relative" }}>
      <TextInput
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        inputMode="decimal"
        placeholder={placeholder ?? "0"}
        style={{ paddingRight: sufixo ? 30 : undefined }}
      />
      {sufixo ? (
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: c.ink3, pointerEvents: "none" }}>
          {sufixo}
        </span>
      ) : null}
    </div>
  );
}

export function TelaConfiguracoes() {
  const { state, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();

  /**
   * Tirar alguém da equipe tira também o login dele: senão a conta continuaria entrando
   * em /barbeiro, ligada a um barbeiro que não existe mais.
   */
  async function removerBarbeiro(b: Barbeiro) {
    try {
      if (acessos.acessos?.[b.id] && userEquipe && tenantEquipe) {
        if (!window.confirm(`${b.nome} tem login no sistema. Remover da equipe também tira o acesso dele. Continuar?`)) return;
        const r = await acaoRemoverAcessoBarbeiro(await userEquipe.getIdToken(), tenantEquipe, b.id);
        if (!r.ok) {
          toast(r.erro ?? "Não foi possível tirar o acesso.", "error");
          return;
        }
      }
      await actions.barbeiros.remove(b.id);
      toast("Barbeiro removido.");
    } catch {
      toast("Não foi possível remover.", "error");
    }
  }

  // Quem da equipe tem login (private/equipe — só leitura no navegador).
  const { tenantId: tenantEquipe, user: userEquipe } = useAuth();
  const [acessos, setAcessos] = useState<EquipeAcessos>({});
  const [acessoDe, setAcessoDe] = useState<Barbeiro | null>(null);
  useEffect(() => {
    if (!tenantEquipe) return;
    return repo.equipe.subscribe(tenantEquipe, setAcessos);
  }, [tenantEquipe]);

  const [nome, setNome] = useState(state.config.nome);
  const [endereco, setEndereco] = useState(state.config.endereco);
  const [telefone, setTelefone] = useState(state.config.telefone);
  const [abre, setAbre] = useState(state.config.horario.abre);
  const [fecha, setFecha] = useState(state.config.horario.fecha);
  const [diasAtivos, setDiasAtivos] = useState<boolean[]>(state.config.horario.diasAtivos);
  const [confirmacaoAtiva, setConfirmacaoAtiva] = useState(state.config.confirmacao?.ativa ?? false);
  const [confirmacaoHora, setConfirmacaoHora] = useState(state.config.confirmacao?.hora ?? "08:00");
  const [iaAtiva, setIaAtiva] = useState(state.config.ia?.ativa ?? false);
  const cob = state.config.cobranca;
  const [cobrancaAtiva, setCobrancaAtiva] = useState(cob?.ativa ?? false);
  const [cobrancaHora, setCobrancaHora] = useState(cob?.hora ?? "09:00");
  const [diasAntesAlerta, setDiasAntesAlerta] = useState(cob?.diasAntesAlerta ?? PADRAO_DIAS_ANTES_ALERTA);
  const [cobrarNoCartao, setCobrarNoCartao] = useState(cob?.cobrarNoCartao ?? false);
  const [emitirBoleto, setEmitirBoleto] = useState(cob?.emitirBoleto ?? false);
  const [diasVencimentoBoleto, setDiasVencimentoBoleto] = useState(
    cob?.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO,
  );

  // Regra de comissão: salva na hora (como os campos da Equipe), sem botão próprio. Vive em
  // `private/comissao` — ver repo.regraComissao e o comentário lá sobre por que não em config.
  const regra = state.regraComissao;
  function salvarRegra(patch: Parameters<typeof actions.comissoes.salvarRegra>[0]) {
    void actions.comissoes
      .salvarRegra(patch)
      .then(() => toast("Comissão atualizada."))
      .catch(() => toast("Não foi possível salvar a comissão.", "error"));
  }
  /** Campo esvaziado = "usa o padrão da casa". Apaga a chave, não grava 0. */
  // Pote da assinatura: grava sempre o objeto inteiro, partindo da tabela da casa quando
  // ainda não existe — assim ligar o percentual já leva as fichas junto.
  const pote: RegraPote = { ...POTE_PADRAO, ...regra.pote, fichas: { ...POTE_PADRAO.fichas, ...regra.pote?.fichas } };
  function salvarPote(patch: Partial<RegraPote>) {
    salvarRegra({ pote: { ...pote, ...patch } });
  }
  function alternarPeca(servicoId: string, atuais: ItemFicha[], item: ItemFicha) {
    const novos = atuais.includes(item) ? atuais.filter((i) => i !== item) : [...atuais, item];
    salvarPote({ itensPorServico: { ...(pote.itensPorServico ?? {}), [servicoId]: novos } });
  }

  function limparPct(barbeiroId: string) {
    void actions.comissoes
      .limparPctBarbeiro(barbeiroId)
      .then(() => toast("Voltou para o percentual padrão."))
      .catch(() => toast("Não foi possível salvar a comissão.", "error"));
  }

  // Status do gateway. A CHAVE não entra no componente — só o "está configurado" e o
  // ambiente. Ver `repo.cobrador.subscribeStatus`.
  const [gateway, setGateway] = useState<{ configurado: boolean; ambiente: "sandbox" | "producao" } | null>(null);
  const [novaChave, setNovaChave] = useState("");
  const [novoAmbiente, setNovoAmbiente] = useState<"sandbox" | "producao">("sandbox");

  const [novoBarbeiro, setNovoBarbeiro] = useState("");

  const { user, tenantId } = useAuth();
  const [zap, setZap] = useState<EstadoPareamento | null>(null);
  const [zapBusy, setZapBusy] = useState(false);
  const [zapErro, setZapErro] = useState<string | null>(null);

  // Enquanto há QR na tela (ou conectando), pergunta de 2 em 2 segundos. É polling e não
  // listener de propósito: whatsappStatus/{uid} fica na raiz do Firestore, fora de
  // tenants/, e ler direto do navegador exigiria abrir um caminho novo nas regras.
  // Pareamento é operação rara e curta — o intervalo morre junto com a tela.
  useEffect(() => {
    if (!user || !tenantId) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function consultar() {
      try {
        const token = await user!.getIdToken();
        const r = await acaoConsultarPareamento(token, tenantId!);
        if (!vivo) return;
        if ("ok" in r) {
          setZapErro(r.erro ?? "Não foi possível consultar o WhatsApp.");
        } else {
          setZapErro(null);
          setZap(r);
          // Só continua perguntando enquanto o pareamento está em andamento.
          if (r.status === "qr" || r.status === "conectando") timer = setTimeout(consultar, 2000);
        }
      } catch {
        if (vivo) setZapErro("Não foi possível consultar o WhatsApp.");
      }
    }

    void consultar();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [user, tenantId, zapBusy]);

  async function conectarZap() {
    if (!user || !tenantId || zapBusy) return;
    setZapBusy(true);
    setZapErro(null);
    try {
      const r = await acaoIniciarPareamento(await user.getIdToken(), tenantId);
      if (!r.ok) setZapErro(r.erro ?? "Não foi possível conectar.");
    } finally {
      setZapBusy(false);
    }
  }

  async function desconectarZap() {
    if (!user || !tenantId || zapBusy) return;
    if (!confirm("Desconectar o WhatsApp desta barbearia? As mensagens já enviadas continuam salvas.")) return;
    setZapBusy(true);
    setZapErro(null);
    try {
      const r = await acaoDesconectarPareamento(await user.getIdToken(), tenantId);
      if (!r.ok) setZapErro(r.erro ?? "Não foi possível desconectar.");
    } finally {
      setZapBusy(false);
    }
  }

  // Sincroniza o formulário sempre que a config do store mudar
  // (a config chega via listener onSnapshot do Firestore — ver lib/store.tsx).
  useEffect(() => {
    setNome(state.config.nome);
    setEndereco(state.config.endereco);
    setTelefone(state.config.telefone);
    setAbre(state.config.horario.abre);
    setFecha(state.config.horario.fecha);
    setDiasAtivos(state.config.horario.diasAtivos);
    setConfirmacaoAtiva(state.config.confirmacao?.ativa ?? false);
    setConfirmacaoHora(state.config.confirmacao?.hora ?? "08:00");
    const cb = state.config.cobranca;
    setCobrancaAtiva(cb?.ativa ?? false);
    setCobrancaHora(cb?.hora ?? "09:00");
    setDiasAntesAlerta(cb?.diasAntesAlerta ?? PADRAO_DIAS_ANTES_ALERTA);
    setCobrarNoCartao(cb?.cobrarNoCartao ?? false);
    setEmitirBoleto(cb?.emitirBoleto ?? false);
    setDiasVencimentoBoleto(cb?.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO);
  }, [state.config]);

  useEffect(() => {
    if (!tenantId) return;
    return repo.cobrador.subscribeStatus(tenantId, setGateway);
  }, [tenantId]);

  async function salvarConfig() {
    try {
      await actions.config.update({
        nome,
        endereco,
        telefone,
        horario: { abre, fecha, diasAtivos },
        confirmacao: { ativa: confirmacaoAtiva, hora: confirmacaoHora },
        ia: { ativa: iaAtiva },
        cobranca: {
          ativa: cobrancaAtiva,
          hora: cobrancaHora,
          diasAntesAlerta,
          // Boleto só liga junto com o ciclo: emitir cobrança sem o resto rodando não faz
          // sentido, e "ativa: false + emitirBoleto: true" seria um estado confuso de ler.
          cobrarNoCartao: cobrancaAtiva && cobrarNoCartao,
          emitirBoleto: cobrancaAtiva && emitirBoleto,
          diasVencimentoBoleto,
        },
      });
      toast("Configurações salvas.");
    } catch {
      toast("Não foi possível salvar.", "error");
    }
  }

  async function salvarGateway() {
    const apiKey = novaChave.trim();
    if (!apiKey) {
      toast("Cole a chave de API do Asaas.", "error");
      return;
    }
    try {
      await actions.cobrador.salvar({
        apiKey,
        ambiente: novoAmbiente,
        // O token do webhook nasce aqui e é o que autentica a baixa automática. Gerado, e
        // não digitado: uma senha escolhida à mão numa tela de configuração vira "123456".
        webhookToken: novoToken(),
      });
      setNovaChave("");
      toast("Gateway configurado. Falta cadastrar a URL do webhook no painel do Asaas.");
    } catch {
      toast("Não foi possível salvar a chave.", "error");
    }
  }

  async function removerGateway() {
    try {
      await actions.cobrador.remover();
      toast("Gateway desconectado. Nenhum boleto novo será emitido.");
    } catch {
      toast("Não foi possível desconectar.", "error");
    }
  }

  function toggleDia(i: number) {
    setDiasAtivos((d) => d.map((v, idx) => (idx === i ? !v : v)));
  }

  function setBarb(b: Barbeiro, patch: Partial<Barbeiro>) {
    void actions.barbeiros.update({ ...b, ...patch }).catch(() => toast("Não foi possível salvar.", "error"));
  }

  async function adicionarBarbeiro() {
    if (!novoBarbeiro.trim()) {
      toast("Informe o nome do barbeiro.", "error");
      return;
    }
    try {
      await actions.barbeiros.add({
        id: makeId("b"),
        nome: novoBarbeiro.trim(),
        iniciais: iniciaisDe(novoBarbeiro),
        cor: PALETA[state.barbeiros.length % PALETA.length],
      });
      toast("Barbeiro adicionado.");
      setNovoBarbeiro("");
    } catch {
      toast("Não foi possível adicionar o barbeiro.", "error");
    }
  }

  async function sair() {
    await signOutApp();
    toast("Sessão encerrada.");
    router.push("/login");
  }

  const eyebrow = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

  return (
    <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.9fr) minmax(0,1fr)", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Dados da barbearia */}
        <Card>
          <CardTitle>Dados da barbearia</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            <Field label="Nome">
              <TextInput value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Field label="Endereço">
              <TextInput value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </Field>
            <Field label="Telefone">
              <TextInput value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </Field>

            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Horário de funcionamento</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <Field label="Abre" style={{ flex: 1 }}>
                  <Select value={abre} onChange={(e) => setAbre(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fecha" style={{ flex: 1 }}>
                  <Select value={fecha} onChange={(e) => setFecha(e.target.value)}>
                    {HORAS.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                {DIAS.map((d, i) => {
                  const on = diasAtivos[i];
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDia(i)}
                      aria-pressed={on}
                      style={{ flex: 1, cursor: "pointer", border: `1px solid ${on ? "transparent" : c.border}`, background: on ? "var(--oc-sel-bg)" : c.surface, color: on ? "var(--oc-sel-text)" : c.ink3, borderRadius: 999, padding: "9px 0", fontSize: 12.5, fontWeight: 500, transition: "background .15s, color .15s" }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Confirmação automática pelo WhatsApp</div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={confirmacaoAtiva}
                  onChange={(e) => setConfirmacaoAtiva(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                  Enviar o pedido de confirmação <b>na manhã do dia do atendimento</b>. Quem marca
                  para outro dia só é avisado no dia; quem marca no próprio dia, depois do envio,
                  não recebe.
                </span>
              </label>
              <Field label="Enviar às" style={{ maxWidth: 160 }}>
                <Select
                  value={confirmacaoHora}
                  onChange={(e) => setConfirmacaoHora(e.target.value)}
                  disabled={!confirmacaoAtiva}
                >
                  {HORAS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </Field>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderSoft}` }}>
                <div style={{ ...eyebrow, marginBottom: 8 }}>Atendente automático</div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                  <input type="checkbox" checked={iaAtiva} onChange={(e) => setIaAtiva(e.target.checked)} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                    Responder sozinho quem escrever no WhatsApp, com o que a barbearia tem de
                    verdade: serviços, preços e horários livres da agenda.{" "}
                    <b>Ele nunca marca</b> — quando o cliente fecha um horário, aparece uma sugestão
                    na Agenda e na conversa para você confirmar com um clique.
                  </span>
                </label>
                {iaAtiva ? (
                  <div style={{ fontSize: 12, color: c.amberText, background: c.amberBg, borderRadius: 12, padding: "10px 12px", marginTop: 10, lineHeight: 1.45 }}>
                    Ligado, ele responde <b>qualquer número</b> que escrever. Quando você responde
                    uma conversa à mão, ele se cala nela por algumas horas.
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderSoft}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle, marginBottom: 4 }}>
                  Número do WhatsApp
                </div>
                <div style={{ fontSize: 12.5, color: c.ink3, lineHeight: 1.45, marginBottom: 12 }}>
                  É deste número que as confirmações saem. Use o da barbearia, não um pessoal.
                </div>

                {zap && !zap.daemonOnline && (
                  <div style={{ fontSize: 12.5, color: c.ink3, marginBottom: 10 }}>
                    O serviço de WhatsApp está fora do ar no momento. Tente novamente em instantes.
                  </div>
                )}

                {zap?.status === "conectado" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>
                      Conectado{zap.numero ? ` · +${zap.numero}` : ""}
                    </span>
                    <Button onClick={desconectarZap} disabled={zapBusy}>
                      Desconectar
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button onClick={conectarZap} disabled={zapBusy || (zap ? !zap.daemonOnline : false)}>
                      {zapBusy ? "Aguarde…" : zap?.status === "qr" ? "Gerar novo código" : "Conectar WhatsApp"}
                    </Button>

                    {zap?.qr && (
                      <div style={{ marginTop: 14 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={zap.qr}
                          alt="Código QR para conectar o WhatsApp"
                          width={240}
                          height={240}
                          style={{ display: "block", background: "#fff", padding: 10, borderRadius: 12 }}
                        />
                        <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 8, maxWidth: 320, lineHeight: 1.45 }}>
                          No celular da barbearia: WhatsApp → <b>Aparelhos conectados</b> →{" "}
                          <b>Conectar um aparelho</b> e aponte para o código. Ele se renova sozinho.
                        </div>
                      </div>
                    )}

                    {zap?.status === "conectando" && !zap.qr && (
                      <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 10 }}>Conectando…</div>
                    )}

                    {zap?.status === "desvinculado" && (
                      <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 10 }}>
                        O aparelho foi desvinculado no celular. Conecte novamente.
                      </div>
                    )}
                  </>
                )}

                {zapErro && (
                  <div style={{ fontSize: 12.5, color: c.ink3, marginTop: 10 }}>{zapErro}</div>
                )}
              </div>
            </div>
          </div>

          {/* Cobrança automática — mesma forma do bloco de confirmação acima, e pelo mesmo
              motivo: quem já entendeu um entende o outro. Vem DESLIGADO por padrão; aqui
              isso pesa mais, porque o que sai daqui é boleto no CPF de cliente. */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${c.borderSoft}` }}>
            <div style={{ ...eyebrow, marginBottom: 8 }}>Cobrança automática das mensalidades</div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={cobrancaAtiva}
                onChange={(e) => setCobrancaAtiva(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                Gerar as mensalidades do mês sozinho e <b>avisar cada assinante pelo WhatsApp</b>{" "}
                antes do vencimento. Rodar duas vezes não cobra ninguém duas vezes.
              </span>
            </label>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Field label="Rodar às" style={{ maxWidth: 160 }}>
                <Select value={cobrancaHora} onChange={(e) => setCobrancaHora(e.target.value)} disabled={!cobrancaAtiva}>
                  {HORAS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Avisar antes" style={{ maxWidth: 190 }}>
                <Select
                  value={String(diasAntesAlerta)}
                  onChange={(e) => setDiasAntesAlerta(Number(e.target.value))}
                  disabled={!cobrancaAtiva}
                >
                  {DIAS_ALERTA.map((d) => (
                    <option key={d} value={d}>{d === 1 ? "1 dia antes" : `${d} dias antes`}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* O cartão vem antes do boleto porque é essa a ordem em que o ciclo roda:
                quem tem cartão é debitado, e o boleto é o caminho de quem não tem. */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", margin: "14px 0 12px" }}>
              <input
                type="checkbox"
                checked={cobrarNoCartao}
                onChange={(e) => setCobrarNoCartao(e.target.checked)}
                disabled={!cobrancaAtiva}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                No dia do vencimento, <b>cobrar no cartão cadastrado</b> de quem já deixou o cartão
                salvo. O cartão pode ser cadastrado no balcão, na ficha do cliente, ou pelo próprio
                cliente por um link no WhatsApp. Quem não tem cartão continua no boleto. Se o cartão
                recusar, a mensalidade fica pendente e aparece destacada no painel para você decidir;
                nada de boleto automático por trás.
              </span>
            </label>

            {cobrarNoCartao ? (
              <div
                style={{
                  fontSize: 12.5,
                  color: c.ink3,
                  lineHeight: 1.5,
                  background: c.field,
                  border: `1px solid ${c.borderSoft}`,
                  borderRadius: 14,
                  padding: "12px 14px",
                  margin: "0 0 12px",
                }}
              >
                Três coisas antes de contar com isso. A <b>tokenização e o checkout transparente
                precisam estar liberados</b> na sua conta do Asaas (peça ao gerente, senão o cadastro
                de cartão não funciona). A <b>taxa de cartão é maior que a de boleto</b> — quem paga
                é a barbearia. E o dinheiro do cartão <b>cai em cerca de 32 dias</b>, contra 1 dia
                útil do boleto: migrar todos os assinantes de uma vez abre um buraco no caixa do
                primeiro mês.
              </div>
            ) : null}

            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", margin: "14px 0 12px" }}>
              <input
                type="checkbox"
                checked={emitirBoleto}
                onChange={(e) => setEmitirBoleto(e.target.checked)}
                disabled={!cobrancaAtiva}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                No dia do vencimento, <b>emitir boleto no CPF</b> de quem ainda não pagou{" "}
                {cobrarNoCartao ? "e não tem cartão salvo" : ""} e mandar o link. Quando o boleto
                for pago, a baixa é automática — ninguém precisa registrar nada. Assinante sem CPF
                válido no cadastro é pulado e aparece no painel.
              </span>
            </label>

            {emitirBoleto ? (
              <Field label="Prazo do boleto" style={{ maxWidth: 190 }}>
                <Select
                  value={String(diasVencimentoBoleto)}
                  onChange={(e) => setDiasVencimentoBoleto(Number(e.target.value))}
                  disabled={!cobrancaAtiva}
                >
                  {DIAS_BOLETO.map((d) => (
                    <option key={d} value={d}>{d === 1 ? "vence em 1 dia" : `vence em ${d} dias`}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {/* Conta do gateway. A chave é da BARBEARIA: o dinheiro do boleto cai na conta
                dela, não na do O Cartel. Salva à parte do resto da tela porque não é
                configuração de comportamento — é credencial. */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderSoft}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle, marginBottom: 4 }}>
                Conta do Asaas
              </div>
              <div style={{ fontSize: 12.5, color: c.ink3, lineHeight: 1.45, marginBottom: 12 }}>
                É por ela que o boleto é emitido, o cartão é cobrado e o dinheiro cai — use a
                conta da barbearia. A chave fica guardada e não volta a aparecer nesta tela.
              </div>

              {gateway?.configurado ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle }}>
                    Configurada · {gateway.ambiente === "producao" ? "produção" : "sandbox (teste)"}
                  </span>
                  <Button variant="ghost" onClick={removerGateway}>Desconectar</Button>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: c.amberText, fontWeight: 600, marginBottom: 12 }}>
                  Sem chave: nenhum boleto é emitido, mesmo com a opção acima ligada.
                </div>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Field label={gateway?.configurado ? "Trocar a chave" : "Chave de API"} style={{ flex: 1, minWidth: 240 }}>
                  <TextInput
                    type="password"
                    value={novaChave}
                    onChange={(e) => setNovaChave(e.target.value)}
                    placeholder="$aact_..."
                    autoComplete="off"
                  />
                </Field>
                <Field label="Ambiente" style={{ maxWidth: 190 }}>
                  <Select value={novoAmbiente} onChange={(e) => setNovoAmbiente(e.target.value as "sandbox" | "producao")}>
                    <option value="sandbox">Sandbox (teste)</option>
                    <option value="producao">Produção</option>
                  </Select>
                </Field>
                <Button onClick={salvarGateway}>Salvar chave</Button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={salvarConfig}>Salvar alterações</Button>
          </div>
        </Card>

        {/* Barbeiros */}
        <Card>
          <CardTitle sub="Cada barbeiro vira uma coluna na agenda — e pode ter login próprio">Equipe</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {state.barbeiros.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: b.cor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flex: "none" }}>{b.iniciais}</div>
                <TextInput value={b.nome} onChange={(e) => setBarb(b, { nome: e.target.value, iniciais: iniciaisDe(e.target.value) })} />
                {acessos.acessos?.[b.id] ? (
                  <button onClick={() => setAcessoDe(b)} className="oc-btn oc-btn-pill oc-btn-sm" title={acessos.acessos[b.id].email} style={{ flex: "none" }}>
                    <Icon name="escudo" size={14} /> Com acesso
                  </button>
                ) : (
                  <button onClick={() => setAcessoDe(b)} className="oc-btn oc-btn-ghost oc-btn-sm" style={{ flex: "none" }}>
                    <Icon name="escudo" size={14} /> Dar acesso
                  </button>
                )}
                <button onClick={() => void removerBarbeiro(b)} aria-label="Remover" className="oc-icon-btn" style={{ color: c.red, width: 40, height: 40 }}>
                  <Icon name="lixo" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 14 }}>
            <TextInput value={novoBarbeiro} onChange={(e) => setNovoBarbeiro(e.target.value)} placeholder="Nome do novo barbeiro" />
            <Button icon="mais" onClick={adicionarBarbeiro}>Adicionar</Button>
          </div>
          <AcessoBarbeiroModal
            open={acessoDe !== null}
            onClose={() => setAcessoDe(null)}
            barbeiro={acessoDe}
            acesso={acessoDe ? acessos.acessos?.[acessoDe.id] : undefined}
            barbearia={state.config.nome}
          />
        </Card>

        {/* Comissões */}
        <Card>
          <CardTitle sub="Pote da assinatura repartido por fichas + percentual sobre os avulsos">Comissões</CardTitle>

          {/* Pote da assinatura */}
          <div style={{ marginTop: 16 }}>
            <Field label="Pote da assinatura" style={{ maxWidth: 200 }}>
              <PctInput valor={pote.pct} onChange={(n) => salvarPote({ pct: n })} />
            </Field>
            <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 6, lineHeight: 1.5 }}>
              Parte das mensalidades recebidas no mês que vai para a equipe. Ela é repartida pelas fichas
              que cada barbeiro fez nos atendimentos cobertos pelo plano. 0% desliga o pote.
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px 96px", gap: 10, fontSize: 10.5, letterSpacing: "0.07em", textTransform: "uppercase", color: c.ink3, fontWeight: 600 }}>
              <span>Peça</span>
              <span>Fichas</span>
              <span>Repetido</span>
            </div>
            {ITENS_FICHA.map((i) => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1fr 96px 96px", gap: 10, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 13.5, color: c.inkTitle }}>{i.nome}</span>
                <PctInput
                  sufixo=""
                  max={1000}
                  valor={pote.fichas[i.id].cheia}
                  onChange={(n) => salvarPote({ fichas: { ...pote.fichas, [i.id]: { ...pote.fichas[i.id], cheia: n } } })}
                />
                <PctInput
                  sufixo=""
                  max={1000}
                  valor={pote.fichas[i.id].repetida}
                  onChange={(n) => salvarPote({ fichas: { ...pote.fichas, [i.id]: { ...pote.fichas[i.id], repetida: n } } })}
                />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 8, lineHeight: 1.5 }}>
              &ldquo;Repetido&rdquo; vale quando o mesmo cliente faz a mesma peça de novo na semana (segunda a domingo).
            </div>
          </div>

          {state.servicos.length > 0 ? (
            <div style={{ marginTop: 14, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: c.ink2 }}>O que cada serviço inclui</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {state.servicos.map((sv) => {
                  const itens = itensDoServico(sv, pote);
                  return (
                    <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ flex: "1 1 120px", fontSize: 13, color: c.inkTitle, minWidth: 0 }}>{sv.nome}</span>
                      {ITENS_FICHA.map((i) => {
                        const marcado = itens.includes(i.id);
                        return (
                          <button
                            key={i.id}
                            type="button"
                            aria-pressed={marcado}
                            onClick={() => alternarPeca(sv.id, itens, i.id)}
                            style={{
                              border: `1px solid ${marcado ? c.brassDeep : c.border}`,
                              background: marcado ? c.brassTint : "transparent",
                              color: marcado ? c.brassDeep : c.ink3,
                              borderRadius: 999,
                              padding: "3px 10px",
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {i.nome}
                          </button>
                        );
                      })}
                      <span style={{ fontSize: 11.5, color: c.ink3, width: 64, textAlign: "right" }}>
                        {itens.reduce((t, i) => t + pote.fichas[i].cheia, 0)} fichas
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 14 }}>
            <Field label="Percentual padrão sobre avulsos" style={{ maxWidth: 200 }}>
              <PctInput valor={regra.pctPadrao} onChange={(n) => salvarRegra({ pctPadrao: n })} />
            </Field>
            <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 6 }}>
              Vale para quem não tiver um percentual próprio abaixo.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 14 }}>
            {state.barbeiros.length === 0 ? (
              <div style={{ fontSize: 12.5, color: c.ink3 }}>Cadastre a equipe acima para definir percentuais individuais.</div>
            ) : (
              state.barbeiros.map((b) => {
                const proprio = regra.pctPorBarbeiro?.[b.id];
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: b.cor, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>
                      {b.iniciais}
                    </div>
                    <span style={{ flex: 1, fontSize: 13.5, color: c.inkTitle, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.nome}
                    </span>
                    <div style={{ width: 110, flex: "none" }}>
                      <PctInput
                        valor={typeof proprio === "number" ? proprio : null}
                        placeholder={`${regra.pctPadrao}% (padrão)`}
                        onChange={(n) => salvarRegra({ pctPorBarbeiro: { ...(regra.pctPorBarbeiro ?? {}), [b.id]: n } })}
                        onLimpar={() => limparPct(b.id)}
                      />
                    </div>
                    <span style={{ fontSize: 11.5, color: c.ink3, width: 42, flex: "none", textAlign: "right" }}>
                      {pctDoBarbeiro(regra, b.id)}%
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 14, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 12, lineHeight: 1.5 }}>
            Mudar um percentual afeta a apuração dos meses <strong>ainda abertos</strong>. Mês já fechado
            guarda a regra usada no dia do fechamento e não muda — reabra em Comissões se quiser refazer.
          </div>
        </Card>
      </div>

      {/* Conta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <CardTitle>Conta</CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: c.forest, color: c.neon, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>{iniciaisDe(profile?.nome || state.auth.nome || "")}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.inkTitle }}>{profile?.nome || state.auth.nome || "Conta"}</div>
              <div style={{ fontSize: 12, color: c.ink3 }}>{profile ? PAPEL_LABEL[profile.role] : "Admin"}</div>
            </div>
          </div>
          <button onClick={sair} className="oc-btn oc-btn-danger oc-btn-block" style={{ marginTop: 18 }}>
            <Icon name="sair" size={16} /> Sair da conta
          </button>
        </Card>

        {/* Seus dados: o backup completo */}
        <BackupCard />
      </div>
    </div>
  );
}

/**
 * "Seus dados": baixa tudo da barbearia numa planilha só. Os dados são seus — dá para
 * guardar, abrir no Excel ou levar para outro sistema.
 */
function BackupCard() {
  const { user, tenantId } = useAuth();
  const { state } = useStore();
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);

  async function baixar() {
    if (!user || !tenantId || baixando) return;
    setBaixando(true);
    try {
      const r = await acaoBackupCompleto(await user.getIdToken(), tenantId);
      if (!r.ok || !r.dados) {
        toast(r.erro ?? "Não foi possível gerar o backup.", "error");
        return;
      }
      const hoje = new Date().toISOString().slice(0, 10);
      await baixarPlanilha(nomeArquivo(`backup ${state.config.nome || "barbearia"}`, hoje, "xlsx"), abasBackup(r.dados, hoje), "xlsx");
      toast("Backup baixado.");
    } catch {
      toast("Não foi possível gerar o backup.", "error");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Card>
      <CardTitle sub="Tudo da barbearia numa planilha">Seus dados</CardTitle>
      <p style={{ fontSize: 13, color: c.ink2, lineHeight: 1.55, margin: "14px 0 0" }}>
        Clientes, agenda completa, cobranças, serviços, equipe e comissões fechadas — uma aba para cada. Bom para guardar uma cópia ou levar
        para outro sistema.
      </p>
      <Button block icon="download" onClick={baixar} disabled={baixando} style={{ marginTop: 16 }}>
        {baixando ? "Gerando…" : "Baixar backup (Excel)"}
      </Button>
      <p style={{ fontSize: 11.5, color: c.ink3, lineHeight: 1.5, margin: "10px 0 0" }}>
        Chaves de integração e dados de cartão não entram no arquivo.
      </p>
    </Card>
  );
}
