"use client";

// A tela de WhatsApp da barbearia.
//
// Duas fontes viram uma coisa só: as CONVERSAS espelhadas pelo daemon
// (`users/barbearia-{tenantId}/contacts/**`, lidas ao vivo) e os CLIENTES do cadastro
// (`tenants/{id}/clientes`, que já estão no store). O WhatsApp pareado só traz quem já
// falou com a barbearia — a maior parte do cadastro nunca falou, e é por isso que existe
// o painel "+ Adicionar cliente".
//
// Adicionar é UM DE CADA VEZ, de propósito: não há "adicionar todos", seleção múltipla nem
// disparo em massa. O contato só nasce quando alguém clica no nome de alguém.
//
// Ler é direto do Firestore; escrever é só por server action (Admin SDK) — ver
// app/(admin)/whatsapp/actions.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { Avatar } from "@/components/ui/Seal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/firebase/auth";
import { useToast } from "@/components/ui/Toast";
import { uidDaBarbearia } from "@/lib/canal/uid";
import { subscribeConversas, subscribeMensagens, type Conversa, type MensagemWa } from "@/lib/whatsapp/espelho";
import { montarLista, waDoCliente, type ItemConversa } from "@/lib/whatsapp/lista";
import { acaoAdicionarConversa, acaoEnviarMensagem, acaoMarcarLida } from "@/app/(admin)/whatsapp/actions";
import { acaoConsultarPareamento } from "@/app/(admin)/configuracoes/actions";
import { useNavegacao } from "@/components/admin/navegacao";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };

/** Mensagem que a pessoa mandou e ainda não voltou pelo espelho. */
interface Pendente {
  id: string;
  contactId: string;
  texto: string;
  criadoEm: number;
  erro?: string;
}

const painel: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 14,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: shadow.card,
};

function horaCurta(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function diaLabel(d: Date): string {
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function TelaWhatsapp() {
  const { state, dispatch } = useStore();
  const { user, tenantId } = useAuth();
  const toast = useToast();
  const { ir } = useNavegacao();

  // Busca e conversa aberta vivem no store: trocar de aba e voltar devolve a tela como
  // estava (as telas ficam montadas, ver components/admin/Tela.tsx).
  const tela = state.ui.telas.whatsapp;
  const { busca } = tela;
  const conversaId = tela.conversaId;
  const setTela = (patch: Partial<typeof tela>) => dispatch({ type: "SET_TELA", tela: "whatsapp", patch });

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<MensagemWa[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [rascunho, setRascunho] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [buscaAdd, setBuscaAdd] = useState("");
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const [conexao, setConexao] = useState<{ status: string; numero: string | null; daemonOnline: boolean } | null>(null);

  const uid = tenantId ? uidDaBarbearia(tenantId) : null;
  const fimDaConversa = useRef<HTMLDivElement>(null);

  // Estado da conexão: uma consulta ao abrir a tela. É informativo — parear continua
  // sendo coisa da tela de Configurações.
  useEffect(() => {
    if (!user || !tenantId) return;
    let vivo = true;
    (async () => {
      const token = await user.getIdToken();
      const r = await acaoConsultarPareamento(token, tenantId);
      if (vivo && "status" in r) setConexao({ status: r.status, numero: r.numero, daemonOnline: r.daemonOnline });
    })().catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user, tenantId]);

  useEffect(() => {
    if (!uid) return;
    return subscribeConversas(uid, setConversas);
  }, [uid]);

  useEffect(() => {
    if (!uid || !conversaId) {
      setMensagens([]);
      return;
    }
    return subscribeMensagens(uid, conversaId, setMensagens);
  }, [uid, conversaId]);

  const lista = useMemo(() => montarLista(conversas, state.clientes, busca), [conversas, state.clientes, busca]);
  const listaAdd = useMemo(
    () => montarLista(conversas, state.clientes, buscaAdd).semConversa,
    [conversas, state.clientes, buscaAdd],
  );

  const aberta: ItemConversa | null = lista.conversas.find((i) => i.conversa.id === conversaId) ?? null;
  // Conversa aberta que a busca escondeu ainda precisa ser encontrável para o painel da
  // direita — senão digitar na busca esvaziaria a conversa que está aberta.
  const abertaBruta =
    aberta ?? (conversaId ? (montarLista(conversas, state.clientes, "").conversas.find((i) => i.conversa.id === conversaId) ?? null) : null);

  // Zera o "não lidas" ao abrir. Quem incrementa é o daemon, então quem zera precisa ser
  // o servidor: as regras liberam só leitura do espelho para o navegador.
  useEffect(() => {
    const naoLidas = abertaBruta?.conversa.unreadCount ?? 0;
    if (!user || !tenantId || !conversaId || naoLidas <= 0) return;
    (async () => {
      await acaoMarcarLida(await user.getIdToken(), tenantId, conversaId);
    })().catch(() => {});
  }, [user, tenantId, conversaId, abertaBruta?.conversa.unreadCount]);

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, conversaId]);

  // Some com a bolha otimista quando a mensagem de verdade chega pelo espelho.
  const pendentesVisiveis = pendentes.filter((p) => {
    if (p.contactId !== conversaId) return false;
    if (p.erro) return true;
    return !mensagens.some(
      (m) => m.fromMe && m.text === p.texto && m.sentAt.getTime() >= p.criadoEm - 5000,
    );
  });

  async function adicionar(clienteId: string) {
    if (!user || !tenantId || adicionando) return;
    setAdicionando(clienteId);
    try {
      const r = await acaoAdicionarConversa(await user.getIdToken(), tenantId, clienteId);
      if (!r.ok || !r.contactId) {
        toast(r.erro ?? "Não foi possível abrir a conversa.", "error");
        return;
      }
      setTela({ conversaId: r.contactId });
      setAddOpen(false);
      setBuscaAdd("");
    } finally {
      setAdicionando(null);
    }
  }

  async function enviar() {
    const texto = rascunho.trim();
    const destino = abertaBruta;
    if (!user || !tenantId || !destino || !texto || enviando) return;

    const telefone = destino.conversa.whatsappDigits || (destino.cliente ? (waDoCliente(destino.cliente) ?? "") : "");
    if (!telefone) {
      toast("Esta conversa não tem um número válido.", "error");
      return;
    }

    const pendente: Pendente = {
      id: `p${Date.now()}`,
      contactId: destino.conversa.id,
      texto,
      criadoEm: Date.now(),
    };
    setPendentes((ps) => [...ps, pendente]);
    setRascunho("");
    setEnviando(true);
    try {
      const r = await acaoEnviarMensagem(
        await user.getIdToken(),
        tenantId,
        telefone,
        texto,
        destino.cliente?.id,
      );
      if (!r.ok) {
        setPendentes((ps) => ps.map((p) => (p.id === pendente.id ? { ...p, erro: r.erro ?? "Não enviou." } : p)));
      }
    } catch {
      setPendentes((ps) => ps.map((p) => (p.id === pendente.id ? { ...p, erro: "Não enviou." } : p)));
    } finally {
      setEnviando(false);
    }
  }

  const conectado = conexao?.status === "conectado";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 18, height: "100%", maxWidth: 1600 }}>
      {/* ---- Lista de conversas ---- */}
      <div style={painel}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>Conversas</span>
            <span style={{ fontSize: 12, color: c.ink3, background: c.surfaceWarm, borderRadius: 999, padding: "2px 9px", fontWeight: 600 }}>
              {conversas.length}
            </span>
          </div>

          <StatusConexao conexao={conexao} onConfigurar={() => ir("/configuracoes")} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: c.surfaceWarm, border: `1px solid ${c.border}`, borderRadius: 10, padding: "9px 13px", margin: "12px 0 10px" }}>
            <span style={{ width: 13, height: 13, border: `1.6px solid ${c.ink4}`, borderRadius: "50%", display: "inline-block", flex: "none" }} />
            <input
              value={busca}
              onChange={(e) => setTela({ busca: e.target.value })}
              placeholder="Buscar conversa ou cliente…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13, color: c.inkTitle, fontFamily: font.sans }}
            />
          </div>

          <button
            onClick={() => setAddOpen((v) => !v)}
            style={{
              width: "100%",
              border: `1px dashed ${c.borderInput}`,
              cursor: "pointer",
              background: addOpen ? c.brassTint : c.surface,
              color: c.inkTitle,
              padding: "9px 12px",
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 600,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: c.brassDeep, fontWeight: 800 }}>{addOpen ? "×" : "+"}</span>
            {addOpen ? "Fechar" : "Adicionar cliente"}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>
              {lista.totalSemConversa === 0
                ? "todos já têm conversa"
                : `${lista.totalSemConversa} sem conversa`}
            </span>
          </button>
        </div>

        {addOpen ? (
          <PainelAdicionar
            itens={listaAdd}
            busca={buscaAdd}
            setBusca={setBuscaAdd}
            adicionando={adicionando}
            onAdicionar={adicionar}
          />
        ) : (
          <div style={{ flex: 1, overflow: "auto" }}>
            {lista.conversas.length === 0 ? (
              <div style={{ padding: "40px 22px", textAlign: "center", color: c.ink3, fontSize: 13, lineHeight: 1.6 }}>
                {conversas.length === 0
                  ? "Nenhuma conversa ainda. Use “Adicionar cliente” para começar a falar com alguém do cadastro."
                  : "Nenhuma conversa com esse nome."}
              </div>
            ) : null}
            {lista.conversas.map((item) => {
              const ativa = item.conversa.id === conversaId;
              const naoLidas = item.conversa.unreadCount ?? 0;
              return (
                <button
                  key={item.conversa.id}
                  onClick={() => setTela({ conversaId: item.conversa.id })}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderLeft: `3px solid ${ativa ? c.brass : "transparent"}`,
                    cursor: "pointer",
                    background: ativa ? "rgba(14,163,122,0.12)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 18px",
                    borderBottom: `1px solid ${c.borderSoft}`,
                  }}
                >
                  <Retrato item={item} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.nome}
                      </span>
                      {item.conversa.lastMessageAt ? (
                        <span style={{ flex: "none", fontSize: 11, color: c.ink3 }}>{diaLabel(item.conversa.lastMessageAt)}</span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: c.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.conversa.lastMessage || "—"}
                      </span>
                      {naoLidas > 0 ? (
                        <span style={{ flex: "none", background: c.brass, color: "#fff", borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: "1px 7px" }}>
                          {naoLidas}
                        </span>
                      ) : null}
                    </div>
                    {!item.cliente ? (
                      <div style={{ fontSize: 10.5, color: c.amberText, marginTop: 3, fontWeight: 600 }}>não cadastrado</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Conversa ---- */}
      <div style={painel}>
        {!abertaBruta ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: c.ink3, fontSize: 13, padding: 30, textAlign: "center" }}>
            Escolha uma conversa à esquerda — ou adicione um cliente do cadastro.
          </div>
        ) : (
          <>
            <CabecalhoConversa item={abertaBruta} onVerCliente={() => ir("/clientes")} />

            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", background: c.bg }}>
              {mensagens.length === 0 && pendentesVisiveis.length === 0 ? (
                <div style={{ textAlign: "center", color: c.ink3, fontSize: 12.5, padding: "30px 10px", lineHeight: 1.6 }}>
                  Sem mensagens por aqui ainda.
                  <br />
                  O que você escrever abaixo vai pelo WhatsApp da barbearia.
                </div>
              ) : null}

              {mensagens.map((m, i) => (
                <Balao key={m.id} m={m} mostrarDia={i === 0 || diaLabel(mensagens[i - 1].sentAt) !== diaLabel(m.sentAt)} />
              ))}

              {pendentesVisiveis.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <div style={{ maxWidth: "72%", background: p.erro ? c.redBg : c.brassSoft, color: c.ink, borderRadius: "12px 12px 3px 12px", padding: "8px 11px", fontSize: 13.5, lineHeight: 1.45, opacity: p.erro ? 1 : 0.75 }}>
                    <div style={{ whiteSpace: "pre-wrap" }}>{p.texto}</div>
                    <div style={{ fontSize: 10.5, marginTop: 3, color: p.erro ? c.redText : c.ink3, fontWeight: 600 }}>
                      {p.erro ?? "enviando…"}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={fimDaConversa} />
            </div>

            <div style={{ borderTop: `1px solid ${c.borderSoft}`, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia, Shift+Enter quebra linha — como no WhatsApp.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder={conectado ? "Escreva uma mensagem…" : "Conecte o WhatsApp em Configurações para enviar"}
                disabled={!conectado}
                rows={2}
                style={{
                  flex: 1,
                  resize: "none",
                  border: `1px solid ${c.borderInput}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontSize: 13.5,
                  fontFamily: font.sans,
                  color: c.inkTitle,
                  outline: "none",
                  background: conectado ? c.surface : c.surfaceWarm,
                }}
              />
              <button
                onClick={() => void enviar()}
                disabled={!conectado || enviando || !rascunho.trim()}
                style={{
                  border: "none",
                  cursor: !conectado || enviando || !rascunho.trim() ? "default" : "pointer",
                  background: !conectado || enviando || !rascunho.trim() ? c.surfaceWarm : c.primaryBtnBg,
                  color: !conectado || enviando || !rascunho.trim() ? c.ink3 : c.primaryBtnText,
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Retrato({ item, size }: { item: ItemConversa; size: number }) {
  // A URL da foto vem do daemon com token de download — abre sem autenticação.
  if (item.conversa.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.conversa.photoUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  return <Avatar initials={item.iniciais} size={size} />;
}

function StatusConexao({
  conexao,
  onConfigurar,
}: {
  conexao: { status: string; numero: string | null; daemonOnline: boolean } | null;
  onConfigurar: () => void;
}) {
  if (!conexao) return null;

  const ok = conexao.status === "conectado" && conexao.daemonOnline;
  const texto = !conexao.daemonOnline
    ? "Serviço de WhatsApp fora do ar"
    : conexao.status === "conectado"
      ? `Conectado${conexao.numero ? ` · +${conexao.numero}` : ""}`
      : "WhatsApp não conectado";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: ok ? c.greenText : c.amberText, background: ok ? c.greenBg : c.amberBg, borderRadius: 8, padding: "6px 10px" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? c.green : c.amber, flex: "none" }} />
      <span style={{ flex: 1, fontWeight: 600 }}>{texto}</span>
      {!ok ? (
        <button onClick={onConfigurar} style={{ border: "none", background: "transparent", color: "inherit", fontWeight: 700, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
          Configurações
        </button>
      ) : null}
    </div>
  );
}

function CabecalhoConversa({ item, onVerCliente }: { item: ItemConversa; onVerCliente: () => void }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${c.borderSoft}`, display: "flex", alignItems: "center", gap: 12 }}>
      <Retrato item={item} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: c.inkTitle }}>{item.nome}</div>
        <div style={{ fontSize: 12, color: c.ink2, marginTop: 1 }}>
          {item.conversa.whatsappDigits ? `+${item.conversa.whatsappDigits}` : "—"}
          {item.cliente?.plano ? ` · ${item.cliente.plano}` : ""}
        </div>
      </div>
      {item.cliente ? (
        <button onClick={onVerCliente} style={{ border: `1px solid ${c.borderInput}`, background: c.surface, color: c.inkTitle, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          Ver cliente
        </button>
      ) : (
        <span style={{ ...eyebrow, color: c.amberText }}>não cadastrado</span>
      )}
    </div>
  );
}

function PainelAdicionar({
  itens,
  busca,
  setBusca,
  adicionando,
  onAdicionar,
}: {
  itens: { cliente: { id: string; nome: string; telefone: string; iniciais: string }; wa: string | null }[];
  busca: string;
  setBusca: (v: string) => void;
  adicionando: string | null;
  onAdicionar: (clienteId: string) => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${c.borderSoft}`, background: c.brassTint }}>
        <div style={{ ...eyebrow, marginBottom: 7 }}>Clientes sem conversa</div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoFocus
          placeholder="Buscar por nome, telefone ou e-mail…"
          style={{ width: "100%", border: `1px solid ${c.border}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, fontFamily: font.sans, color: c.inkTitle, outline: "none", background: c.surface }}
        />
        <div style={{ fontSize: 11.5, color: c.ink3, marginTop: 8, lineHeight: 1.5 }}>
          Um clique abre a conversa de <b>um</b> cliente. Nada é enviado agora, e nenhum outro número é cadastrado.
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {itens.length === 0 ? (
          <div style={{ padding: "34px 20px", textAlign: "center", color: c.ink3, fontSize: 13 }}>
            Nenhum cliente sem conversa por aqui.
          </div>
        ) : null}
        {itens.map(({ cliente, wa }) => (
          <button
            key={cliente.id}
            onClick={() => wa && onAdicionar(cliente.id)}
            disabled={!wa || adicionando !== null}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: wa && !adicionando ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 18px",
              borderBottom: `1px solid ${c.borderSoft}`,
              opacity: wa ? 1 : 0.55,
            }}
          >
            <Avatar initials={cliente.iniciais} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {cliente.nome}
              </div>
              <div style={{ fontSize: 11.5, color: wa ? c.ink2 : c.amberText, marginTop: 1 }}>
                {wa ? cliente.telefone : "sem telefone no cadastro"}
              </div>
            </div>
            {wa ? (
              <span style={{ flex: "none", fontSize: 11.5, fontWeight: 700, color: c.brassDeep }}>
                {adicionando === cliente.id ? "abrindo…" : "abrir"}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Balao({ m, mostrarDia }: { m: MensagemWa; mostrarDia: boolean }) {
  const minha = m.fromMe;
  return (
    <>
      {mostrarDia ? (
        <div style={{ textAlign: "center", margin: "10px 0 12px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: c.ink3, background: c.surface, border: `1px solid ${c.borderSoft}`, borderRadius: 999, padding: "3px 10px" }}>
            {diaLabel(m.sentAt)}
          </span>
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: minha ? "flex-end" : "flex-start", marginBottom: 8 }}>
        <div
          style={{
            maxWidth: "72%",
            background: minha ? c.brassSoft : c.surface,
            border: minha ? "none" : `1px solid ${c.border}`,
            color: c.ink,
            borderRadius: minha ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
            padding: "8px 11px",
            fontSize: 13.5,
            lineHeight: 1.45,
          }}
        >
          <Midia m={m} />
          {m.text || m.caption ? <div style={{ whiteSpace: "pre-wrap" }}>{m.text || m.caption}</div> : null}
          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", marginTop: 3 }}>
            {m.porIa ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: c.brassDeep }}>IA</span>
            ) : null}
            <span style={{ fontSize: 10.5, color: c.ink3 }}>{horaCurta(m.sentAt)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Midia({ m }: { m: MensagemWa }) {
  if (!m.mediaType) return null;

  if (!m.mediaUrl) {
    return (
      <div style={{ fontSize: 12, color: c.ink3, fontStyle: "italic", marginBottom: 4 }}>
        {m.mediaError ? "mídia não carregada" : "carregando mídia…"}
      </div>
    );
  }

  const caixa: React.CSSProperties = { maxWidth: 260, borderRadius: 8, display: "block", marginBottom: 5 };

  if (m.mediaType === "image" || m.mediaType === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.mediaUrl} alt={m.caption ?? "imagem"} style={caixa} />;
  }
  if (m.mediaType === "video") return <video src={m.mediaUrl} controls style={caixa} />;
  if (m.mediaType === "audio") return <audio src={m.mediaUrl} controls style={{ marginBottom: 5, maxWidth: 240 }} />;

  return (
    <a
      href={m.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "inline-block", marginBottom: 5, fontSize: 12.5, fontWeight: 600, color: c.brassDeep }}
    >
      📎 {m.fileName || "arquivo"}
    </a>
  );
}
