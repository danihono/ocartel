"use client";

import { useState } from "react";
import { LinkAba } from "@/components/admin/navegacao";
import { c, font } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { Kpi, Meter, MiniBars } from "@/components/ui/Kpi";
import { Segmented } from "@/components/ui/Segmented";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Seal";
import { LineChart } from "@/components/ui/LineChart";
import { statusMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import {
  formatBRL,
  selectAssinaturas,
  selectContagensTransacao,
  selectDashboardKpis,
  selectDesempenhoBarbeiros,
  selectFaturamentoSerie,
  selectKpiAgendamentosHoje,
  selectProximos,
  selectRenovacoes,
  selectResumoFinanceiro,
  selectServicosMaisVendidos,
  DIAS_PROXIMAS_RENOVACOES,
} from "@/lib/selectors";
import { isoParaDiaMes, mesLabel } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import { AgendamentoModal } from "@/components/admin/AgendamentoModal";
import { BotaoWhatsApp, motivoParaChamar, useLinkAgendamento } from "@/components/admin/ChamarDeVolta";
import { aniversariantes, clientesSumidos, comHorarioMarcado, DIAS_SUMIDO } from "@/lib/reativacao";
import type { Cliente } from "@/lib/types";

type Periodo = "7d" | "30d" | "90d";
const diasPeriodo: Record<Periodo, number> = { "7d": 7, "30d": 30, "90d": 90 };
const subPeriodo: Record<Periodo, string> = { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias" };

/** Número grande em mono, com tracking negativo. */
const numGrande = (size: number) => ({ fontFamily: font.mono, fontSize: size, fontWeight: 500, letterSpacing: "-0.05em", lineHeight: 1, color: c.ink });

export function TelaDashboard() {
  const { state } = useStore();
  const hoje = useHoje();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [agSel, setAgSel] = useState<string | null>(null);

  const kpiHoje = selectKpiAgendamentosHoje(state, hoje);
  const proximos = selectProximos(state, hoje);
  const dk = selectDashboardKpis(state, hoje);
  const resumo = selectResumoFinanceiro(state, hoje);
  const contagens = selectContagensTransacao(state, "todos", hoje);
  const assinaturas = selectAssinaturas(state, hoje);
  const desempenho = selectDesempenhoBarbeiros(state, hoje);
  const topServicos = selectServicosMaisVendidos(state, hoje);
  const fatSerie = selectFaturamentoSerie(state, diasPeriodo[periodo], hoje);
  const serie30 = selectFaturamentoSerie(state, 30, hoje);
  const serie7 = selectFaturamentoSerie(state, 7, hoje);

  const totalFin = resumo.recebidoMes + resumo.aReceber + resumo.emAtraso || 1;
  const confirmadosPct = kpiHoje.total ? Math.round(((kpiHoje.total - kpiHoje.aguardando) / kpiHoje.total) * 100) : 0;

  return (
    <div className="oc-stagger" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* KPIs: o primeiro é o herói floresta (o número que importa) */}
      <div className="oc-kpis">
        <Kpi
          hero
          label="Faturamento do mês"
          value={formatBRL(resumo.recebidoMes)}
          sub={`${formatBRL(resumo.aReceber)} ainda a receber`}
          foot={<LineChart data={serie30.data} height={52} stroke={c.neon} gridLines={[]} glow />}
        />
        <Kpi
          label="Agendamentos hoje"
          value={kpiHoje.total}
          sub={`${kpiHoje.aguardando} aguardando confirmação`}
          foot={<Meter pct={confirmadosPct} />}
        />
        <Kpi label="Ticket médio" value={formatBRL(dk.ticketMedio)} sub="por atendimento concluído" foot={<MiniBars values={serie7.data} height={34} />} />
        <Kpi label="Taxa de ocupação" value={`${dk.ocupacaoPct}%`} sub="da grade de hoje" foot={<Meter pct={dk.ocupacaoPct} />} />
      </div>

      {/* Renovações — o alerta da BARBEARIA. O cliente é avisado pelo WhatsApp; a dona,
          aqui. Só aparece quando há o que fazer: uma faixa permanente vira paisagem. */}
      <Renovacoes hojeISO={hoje} />

      {/* Quem chamar hoje: aniversariantes da semana e clientes sumidos. */}
      <ChamarHoje hojeISO={hoje} />

      {/* Faturamento + Serviços */}
      <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 18 }}>
        <Card>
          <CardTitle
            sub={subPeriodo[periodo]}
            right={
              <Segmented
                label="Período"
                value={periodo}
                onChange={setPeriodo}
                options={(["7d", "30d", "90d"] as const).map((p) => ({ value: p, label: p }))}
              />
            }
          >
            Faturamento
          </CardTitle>
          <div style={{ marginTop: 18 }}>
            <LineChart data={fatSerie.data} />
          </div>
          <div className="num" style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: c.ink4 }}>
            {fatSerie.labels.map((d, i) => (
              <span key={`${d}-${i}`}>{d}</span>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Últimos 30 dias">Serviços mais vendidos</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
            {topServicos.length === 0 ? (
              <Vazio>Sem atendimentos concluídos no período.</Vazio>
            ) : (
              topServicos.map((s, i) => (
                <div key={s.nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 7 }}>
                    <span style={{ fontWeight: 500, color: c.ink }}>{s.nome}</span>
                    <span className="num" style={{ color: c.ink2 }}>{s.qtd}</span>
                  </div>
                  <div style={{ height: 8, background: c.surfaceAlt, borderRadius: 999, overflow: "hidden" }}>
                    {/* Um tom só, do mais forte ao mais leve: ranking, não categorias. */}
                    <div style={{ width: `${s.pct}%`, height: "100%", borderRadius: 999, background: c.accent, opacity: 1 - i * 0.16 }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Próximos + Assinaturas */}
      <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 18 }}>
        <Card pad="18px 22px 8px">
          <CardTitle
            sub={`Hoje · ${isoParaDiaMes(hoje)}`}
            right={
              <LinkAba href="/agenda">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: c.accent, cursor: "pointer" }}>
                  Ver agenda <Icon name="seta" size={14} />
                </span>
              </LinkAba>
            }
          >
            Próximos na agenda
          </CardTitle>
          <div style={{ marginTop: 10 }}>
            {proximos.length === 0 ? <Vazio>Nada mais marcado para hoje.</Vazio> : null}
            {proximos.map((u, i) => {
              const m = statusMeta[u.status as keyof typeof statusMeta];
              return (
                <div
                  key={u.id}
                  onClick={() => setAgSel(u.id)}
                  className="oc-row"
                  style={{ display: "grid", gridTemplateColumns: "52px 3px minmax(0,1fr) auto", alignItems: "center", gap: 14, padding: "12px 10px", margin: "0 -10px", borderTop: i ? `1px solid ${c.borderSoft}` : "none", cursor: "pointer", borderRadius: 12 }}
                >
                  <div className="num" style={{ fontSize: 15, fontWeight: 500, color: c.ink }}>{u.hora}</div>
                  <span style={{ height: 30, borderRadius: 2, background: m?.fg ?? c.ink4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.cliente}</div>
                    <div style={{ fontSize: 12, color: c.ink3, marginTop: 2 }}>
                      {u.servico} · {u.barbeiro}
                    </div>
                  </div>
                  {m ? <StatusPill label={m.label} fg={m.fg} bg={m.bg} /> : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Clientes com plano">Assinaturas</CardTitle>
          {(() => {
            const total = assinaturas.assinantes + assinaturas.avulsos;
            const pctAss = total ? Math.round((assinaturas.assinantes / total) * 100) : 0;
            return (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 18 }}>
                  <span style={numGrande(38)}>{assinaturas.assinantes}</span>
                  <span style={{ fontSize: 13, color: c.ink3 }}>planos ativos</span>
                </div>
                <div style={{ display: "flex", gap: 3, height: 10, margin: "16px 0 12px" }}>
                  <div style={{ width: `${pctAss}%`, minWidth: pctAss ? 6 : 0, background: c.accent, borderRadius: 999 }} />
                  <div style={{ flex: 1, background: c.surfaceAlt, borderRadius: 999 }} />
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: c.ink2 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent }} />
                    {assinaturas.assinantes} assinantes
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.ink4 }} />
                    {assinaturas.avulsos} avulsos
                  </span>
                </div>
                <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 20, paddingTop: 16 }}>
                  <div className="oc-label">Receita recorrente</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
                    <span style={numGrande(26)}>{formatBRL(assinaturas.recorrenteMes)}</span>
                    <span style={{ fontSize: 12.5, color: c.ink3 }}>/mês</span>
                  </div>
                </div>
              </>
            );
          })()}
        </Card>
      </div>

      {/* Financeiro + Desempenho barbeiros */}
      <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 18 }}>
        <Card>
          <CardTitle right={<span className="oc-eyebrow" style={{ textTransform: "capitalize", letterSpacing: 0 }}>{mesLabel(hoje)}</span>}>Financeiro do mês</CardTitle>
          <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12, marginTop: 18 }}>
            {[
              { l: "Recebido", v: resumo.recebidoMes, dot: c.green },
              { l: "Pendente", v: resumo.aReceber, dot: c.amber },
              { l: "Inadimplência", v: resumo.emAtraso, dot: c.red },
            ].map((f) => (
              <div key={f.l} style={{ background: c.field, border: `1px solid ${c.borderSoft}`, borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: f.dot }} />
                  <span className="oc-label" style={{ letterSpacing: "0.06em" }}>{f.l}</span>
                </div>
                <div style={{ ...numGrande(22), marginTop: 10 }}>{formatBRL(f.v)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, height: 8, margin: "16px 0 0" }}>
            <div style={{ width: `${(resumo.recebidoMes / totalFin) * 100}%`, background: c.green, borderRadius: 999 }} />
            <div style={{ width: `${(resumo.aReceber / totalFin) * 100}%`, background: c.amber, borderRadius: 999 }} />
            <div style={{ width: `${(resumo.emAtraso / totalFin) * 100}%`, background: c.red, borderRadius: 999 }} />
          </div>
          <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 18, paddingTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, fontSize: 13, color: c.ink2, fontWeight: 500 }}>Cobranças</div>
            <StatusPill label={`${contagens.Pagas} pagas`} fg={c.greenText} bg={c.greenBg} />
            <StatusPill label={`${contagens.Pendentes} pendentes`} fg={c.amberText} bg={c.amberBg} />
            <StatusPill label={`${contagens.Atrasadas} atrasadas`} fg={c.redText} bg={c.redBg} />
          </div>
        </Card>

        <Card>
          <CardTitle sub="Hoje">Barbeiros</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
            {desempenho.length === 0 ? (
              <Vazio>Nenhum barbeiro cadastrado.</Vazio>
            ) : (
              desempenho.map((b, i) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar initials={b.iniciais} size={36} bg={i === 0 ? c.forest : c.surfaceAlt} color={i === 0 ? c.neon : c.ink} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: c.ink }}>{b.nome}</span>
                      <span className="num" style={{ fontSize: 13, color: c.ink }}>{formatBRL(b.faturamento)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 7 }}>
                      <div style={{ flex: 1 }}>
                        <Meter pct={b.pct} />
                      </div>
                      <span className="num" style={{ fontSize: 11, color: c.ink3, whiteSpace: "nowrap" }}>{b.atendimentos} atend.</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <AgendamentoModal open={agSel !== null} onClose={() => setAgSel(null)} agendamentoId={agSel} />
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: c.ink3, padding: "18px 0", textAlign: "center" }}>{children}</div>;
}

/**
 * Estado do ciclo de renovação hoje. Lê das cobranças que o store já tem — sem query nova.
 *
 * A ordem dos números não é decorativa: o que exige ação da dona vem primeiro. Cadastro sem
 * CPF é o mais urgente, porque é o único que o sistema NÃO consegue resolver sozinho — sem
 * CPF não existe boleto, e a cobrança fica parada até alguém completar a ficha.
 */
function Renovacoes({ hojeISO }: { hojeISO: string }) {
  const { state } = useStore();
  const r = selectRenovacoes(state, hojeISO);

  const nada =
    r.vencemHoje.length === 0 &&
    r.proximas.length === 0 &&
    r.atrasadas.length === 0 &&
    r.semCpf.length === 0 &&
    r.cartaoRecusado.length === 0;
  if (nada) return null;

  const itens = [
    { n: r.atrasadas.length, label: "em atraso", cor: c.red, texto: c.redText },
    { n: r.vencemHoje.length, label: "vencem hoje", cor: c.amber, texto: c.amberText },
    { n: r.proximas.length, label: `vencem em ${DIAS_PROXIMAS_RENOVACOES} dias`, cor: c.accent, texto: c.inkTitle },
    { n: r.comBoleto.length, label: "com boleto emitido", cor: c.ink4, texto: c.ink2 },
    { n: r.noCartao.length, label: "cobradas no cartão", cor: c.green, texto: c.greenText },
  ].filter((i) => i.n > 0);

  return (
    <Card pad="16px 20px">
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <CardTitle sub="Mensalidades">Renovações</CardTitle>
        <div style={{ flex: 1 }} />
        <LinkAba href="/pagamentos" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: c.accent, fontWeight: 600 }}>
          Ver cobranças <Icon name="seta" size={14} />
        </LinkAba>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginTop: 14 }}>
        {itens.map((i) => (
          <div key={i.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: i.cor, flex: "none" }} />
            <span className="num" style={{ fontSize: 22, fontWeight: 500, color: i.texto }}>{i.n}</span>
            <span style={{ fontSize: 12.5, color: c.ink3 }}>{i.label}</span>
          </div>
        ))}
      </div>

      {/* A recusa de cartão é o único caso em que o dinheiro não entrou E o sistema, de
          propósito, não fez mais nada — não sai boleto automático para quem tem cartão.
          Se isto ficar discreto, a mensalidade some do radar até virar três meses de
          atraso. Daí o aviso vir antes do de CPF. */}
      {r.cartaoRecusado.length > 0 ? (
        <div style={{ marginTop: 14, background: c.amberBg, borderRadius: 14, padding: "12px 15px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: c.amberText }}>
            {r.cartaoRecusado.length} cobrança{r.cartaoRecusado.length === 1 ? "" : "s"} recusada
            {r.cartaoRecusado.length === 1 ? "" : "s"} no cartão
          </div>
          <div style={{ fontSize: 12, color: c.ink2, marginTop: 3 }}>
            Não emitimos boleto sozinho para quem tem cartão — a decisão é sua. Em{" "}
            <LinkAba href="/pagamentos" style={{ color: c.accent, fontWeight: 600 }}>Pagamentos</LinkAba>{" "}
            você emite o boleto na hora ou registra o pagamento:{" "}
            {r.cartaoRecusado.slice(0, 3).map((t) => t.clienteNome).join(", ")}
            {r.cartaoRecusado.length > 3 ? ` e mais ${r.cartaoRecusado.length - 3}` : ""}.
          </div>
        </div>
      ) : null}

      {r.semCpf.length > 0 ? (
        <div style={{ marginTop: 14, background: c.redBg, borderRadius: 14, padding: "12px 15px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: c.redText }}>
            {r.semCpf.length} cobrança{r.semCpf.length === 1 ? "" : "s"} vencida{r.semCpf.length === 1 ? "" : "s"} sem CPF no cadastro
          </div>
          <div style={{ fontSize: 12, color: c.ink2, marginTop: 3 }}>
            Sem CPF o boleto não pode ser emitido. Complete a ficha em{" "}
            <LinkAba href="/clientes" style={{ color: c.accent, fontWeight: 600 }}>Clientes</LinkAba>:{" "}
            {r.semCpf.slice(0, 3).map((t) => t.clienteNome).join(", ")}
            {r.semCpf.length > 3 ? ` e mais ${r.semCpf.length - 3}` : ""}.
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * "Chamar de volta": aniversariantes dos próximos dias e quem não volta há muito tempo,
 * cada um com a mensagem pronta no WhatsApp. Some quando não há ninguém para chamar.
 */
function ChamarHoje({ hojeISO }: { hojeISO: string }) {
  const { state } = useStore();
  const link = useLinkAgendamento();
  const aniv = aniversariantes(state.clientes, hojeISO);
  const sumidos = clientesSumidos(state.clientes, state.agendamentos, hojeISO);
  if (!aniv.length && !sumidos.length) return null;
  const marcados = comHorarioMarcado(state.agendamentos, hojeISO);

  const coluna = (titulo: string, icone: "estrela" | "relogio", lista: Cliente[], vazio: string) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ color: c.accent }}>
          <Icon name={icone} size={15} />
        </span>
        <span className="oc-label">{titulo}</span>
        <span className="oc-chip num" style={{ background: c.surfaceAlt, color: c.ink2, fontWeight: 500, padding: "1px 8px" }}>{lista.length}</span>
      </div>
      {lista.length === 0 ? <div style={{ fontSize: 13, color: c.ink3, padding: "12px 0" }}>{vazio}</div> : null}
      {lista.slice(0, 4).map((cl, i) => {
        const m = motivoParaChamar(cl, hojeISO, marcados, state.config.nome, link);
        return (
          <div key={cl.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${c.borderSoft}` : "none" }}>
            <Avatar initials={cl.iniciais} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cl.nome}</div>
              <div style={{ fontSize: 12, color: c.ink3, marginTop: 1 }}>{m?.texto ?? ""}</div>
            </div>
            {m ? <BotaoWhatsApp telefone={cl.telefone} mensagem={m.mensagem} /> : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardTitle
        sub="Uma mensagem na hora certa traz o cliente de volta"
        right={
          <LinkAba href="/clientes">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: c.accent, cursor: "pointer" }}>
              Ver todos <Icon name="seta" size={14} />
            </span>
          </LinkAba>
        }
      >
        Chamar de volta
      </CardTitle>
      <div className="oc-stack-mobile" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 28, marginTop: 16 }}>
        {coluna("Aniversariantes da semana", "estrela", aniv, "Ninguém faz aniversário nos próximos dias.")}
        {coluna(`Sumidos há ${DIAS_SUMIDO}+ dias`, "relogio", sumidos, "Todo mundo voltando — ótimo sinal.")}
      </div>
    </Card>
  );
}
