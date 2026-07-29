"use client";

// Tela pública de gestão do próprio agendamento — cancelar ou remarcar sem ter
// conta. O direito de mexer vem do token secreto na URL, entregue ao cliente na
// confirmação do booking.
//
// Todas as decisões aqui são conveniência visual; quem manda são as server
// actions (app/book/[slug]/actions.ts), que refazem as mesmas checagens.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { useToast } from "@/components/ui/Toast";
import { fmtDur } from "@/lib/selectors";
import { addDias, diaSemanaCurtoLabel, hojeLocalISO, indiceSegDom, isoParaDiaMes, agoraHHMM } from "@/lib/date";
import { gerarHorarios, horaParaMin, horarioLivre, type IntervaloOcupado } from "@/lib/agenda";
import { carregarCatalogoPorSlug, type BookingCatalog } from "@/lib/firebase/booking";
import { MENSAGEM_BLOQUEIO, podeGerenciar } from "@/lib/gestao-agendamento";
import {
  cancelarAgendamentoPorToken,
  carregarAgendamentoPorToken,
  disponibilidadePublica,
  remarcarAgendamentoPorToken,
  type AgendamentoPublico,
} from "../../actions";

type Vista = "carregando" | "detalhe" | "remarcar" | "cancelado" | "naoEncontrado";

export default function GestaoAgendamentoPage() {
  const params = useParams<{ slug: string; token: string }>();
  const slug = params?.slug ?? "";
  const token = params?.token ?? "";
  const toast = useToast();

  const [vista, setVista] = useState<Vista>("carregando");
  const [ag, setAg] = useState<AgendamentoPublico | null>(null);
  const [catalog, setCatalog] = useState<BookingCatalog | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Remarcação
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [ocupados, setOcupados] = useState<IntervaloOcupado[]>([]);

  const carregar = useCallback(async () => {
    const [dados, cat] = await Promise.all([carregarAgendamentoPorToken(slug, token), carregarCatalogoPorSlug(slug)]);
    if (!dados) {
      setVista("naoEncontrado");
      return;
    }
    setAg(dados);
    setCatalog(cat);
    setDia(dados.date);
    setVista(dados.status === "cancelado" ? "cancelado" : "detalhe");
  }, [slug, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Disponibilidade do dia escolhido na remarcação.
  useEffect(() => {
    if (vista !== "remarcar" || !ag || !dia) return;
    let vivo = true;
    void disponibilidadePublica(slug, ag.barbeiroId, dia).then((r) => {
      if (vivo) setOcupados(r);
    });
    return () => {
      vivo = false;
    };
  }, [vista, ag, dia, slug]);

  const hojeISO = hojeLocalISO();
  const bloqueio = ag ? podeGerenciar(ag, hojeISO, agoraHHMM()) : { ok: false as const };

  // Próximos 14 dias em que a barbearia abre.
  const dias = useMemo(() => {
    if (!catalog) return [];
    return Array.from({ length: 14 }, (_, i) => addDias(hojeISO, i)).filter(
      (d) => catalog.diasAtivos[indiceSegDom(d)] !== false,
    );
  }, [catalog, hojeISO]);

  const horarios = useMemo(() => (catalog ? gerarHorarios(catalog.abre, catalog.fecha) : []), [catalog]);
  const agoraMin = dia === hojeISO ? horaParaMin(agoraHHMM()) : -1;

  const slotLivre = useCallback(
    (h: string) => {
      if (!ag || !catalog) return false;
      const m = horaParaMin(h);
      if (m + ag.duracaoMin > horaParaMin(catalog.fecha)) return false;
      if (agoraMin >= 0 && m <= agoraMin) return false;
      return horarioLivre(ocupados, h, ag.duracaoMin);
    },
    [ag, catalog, ocupados, agoraMin],
  );

  useEffect(() => {
    if (vista !== "remarcar") return;
    setHora((atual) => (atual && slotLivre(atual) ? atual : (horarios.find(slotLivre) ?? "")));
  }, [vista, horarios, slotLivre]);

  async function cancelar() {
    if (!confirm("Cancelar este agendamento?")) return;
    setEnviando(true);
    const res = await cancelarAgendamentoPorToken(slug, token);
    setEnviando(false);
    if (res.ok) {
      setVista("cancelado");
      toast("Agendamento cancelado.");
    } else {
      toast(res.error ?? "Não foi possível cancelar.", "error");
    }
  }

  async function remarcar() {
    if (!hora) {
      toast("Escolha um horário.", "error");
      return;
    }
    setEnviando(true);
    const res = await remarcarAgendamentoPorToken(slug, token, { date: dia, inicio: hora });
    setEnviando(false);
    if (res.ok) {
      toast("Agendamento remarcado.");
      setVista("carregando");
      await carregar();
    } else {
      toast(res.error ?? "Não foi possível remarcar.", "error");
    }
  }

  return (
    <Moldura titulo={catalog?.nome ?? "Agendamento"}>
      {vista === "carregando" ? (
        <Centro texto="Carregando…" />
      ) : vista === "naoEncontrado" ? (
        <Centro
          titulo="Link inválido"
          texto="Não encontramos este agendamento. Confira o link que a barbearia enviou."
        />
      ) : vista === "cancelado" ? (
        <Centro titulo="Agendamento cancelado" texto="A vaga voltou para a agenda. Você pode agendar de novo quando quiser." />
      ) : vista === "remarcar" && ag && catalog ? (
        <div style={{ flex: 1, overflow: "auto", padding: "18px 20px" }}>
          <div style={secao}>Novo dia</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {dias.map((d) => {
              const on = d === dia;
              return (
                <button key={d} onClick={() => setDia(d)} style={chipDia(on)}>
                  <div style={{ fontSize: 10.5, opacity: 0.75 }}>{diaSemanaCurtoLabel(d)}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{isoParaDiaMes(d)}</div>
                </button>
              );
            })}
          </div>

          <div style={secao}>Novo horário</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {horarios.map((h) => {
              const livre = slotLivre(h);
              const on = h === hora;
              return (
                <button key={h} disabled={!livre} onClick={() => setHora(h)} style={chipHora(on, livre)}>
                  {h}
                </button>
              );
            })}
          </div>
          {!horarios.some(slotLivre) ? (
            <p style={{ fontSize: 12.5, color: c.ink3, marginTop: 12 }}>Sem horários livres neste dia. Tente outro.</p>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => setVista("detalhe")} style={btnSecundario}>Voltar</button>
            <button onClick={() => void remarcar()} disabled={enviando || !hora} style={btnPrimario(enviando || !hora)}>
              {enviando ? "Confirmando…" : "Confirmar novo horário"}
            </button>
          </div>
        </div>
      ) : ag ? (
        <div style={{ flex: 1, overflow: "auto", padding: "18px 20px" }}>
          <div style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: c.inkTitle }}>
            Olá, {ag.clienteNome.split(" ")[0]}
          </div>
          <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 4, lineHeight: 1.5 }}>Seu horário está confirmado.</p>

          <div style={cartao}>
            <Linha l="Serviço" v={`${ag.servico} · ${fmtDur(ag.duracaoMin)}`} />
            <Linha l="Profissional" v={ag.barbeiroNome} />
            <Linha l="Quando" v={`${diaSemanaCurtoLabel(ag.date)}, ${isoParaDiaMes(ag.date)} · ${ag.inicio}`} />
          </div>

          {bloqueio.ok ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <button onClick={() => setVista("remarcar")} style={btnPrimario(false)}>Remarcar</button>
              <button onClick={() => void cancelar()} disabled={enviando} style={btnCancelar}>
                {enviando ? "Cancelando…" : "Cancelar agendamento"}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: c.ink3, marginTop: 20, lineHeight: 1.5 }}>
              {bloqueio.motivo ? MENSAGEM_BLOQUEIO[bloqueio.motivo] : ""}
            </p>
          )}
        </div>
      ) : null}
    </Moldura>
  );
}

// ---- pedaços visuais (mesma moldura de celular do booking) ----

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: c.border, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "36px 20px" }}>
      <div style={{ width: 392, height: 812, background: c.espressoDeep, borderRadius: 46, padding: 11, boxShadow: shadow.phone }}>
        <div style={{ position: "relative", width: "100%", height: "100%", background: c.surfaceAlt, borderRadius: 36, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ background: c.espressoDeep, color: c.darkText, padding: "44px 22px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <Seal size={34} />
            <div style={{ fontFamily: font.cinzel, fontSize: 14, letterSpacing: 2 }}>{titulo.toUpperCase()}</div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Centro({ titulo, texto }: { titulo?: string; texto: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", textAlign: "center" }}>
      {titulo ? <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle }}>{titulo}</div> : null}
      <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 8, lineHeight: 1.5 }}>{texto}</p>
    </div>
  );
}

function Linha({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <span style={{ flex: "none", width: 96, fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>{l}</span>
      <span style={{ fontSize: 13.5, color: c.inkTitle, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

const secao = { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.ink3, fontWeight: 700, margin: "16px 0 10px" } as const;
const cartao = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16, marginTop: 18 } as const;

const chipDia = (on: boolean) =>
  ({
    flex: "none",
    minWidth: 62,
    padding: "8px 10px",
    borderRadius: 12,
    cursor: "pointer",
    textAlign: "center",
    background: on ? c.brassTint : c.surface,
    border: `1.5px solid ${on ? c.brass : c.border}`,
    color: c.inkTitle,
  }) as const;

const chipHora = (on: boolean, livre: boolean) =>
  ({
    padding: "10px 0",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: livre ? "pointer" : "not-allowed",
    background: on ? c.brassTint : c.surface,
    border: `1.5px solid ${on ? c.brass : c.border}`,
    color: livre ? c.inkTitle : c.ink3,
    opacity: livre ? 1 : 0.45,
  }) as const;

const btnPrimario = (off: boolean) =>
  ({
    flex: 1,
    border: "none",
    cursor: off ? "not-allowed" : "pointer",
    background: c.primaryBtnBg,
    color: c.primaryBtnText,
    padding: 14,
    borderRadius: 12,
    fontSize: 14.5,
    fontWeight: 700,
    opacity: off ? 0.5 : 1,
  }) as const;

const btnSecundario = {
  flex: "none",
  padding: "14px 18px",
  borderRadius: 12,
  border: `1px solid ${c.border}`,
  background: c.surface,
  color: c.ink2,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const btnCancelar = {
  width: "100%",
  padding: 13,
  borderRadius: 12,
  border: `1px solid ${c.border}`,
  background: c.surface,
  color: c.red,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
} as const;
