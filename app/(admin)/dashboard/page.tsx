"use client";

import { useState } from "react";
import Link from "next/link";
import { c, font } from "@/lib/theme";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Seal";
import { LineChart } from "@/components/ui/LineChart";
import { statusMeta } from "@/lib/status";
import { useStore } from "@/lib/store";
import { selectKpiAgendamentosHoje, selectProximos } from "@/lib/selectors";
import { HOJE_ISO, isoParaDiaMes } from "@/lib/date";
import { AgendamentoModal } from "@/components/admin/AgendamentoModal";
import {
  desempenhoBarbeiros,
  faturamento30d,
  financeiro,
  kpis,
  servicosMaisVendidos,
} from "@/lib/mock-data";

const eyebrow = { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" as const, color: c.ink3, fontWeight: 600 };
const bigNum = { fontFamily: font.serif, fontSize: 31, fontWeight: 600, marginTop: 8, color: c.inkTitle };

type Periodo = "7d" | "30d" | "90d";
const series: Record<Periodo, number[]> = {
  "7d": faturamento30d.slice(-7),
  "30d": faturamento30d,
  "90d": faturamento30d.concat([...faturamento30d].reverse()).filter((_, i) => i % 2 === 0),
};
const subPeriodo: Record<Periodo, string> = { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias" };
const labelsPeriodo: Record<Periodo, string[]> = {
  "7d": ["17 jun", "19 jun", "21 jun", "22 jun", "23 jun"],
  "30d": ["26 mai", "02 jun", "09 jun", "16 jun", "22 jun"],
  "90d": ["mar", "abr", "mai", "jun"],
};

export default function DashboardPage() {
  const { state } = useStore();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [agSel, setAgSel] = useState<string | null>(null);

  const kpiHoje = selectKpiAgendamentosHoje(state, HOJE_ISO);
  const proximos = selectProximos(state, HOJE_ISO);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1600 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
        {kpis.map((k) => {
          const hoje = k.label === "Agendamentos hoje";
          const value = hoje ? String(kpiHoje.total) : k.value;
          const delta = hoje ? `${kpiHoje.aguardando} aguardando confirmação` : k.delta;
          return (
            <Card key={k.label} pad="18px 20px">
              <div style={eyebrow}>{k.label}</div>
              <div style={bigNum}>{value}</div>
              {"bar" in k && k.bar != null ? (
                <div style={{ height: 5, background: c.surfaceAlt, borderRadius: 3, marginTop: 11, overflow: "hidden" }}>
                  <div style={{ width: `${k.bar}%`, height: "100%", background: c.brass }} />
                </div>
              ) : (
                <div style={{ fontSize: 12, marginTop: 6, color: !hoje && k.deltaTone === "green" ? c.green : c.ink3, fontWeight: 600 }}>
                  {delta}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Faturamento + Serviços */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
            <CardTitle sub={subPeriodo[periodo]}>Faturamento</CardTitle>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 5 }}>
              {(["7d", "30d", "90d"] as const).map((p) => {
                const on = p === periodo;
                return (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      fontSize: 11.5,
                      fontWeight: on ? 700 : 600,
                      color: on ? c.inkTitle : c.ink3,
                      padding: "5px 11px",
                      borderRadius: 999,
                      background: on ? c.brassSoft : c.surfaceWarm,
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <LineChart data={series[periodo]} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: c.ink4, fontWeight: 500 }}>
            {labelsPeriodo[periodo].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle sub="Últimos 30 dias">Serviços mais vendidos</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 15, marginTop: 18 }}>
            {servicosMaisVendidos.map((s) => (
              <div key={s.nome}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: c.inkTitle }}>{s.nome}</span>
                  <span style={{ color: c.ink2, fontWeight: 600 }}>{s.qtd}</span>
                </div>
                <div style={{ height: 7, background: c.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${s.pct}%`, height: "100%", background: s.cor }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Próximos + Assinaturas */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>Próximos na agenda</span>
              <span style={{ fontSize: 12, color: c.ink3, marginLeft: 10 }}>Hoje · {isoParaDiaMes(HOJE_ISO)}</span>
            </div>
            <Link href="/agenda">
              <span style={{ fontSize: 12.5, fontWeight: 700, color: c.brassDeep, cursor: "pointer" }}>Ver agenda →</span>
            </Link>
          </div>
          {proximos.map((u) => {
            const m = statusMeta[u.status as keyof typeof statusMeta];
            return (
              <div
                key={u.id}
                onClick={() => setAgSel(u.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: `1px solid ${c.borderSoft}`, cursor: "pointer" }}
              >
                <div style={{ fontFamily: font.serif, fontSize: 16, fontWeight: 600, width: 50, color: c.inkTitle }}>{u.hora}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.ink }}>{u.cliente}</div>
                  <div style={{ fontSize: 12, color: c.ink2, marginTop: 1 }}>
                    {u.servico} · {u.barbeiro}
                  </div>
                </div>
                {m ? <StatusPill label={m.label} fg={m.fg} bg={m.bg} /> : null}
              </div>
            );
          })}
        </Card>

        <Card>
          <CardTitle>Assinaturas</CardTitle>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 16 }}>
            <span style={{ fontFamily: font.serif, fontSize: 34, fontWeight: 600, color: c.inkTitle }}>142</span>
            <span style={{ fontSize: 13, color: c.ink2, marginBottom: 7 }}>planos ativos</span>
          </div>
          <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", margin: "14px 0 12px" }}>
            <div style={{ width: "31%", background: c.brass }} />
            <div style={{ width: "69%", background: c.brown }} />
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: c.inkLabel }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: c.brass }} />142 assinantes
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: c.brown }} />318 avulsos
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 18, paddingTop: 16 }}>
            <div style={eyebrow}>Receita recorrente</div>
            <div style={{ fontFamily: font.serif, fontSize: 24, fontWeight: 600, color: c.inkTitle, marginTop: 5 }}>
              R$ 19.880
              <span style={{ fontSize: 13, fontFamily: font.sans, color: c.ink3, fontWeight: 500 }}>/mês</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Financeiro + Desempenho barbeiros */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
            <CardTitle>Financeiro do mês</CardTitle>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: c.ink3, fontWeight: 600 }}>Junho</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {[
              { l: "Recebido", v: financeiro.recebido, dot: c.green },
              { l: "Pendente", v: financeiro.pendente, dot: c.amber },
              { l: "Inadimplência", v: financeiro.inadimplencia, dot: c.red },
            ].map((f) => (
              <div key={f.l} style={{ background: c.surfaceAlt, borderRadius: 11, padding: "13px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.dot }} />
                  <span style={{ fontSize: 11.5, color: c.ink3, fontWeight: 600 }}>{f.l}</span>
                </div>
                <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle, marginTop: 6 }}>{f.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", margin: "14px 0 0" }}>
            <div style={{ width: `${financeiro.recebidoPct}%`, background: c.green }} />
            <div style={{ width: `${financeiro.pendentePct}%`, background: c.amber }} />
            <div style={{ width: `${financeiro.inadimplenciaPct}%`, background: c.red }} />
          </div>
          <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 16, paddingTop: 14, display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 13, color: c.inkLabel, fontWeight: 600 }}>Comissões a pagar</div>
            <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: c.inkTitle }}>{financeiro.comissoesAPagar}</div>
            <div style={{ fontSize: 11.5, color: c.ink3, marginLeft: 10 }}>fechamento sex 27</div>
          </div>
        </Card>

        <Card>
          <CardTitle sub="Hoje">Barbeiros</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            {desempenhoBarbeiros.map((b) => (
              <div key={b.nome} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar initials={b.iniciais} size={34} bg={c.leather} color={c.darkText} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: c.inkTitle }}>{b.nome}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.inkTitle }}>{b.comissao}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 5 }}>
                    <div style={{ flex: 1, height: 5, background: c.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${b.pct}%`, height: "100%", background: c.brass }} />
                    </div>
                    <span style={{ fontSize: 11, color: c.ink3, fontWeight: 600, whiteSpace: "nowrap" }}>{b.atendimentos}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <AgendamentoModal open={agSel !== null} onClose={() => setAgSel(null)} agendamentoId={agSel} />
    </div>
  );
}
