"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { c } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useStore, makeId } from "@/lib/store";
import * as repo from "@/lib/firebase/repos";
import { novoToken } from "@/lib/confirmacao";
import { PADRAO_DIAS_ANTES_ALERTA, PADRAO_DIAS_VENCIMENTO_BOLETO } from "@/lib/cobranca-ciclo";
import { signOutApp, useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { PAPEL_LABEL, iniciaisDe } from "@/lib/pessoa";
import type { Barbeiro } from "@/lib/types";
import {
  acaoConsultarPareamento,
  acaoDesconectarPareamento,
  acaoIniciarPareamento,
} from "@/app/(admin)/configuracoes/actions";
import type { EstadoPareamento } from "@/lib/canal/pareamento";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PALETA = ["#0EA37A", "#0FB6C8", "#7C5CFC", "#E0A21A", "#F0476A"];
const HORAS = Array.from({ length: 15 }, (_, i) => `${String(7 + i).padStart(2, "0")}:00`);
const DIAS_ALERTA = [1, 2, 3, 5, 7];
const DIAS_BOLETO = [1, 2, 3, 5, 7];

export function TelaConfiguracoes() {
  const { state, actions } = useStore();
  const { profile } = useAuth();
  const toast = useToast();
  const router = useRouter();

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
  const [emitirBoleto, setEmitirBoleto] = useState(cob?.emitirBoleto ?? false);
  const [diasVencimentoBoleto, setDiasVencimentoBoleto] = useState(
    cob?.diasVencimentoBoleto ?? PADRAO_DIAS_VENCIMENTO_BOLETO,
  );

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

  const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: 18, maxWidth: 1600 }}>
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
                      style={{ flex: 1, cursor: "pointer", border: `1.5px solid ${on ? c.brass : c.borderInput}`, background: on ? c.brassTint : c.surface, color: on ? c.inkTitle : c.ink3, borderRadius: 9, padding: "9px 0", fontSize: 12, fontWeight: on ? 700 : 600 }}
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

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderInput}` }}>
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
                  <div style={{ fontSize: 12, color: c.amberText, background: c.amberBg, borderRadius: 8, padding: "8px 10px", marginTop: 10, lineHeight: 1.45 }}>
                    Ligado, ele responde <b>qualquer número</b> que escrever. Quando você responde
                    uma conversa à mão, ele se cala nela por algumas horas.
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderInput}` }}>
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
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${c.borderInput}` }}>
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

            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer", margin: "14px 0 12px" }}>
              <input
                type="checkbox"
                checked={emitirBoleto}
                onChange={(e) => setEmitirBoleto(e.target.checked)}
                disabled={!cobrancaAtiva}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, color: c.ink3, lineHeight: 1.45 }}>
                No dia do vencimento, <b>emitir boleto no CPF</b> de quem ainda não pagou e mandar o
                link. Quando o boleto for pago, a baixa é automática — ninguém precisa registrar
                nada. Assinante sem CPF válido no cadastro é pulado e aparece no painel.
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
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.borderInput}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.inkTitle, marginBottom: 4 }}>
                Conta do Asaas
              </div>
              <div style={{ fontSize: 12.5, color: c.ink3, lineHeight: 1.45, marginBottom: 12 }}>
                É por ela que o boleto é emitido e o dinheiro cai — use a conta da barbearia.
                A chave fica guardada e não volta a aparecer nesta tela.
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
          <CardTitle sub="Cada barbeiro vira uma coluna na agenda">Equipe</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {state.barbeiros.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: b.cor, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>{b.iniciais}</div>
                <TextInput value={b.nome} onChange={(e) => setBarb(b, { nome: e.target.value, iniciais: iniciaisDe(e.target.value) })} />
                <button onClick={() => { void actions.barbeiros.remove(b.id).then(() => toast("Barbeiro removido.")).catch(() => toast("Não foi possível remover.", "error")); }} aria-label="Remover" style={{ flex: "none", border: `1px solid ${c.borderInput}`, background: c.surface, borderRadius: 9, width: 38, height: 38, cursor: "pointer", color: c.red, fontSize: 15 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, borderTop: `1px solid ${c.borderSoft}`, paddingTop: 14 }}>
            <TextInput value={novoBarbeiro} onChange={(e) => setNovoBarbeiro(e.target.value)} placeholder="Nome do novo barbeiro" />
            <Button onClick={adicionarBarbeiro}>Adicionar</Button>
          </div>
        </Card>
      </div>

      {/* Conta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <CardTitle>Conta</CardTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.leather, color: c.darkText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>{iniciaisDe(profile?.nome || state.auth.nome || "")}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: c.inkTitle }}>{profile?.nome || state.auth.nome || "Conta"}</div>
              <div style={{ fontSize: 12, color: c.ink3 }}>{profile ? PAPEL_LABEL[profile.role] : "Admin"}</div>
            </div>
          </div>
          <button onClick={sair} style={{ width: "100%", marginTop: 18, border: `1px solid ${c.borderInput}`, background: c.surface, color: c.red, cursor: "pointer", padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 600 }}>
            Sair da conta
          </button>
        </Card>
      </div>
    </div>
  );
}
