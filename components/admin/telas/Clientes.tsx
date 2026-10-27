"use client";

import { baixarPlanilha, linhasClientes, nomeArquivo } from "@/lib/exportar";
import { ExportarBotao } from "@/components/ui/ExportarBotao";
import { useEffect, useMemo, useState } from "react";
import { c, font } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Tag } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Seal";
import { tagMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import {
  selectClientesFiltrados,
  type OrdemCliente,
  selectContagensCliente,
  selectHistoricoCliente,
  selectProximoAgendamentoCliente,
  selectFormaPreferidaCliente,
  tagDerivadaCliente,
  diaVencimentoCliente,
  planoDoCliente,
  formaPagamentoLabel,
  formatBRL,
  type FiltroCliente,
} from "@/lib/selectors";
import { isoParaLabel, tempoRelativo } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import { useListaProgressiva } from "@/lib/useListaProgressiva";
import { ClienteModal } from "@/components/admin/ClienteModal";
import { ImportarClientesModal } from "@/components/admin/ImportarClientesModal";
import { NovoAgendamentoModal } from "@/components/admin/NovoAgendamentoModal";
import { CadastrarCartaoModal } from "@/components/admin/CadastrarCartaoModal";
import { acaoLinkCartao, acaoRemoverCartao } from "@/app/(admin)/clientes/actions";
import { useAuth } from "@/lib/firebase/auth";
import { linkWhatsApp } from "@/lib/confirmacao";
import { mensagemConviteCartao } from "@/lib/cobranca-mensagem";
import { telefoneWhatsApp } from "@/lib/clientes-import";

const eyebrow = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };
/** Caixinha de informação dentro do perfil. */
const caixa: React.CSSProperties = { background: c.field, border: `1px solid ${c.borderSoft}`, borderRadius: 14, padding: "14px 16px" };
const FILTROS: FiltroCliente[] = ["Todos", "VIP", "Avulsos", "Inadimplentes"];
const ORDENS: { value: OrdemCliente; label: string }[] = [
  { value: "nome", label: "Nome (A–Z)" },
  { value: "atendimento-recente", label: "Atendimento mais recente" },
  { value: "atendimento-antigo", label: "Sumidos primeiro" },
  { value: "recentes", label: "Cadastrados recentemente" },
];
const HIST_INICIAL = 8;

export function TelaClientes() {
  const { state, dispatch, actions } = useStore();
  const { user, tenantId } = useAuth();
  const toast = useToast();
  const hoje = useHoje();

  // Busca / filtro / seleção vivem no store: trocar de aba no menu e voltar
  // devolve a tela exatamente como estava.
  const tela = state.ui.telas.clientes;
  const { busca, filtro, ordem } = tela;
  const selId = tela.selId ?? "";
  const setTela = (patch: Partial<typeof tela>) => dispatch({ type: "SET_TELA", tela: "clientes", patch });
  const setBusca = (q: string) => setTela({ busca: q });
  const setFiltro = (f: FiltroCliente) => setTela({ filtro: f });
  const setOrdem = (o: OrdemCliente) => setTela({ ordem: o });
  const setSelId = (id: string) => setTela({ selId: id || null });

  const [novoOpen, setNovoOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cartaoBusy, setCartaoBusy] = useState<"link" | "remover" | null>(null);
  const [cadastrarCartaoOpen, setCadastrarCartaoOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [verTudo, setVerTudo] = useState(false);

  // Lê ?q (vindo da busca da Topbar) só no cliente, após montar — preserva o SSR.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setBusca(q);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Os seletores recebem o AppState inteiro, mas cada um lê só algumas coleções.
  // Memoizar sobre essas fatias — e não sobre `state`, que é um objeto novo a
  // cada snapshot de QUALQUER listener do Firestore — evita recalcular a lista
  // (e o painel de detalhe) quando nada que eles leem mudou.
  const { clientes, agendamentos, transacoes, barbeiros, servicos } = state;

  /* eslint-disable react-hooks/exhaustive-deps -- deps são as fatias de `state` lidas por cada seletor (ver comentário acima) */
  const lista = useMemo(
    () => selectClientesFiltrados(state, filtro, busca, hoje, ordem),
    [clientes, transacoes, filtro, busca, hoje, ordem],
  );
  const contagens = useMemo(() => selectContagensCliente(state, hoje), [clientes, transacoes, hoje]);

  // Seleção restrita à lista filtrada; cai no 1º item, ou null (estado vazio).
  const sel = lista.find((x) => x.id === selId) ?? lista[0] ?? null;
  // Marcador exibido = derivado das cobranças (Inadimplente) com fallback ao tag manual (VIP/Novo).
  const selTagValue = useMemo(() => (sel ? tagDerivadaCliente(state, sel, hoje) : ""), [sel, transacoes, hoje]);
  const selTag = tagMeta(selTagValue);

  const historico = useMemo(
    () => (sel ? selectHistoricoCliente(state, sel) : []),
    [sel, agendamentos, barbeiros, servicos],
  );
  const proximo = useMemo(
    () => (sel ? selectProximoAgendamentoCliente(state, sel, hoje) : null),
    [sel, agendamentos, barbeiros, hoje],
  );
  const formaPreferida = useMemo(() => (sel ? selectFormaPreferidaCliente(state, sel) : null), [sel, transacoes]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // A lista sai em blocos; `sel` continua saindo da lista COMPLETA, então um
  // cliente selecionado além do corte segue resolvendo.
  const { visiveis, restantes, mostrarMais } = useListaProgressiva(lista, `${filtro}|${busca}|${ordem}`);

  const histVisivel = verTudo ? historico : historico.slice(0, HIST_INICIAL);

  async function excluirCliente() {
    if (!sel) return;
    const ativos: string[] = ["agendado", "confirmado", "atendimento"];
    const futuros = state.agendamentos.filter(
      (a) => (a.clienteId ? a.clienteId === sel.id : a.clienteNome === sel.nome) && a.date >= hoje && ativos.includes(a.status),
    ).length;
    const aviso = futuros > 0 ? `\n\nAtenção: ${futuros} agendamento(s) futuro(s) deste cliente continuarão na agenda.` : "";
    if (!window.confirm(`Excluir ${sel.nome}? Esta ação não pode ser desfeita.${aviso}`)) return;
    try {
      await actions.clientes.remove(sel.id);
      toast("Cliente excluído.");
      setSelId("");
    } catch {
      toast("Não foi possível excluir o cliente.", "error");
    }
  }

  /** A vitrine do cartão deste cliente. Nunca o token — aquele não sai do servidor. */
  const cartaoDoSel = sel ? state.cartoes.find((k) => k.clienteId === sel.id) : undefined;
  const temCartaoAtivo = !!cartaoDoSel && cartaoDoSel.ativo !== false;

  /**
   * Manda o convite por clique-para-conversar, como a confirmação de presença já faz.
   * Sem rota nova e sem depender do WhatsApp estar vinculado: quem envia é a barbearia.
   */
  async function enviarLinkCartao() {
    if (!sel || !user || !tenantId || cartaoBusy) return;
    const telefone = telefoneWhatsApp(sel.telefone ?? "");
    if (!telefone) {
      toast("Este cliente não tem um telefone utilizável no cadastro.", "error");
      return;
    }
    setCartaoBusy("link");
    try {
      const r = await acaoLinkCartao(await user.getIdToken(), tenantId, sel.id, window.location.origin);
      if (!r.ok || !r.link) {
        toast(r.erro ?? "Não foi possível gerar o link.", "error");
        return;
      }
      const texto = mensagemConviteCartao({
        cliente: sel.nome,
        barbearia: state.config.nome,
        plano: sel.plano,
        valor: planoDoCliente(state.planos, sel)?.valor ?? 0,
        link: r.link,
      });
      window.open(linkWhatsApp(telefone, texto), "_blank", "noreferrer");
    } catch {
      toast("Não foi possível gerar o link.", "error");
    } finally {
      setCartaoBusy(null);
    }
  }

  async function removerCartaoDoCliente() {
    if (!sel || !user || !tenantId || cartaoBusy) return;
    if (!window.confirm(`Remover o cartão de ${sel.nome}? As próximas mensalidades voltam a ser cobradas como antes.`)) return;
    setCartaoBusy("remover");
    try {
      const r = await acaoRemoverCartao(await user.getIdToken(), tenantId, sel.id);
      toast(r.ok ? "Cartão removido." : (r.erro ?? "Não foi possível remover."), r.ok ? undefined : "error");
    } catch {
      toast("Não foi possível remover o cartão.", "error");
    } finally {
      setCartaoBusy(null);
    }
  }

  return (
    <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(0,1fr)", gap: 18, height: "100%" }}>
      {/* List */}
      <div className="oc-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 420 }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${c.borderSoft}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <h2 className="oc-h2">Base de clientes</h2>
            <span className="oc-chip num" style={{ color: c.ink2, background: c.surfaceAlt, fontWeight: 500 }}>{contagens.Todos}</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" icon="upload" onClick={() => setImportOpen(true)}>
              Importar
            </Button>
            {/* Exporta a lista COMO ESTÁ na tela: filtro, busca e ordem valem. */}
            <ExportarBotao
              disabled={lista.length === 0}
              onExportar={(f) =>
                baixarPlanilha(nomeArquivo(filtro === "Todos" ? "clientes" : `clientes ${filtro}`, hoje, f), [{ nome: "Clientes", linhas: linhasClientes(lista) }], f)
              }
            />
            <Button size="sm" icon="mais" onClick={() => setNovoOpen(true)}>
              Novo cliente
            </Button>
          </div>
          <div className="oc-search" style={{ marginBottom: 12 }}>
            <Icon name="busca" size={15} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail…" aria-label="Buscar cliente" />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="oc-seg" role="group" aria-label="Filtro">
              {FILTROS.map((f) => (
                <button key={f} type="button" aria-pressed={f === filtro} onClick={() => setFiltro(f)}>
                  {f} <span className="oc-seg-count">{contagens[f]}</span>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 8 }} />
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as OrdemCliente)}
              aria-label="Ordenar clientes por"
              style={{
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.ink2,
                borderRadius: 999,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 500,
                fontFamily: font.sans,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {ORDENS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {lista.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: c.ink3, fontSize: 13 }}>Nenhum cliente encontrado.</div>
          ) : null}
          {visiveis.map((cl) => {
            const active = sel?.id === cl.id;
            const clTag = tagDerivadaCliente(state, cl, hoje);
            const t = tagMeta(clTag);
            const ultimo = cl.ultimoAtendimentoISO ? tempoRelativo(cl.ultimoAtendimentoISO, hoje) : cl.ultimoAtendimento;
            return (
              <button
                key={cl.id}
                onClick={() => { setSelId(cl.id); setVerTudo(false); }}
                className={active ? undefined : "oc-row"}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  cursor: "pointer",
                  background: active ? `linear-gradient(90deg, ${c.accentTint}, transparent)` : "transparent",
                  boxShadow: active ? `inset 3px 0 0 ${c.accent}` : undefined,
                  display: "flex",
                  alignItems: "center",
                  gap: 13,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${c.borderSoft}`,
                }}
              >
                <Avatar initials={cl.iniciais} size={38} bg={active ? c.forest : c.surfaceAlt} color={active ? c.neon : c.ink} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
                  <div style={{ fontSize: 12, color: c.ink3, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{cl.telefone}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: c.inkTitle }}>{cl.plano}</div>
                  <div style={{ fontSize: 11, color: c.ink3, marginTop: 2 }}>{ultimo}</div>
                </div>
                {t ? <Tag label={clTag} fg={t.fg} bg={t.bg} /> : null}
              </button>
            );
          })}
          {restantes > 0 ? (
            <button
              onClick={mostrarMais}
              style={{ width: "100%", border: "none", borderTop: `1px solid ${c.borderSoft}`, background: c.field, color: c.accent, cursor: "pointer", padding: "13px 0", fontSize: 12.5, fontWeight: 600 }}
            >
              Mostrar mais ({restantes})
            </button>
          ) : null}
        </div>
      </div>

      {/* Detail */}
      {sel ? (
        <Card pad="24px" style={{ overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <Avatar initials={sel.iniciais} size={60} bg={c.forest} color={c.neon} fontSize={19} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.03em", color: c.inkTitle }}>{sel.nome}</span>
                {selTag ? <Tag label={selTagValue} fg={selTag.fg} bg={selTag.bg} /> : null}
              </div>
              <div style={{ fontSize: 13, color: c.ink2, marginTop: 3 }}>
                {[sel.telefone, sel.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "none" }}>
              <Button size="sm" icon="agenda" onClick={() => setAgendarOpen(true)}>
                Agendar
              </Button>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setEditOpen(true)} className="oc-icon-btn" aria-label="Editar cliente" title="Editar">
                  <Icon name="editar" size={15} />
                </button>
                <button onClick={excluirCliente} className="oc-icon-btn" aria-label="Excluir cliente" title="Excluir" style={{ color: c.red }}>
                  <Icon name="lixo" size={15} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 22 }}>
            {[
              { l: "Total gasto", v: formatBRL(sel.totalGasto) },
              { l: "Atendimentos", v: String(sel.atendimentos) },
              { l: "Cliente desde", v: sel.desde },
            ].map((s) => (
              <div key={s.l} style={caixa}>
                <div style={eyebrow}>{s.l}</div>
                <div className={s.l === "Cliente desde" ? undefined : "num"} style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.03em", color: c.inkTitle, marginTop: 8, whiteSpace: "nowrap" }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Plano */}
          <div style={{ border: `1px solid ${c.border}`, background: c.surface, borderRadius: 14, padding: 16, marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, flex: 1 }}>Plano · {sel.plano}</span>
            {/* O vencimento é deste cliente, não do plano. */}
            {!/avulso/i.test(sel.plano) ? (
              <span className="oc-chip" style={{ color: c.ink2, background: c.surfaceAlt }}>
                Vence dia {diaVencimentoCliente(sel, planoDoCliente(state.planos, sel))}
              </span>
            ) : null}
            <span className="oc-chip" style={{ color: /avulso/i.test(sel.plano) ? c.ink3 : c.greenText, background: /avulso/i.test(sel.plano) ? c.surfaceAlt : c.greenBg }}>
              {/avulso/i.test(sel.plano) ? "Sem plano ativo" : "Plano ativo"}
            </span>
          </div>

          {/* Cartão salvo. Fica junto do plano porque é a mesma pergunta: como esta
              mensalidade é paga. O estado "recusado" é amarelo de propósito — significa
              que o dinheiro não entrou e o sistema, por decisão, não emitiu boleto
              sozinho. */}
          {!/avulso/i.test(sel.plano) ? (
            <div style={{ border: `1px solid ${c.border}`, background: c.surface, borderRadius: 14, padding: 16, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle, flex: 1 }}>
                  {temCartaoAtivo
                    ? `Cartão · ${cartaoDoSel!.bandeira} ••${cartaoDoSel!.ultimosDigitos}`
                    : "Cartão · não cadastrado"}
                </span>
                {temCartaoAtivo && (cartaoDoSel!.falhasSeguidas ?? 0) > 0 ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: c.amberText }}>
                    {cartaoDoSel!.falhasSeguidas === 1 ? "1 recusa" : `${cartaoDoSel!.falhasSeguidas} recusas`}
                  </span>
                ) : null}
                {temCartaoAtivo ? (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: c.green }}>
                    {cartaoDoSel!.origem === "balcao" ? "Cadastrado no balcão" : "Cobrança automática"}
                  </span>
                ) : cartaoDoSel ? (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: c.ink3 }}>
                    {cartaoDoSel.motivoRemocao === "recusas"
                      ? "Removido após recusas"
                      : cartaoDoSel.motivoRemocao === "chargeback"
                        ? "Removido após contestação"
                        : "Removido"}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
                {/* O balcão vem primeiro: é o caminho do dia a dia, com o cliente na
                    frente. O link do WhatsApp serve pra quem não está na barbearia. */}
                {!temCartaoAtivo ? (
                  <button
                    onClick={() => setCadastrarCartaoOpen(true)}
                    disabled={cartaoBusy !== null}
                    style={{ border: "none", background: "transparent", cursor: cartaoBusy ? "default" : "pointer", color: c.accent, fontSize: 12.5, fontWeight: 600, padding: 0 }}
                  >
                    Cadastrar cartão no balcão →
                  </button>
                ) : null}
                <button
                  onClick={enviarLinkCartao}
                  disabled={cartaoBusy !== null}
                  style={{ border: "none", background: "transparent", cursor: cartaoBusy ? "default" : "pointer", color: temCartaoAtivo ? c.brassDeep : c.ink3, fontSize: 12, fontWeight: temCartaoAtivo ? 700 : 600, padding: 0 }}
                >
                  {cartaoBusy === "link" ? "Gerando…" : temCartaoAtivo ? "Enviar link do cartão →" : "Mandar link pelo WhatsApp"}
                </button>
                {temCartaoAtivo ? (
                  <button
                    onClick={removerCartaoDoCliente}
                    disabled={cartaoBusy !== null}
                    style={{ border: "none", background: "transparent", cursor: cartaoBusy ? "default" : "pointer", color: c.ink3, fontSize: 12, fontWeight: 600, padding: 0, textDecoration: "underline" }}
                  >
                    {cartaoBusy === "remover" ? "Removendo…" : "Remover cartão"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Próximo + Pagamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={caixa}>
              <div style={eyebrow}>Próximo agendamento</div>
              {proximo ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.inkTitle, marginTop: 7 }}>
                    {isoParaLabel(proximo.date)} · <span className="num">{proximo.inicio}</span>
                  </div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>{proximo.servico} · {proximo.barbeiroNome}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink3, marginTop: 5 }}>Nenhum futuro</div>
                  <button onClick={() => setAgendarOpen(true)} style={{ marginTop: 4, border: "none", background: "transparent", cursor: "pointer", color: c.accent, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
                    Agendar →
                  </button>
                </>
              )}
            </div>
            <div style={caixa}>
              <div style={eyebrow}>Forma de pagamento</div>
              {formaPreferida ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.inkTitle, marginTop: 7 }}>{formaPagamentoLabel[formaPreferida]}</div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 2 }}>mais usada</div>
                </>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 600, color: c.ink3, marginTop: 5 }}>Sem pagamentos</div>
              )}
            </div>
          </div>

          {/* Observações */}
          <div style={{ marginTop: 18 }}>
            <div style={{ ...eyebrow, marginBottom: 7 }}>Observações</div>
            <div style={{ fontSize: 13.5, color: sel.observacoes ? c.inkTitle : c.ink3, lineHeight: 1.5, ...caixa }}>
              {sel.observacoes || "Sem observações."}
            </div>
          </div>

          {/* Histórico */}
          <div style={{ marginTop: 20 }}>
            <div style={{ ...eyebrow, marginBottom: 6 }}>Histórico de atendimentos</div>
            {historico.length === 0 ? (
              <div style={{ fontSize: 13, color: c.ink3, padding: "12px 0" }}>Nenhum atendimento concluído ainda.</div>
            ) : (
              <>
                {histVisivel.map((h) => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
                    <div className="num" style={{ fontSize: 12.5, color: c.ink3, width: 52 }}>{h.data}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: c.inkTitle }}>{h.servico}</span>
                      <span style={{ fontSize: 12, color: c.ink2, marginLeft: 8 }}>{h.barbeiro}</span>
                    </div>
                    <div className="num" style={{ fontSize: 13, color: c.inkTitle }}>{formatBRL(h.valor)}</div>
                  </div>
                ))}
                {historico.length > HIST_INICIAL ? (
                  <button onClick={() => setVerTudo((v) => !v)} style={{ marginTop: 10, border: "none", background: "transparent", cursor: "pointer", color: c.accent, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
                    {verTudo ? "Ver menos" : `Ver tudo (${historico.length})`}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </Card>
      ) : (
        <Card pad="24px" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: c.forest, color: c.neon, display: "grid", placeItems: "center" }}>
            <Icon name="usuario" size={22} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: c.inkTitle, marginTop: 8 }}>Selecione um cliente</div>
          <div style={{ fontSize: 13, color: c.ink3, maxWidth: 260 }}>Escolha um cliente na lista ao lado para ver o perfil completo, ou cadastre um novo.</div>
          <Button size="sm" icon="mais" onClick={() => setNovoOpen(true)} style={{ marginTop: 10 }}>
            Novo cliente
          </Button>
        </Card>
      )}

      <CadastrarCartaoModal
        open={cadastrarCartaoOpen}
        onClose={() => setCadastrarCartaoOpen(false)}
        cliente={sel ?? null}
        valorMensalidade={sel ? (planoDoCliente(state.planos, sel)?.valor ?? 0) : 0}
        diaVencimento={sel ? diaVencimentoCliente(sel, planoDoCliente(state.planos, sel)) : 5}
      />
      <ClienteModal open={novoOpen} onClose={() => setNovoOpen(false)} onSaved={(id) => { setFiltro("Todos"); setBusca(""); setSelId(id); }} />
      <ImportarClientesModal open={importOpen} onClose={() => setImportOpen(false)} />
      {sel ? <ClienteModal open={editOpen} onClose={() => setEditOpen(false)} cliente={sel} /> : null}
      {sel ? <NovoAgendamentoModal open={agendarOpen} onClose={() => setAgendarOpen(false)} defaults={{ clienteNome: sel.nome, clienteId: sel.id }} /> : null}
    </div>
  );
}
