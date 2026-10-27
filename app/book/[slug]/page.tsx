"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { c } from "@/lib/theme";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { formatBRL, fmtDur } from "@/lib/selectors";
import { addDias, agoraHHMM, diaSemanaCurtoLabel, hojeLocalISO, indiceSegDom, isoParaDiaMes } from "@/lib/date";
import { carregarCatalogoPorSlug, type BookingCatalog } from "@/lib/firebase/booking";
import { horaParaMin, horarioLivre, type IntervaloOcupado } from "@/lib/agenda";
import { gerarHorarios } from "@/lib/disponibilidade";
import { criarAgendamentoPublico, disponibilidadePublica } from "./actions";

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em", color: c.inkTitle, margin: "22px 0 10px" };

type Step = "selecao" | "dados" | "sucesso";

export default function BookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params?.slug ?? "");
  const toast = useToast();

  const [catalog, setCatalog] = useState<BookingCatalog | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const [step, setStep] = useState<Step>("selecao");
  const [servicoId, setServicoId] = useState("");
  const [barbeiroId, setBarbeiroId] = useState("");
  const [dias, setDias] = useState<string[]>([]);
  const [dia, setDia] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [hora, setHora] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ocupados, setOcupados] = useState<IntervaloOcupado[]>([]);
  const [hojeISO, setHojeISO] = useState("");
  const [agoraMin, setAgoraMin] = useState(-1);

  // Carrega o catálogo do tenant (pós-mount, no cliente) — datas/horários reais.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const cat = await carregarCatalogoPorSlug(slug);
        if (!vivo) return;
        if (!cat) {
          setErro(true);
          setCarregando(false);
          return;
        }
        // Só dias em que a barbearia atende (config.horario.diasAtivos, Seg..Dom).
        const hojeIso = hojeLocalISO();
        const proximosDias: string[] = [];
        for (let i = 0; i < 28 && proximosDias.length < 6; i++) {
          const d = addDias(hojeIso, i);
          if (cat.diasAtivos[indiceSegDom(d)]) proximosDias.push(d);
        }
        const slots = gerarHorarios(cat.abre, cat.fecha);
        setCatalog(cat);
        setHojeISO(hojeIso);
        setAgoraMin(horaParaMin(agoraHHMM()));
        setServicoId(cat.servicos[0]?.id ?? "");
        setBarbeiroId(cat.barbeiros[0]?.id ?? "");
        setDias(proximosDias);
        setDia(proximosDias[0] ?? "");
        setHorarios(slots);
        setHora(slots[0] ?? "");
        setCarregando(false);
      } catch {
        if (vivo) {
          setErro(true);
          setCarregando(false);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [slug]);

  // Disponibilidade do barbeiro no dia escolhido — horários ocupados/bloqueados
  // ficam desabilitados (a recusa final é na server action, ao confirmar).
  useEffect(() => {
    if (!barbeiroId || !dia) return;
    let vivo = true;
    disponibilidadePublica(slug, barbeiroId, dia)
      .then((rows) => {
        if (vivo) setOcupados(rows);
      })
      .catch(() => {
        if (vivo) setOcupados([]);
      });
    return () => {
      vivo = false;
    };
  }, [slug, barbeiroId, dia]);

  const svc = catalog?.servicos.find((s) => s.id === servicoId) ?? null;
  const barb = catalog?.barbeiros.find((b) => b.id === barbeiroId) ?? null;
  const quando = dia ? `${isoParaDiaMes(dia)} · ${hora}` : "";

  // Um slot só é ofertável se: cabe antes do fechamento, não está no passado (hoje)
  // e não sobrepõe um intervalo ocupado/bloqueado do barbeiro.
  const dur = svc?.duracaoMin ?? 30;
  const fechaMin = catalog ? horaParaMin(catalog.fecha) : 24 * 60;
  const ehHojeSel = dia === hojeISO;
  function slotDisponivel(h: string): boolean {
    const m = horaParaMin(h);
    if (m + dur > fechaMin) return false; // não cabe antes de fechar
    if (ehHojeSel && agoraMin >= 0 && m < agoraMin) return false; // já passou
    return horarioLivre(ocupados, h, dur);
  }

  // Mantém um horário DISPONÍVEL selecionado quando disponibilidade/serviço/dia muda.
  useEffect(() => {
    if (!horarios.length) return;
    setHora((atual) => (atual && slotDisponivel(atual) ? atual : horarios.find(slotDisponivel) ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupados, horarios, servicoId, catalog, dia, hojeISO, agoraMin]);

  // Dia sem nenhum horário ofertável (lotado ou já passou): avisa e trava o "Continuar".
  const temSlotLivre = horarios.some(slotDisponivel);

  async function confirmar() {
    if (!nome.trim()) {
      toast("Informe seu nome.", "error");
      return;
    }
    setEnviando(true);
    const res = await criarAgendamentoPublico(slug, {
      barbeiroId,
      servicoId,
      date: dia,
      inicio: hora,
      clienteNome: nome.trim(),
      clienteTelefone: telefone.trim(),
    });
    setEnviando(false);
    if (res.ok) setStep("sucesso");
    else toast(res.error ?? "Não foi possível agendar.", "error");
  }

  function reset() {
    setStep("selecao");
    setNome("");
    setTelefone("");
  }

  const passo = step === "selecao" ? 1 : step === "dados" ? 2 : 3;

  return (
    <PhoneFrame title={(catalog?.nome ?? "Barbearia").toUpperCase()} subtitle={catalog?.endereco ?? ""}>
      {carregando ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: c.ink3, fontSize: 13 }}>Carregando…</div>
      ) : erro || !catalog ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", textAlign: "center", gap: 10 }}>
          <span style={{ width: 52, height: 52, borderRadius: "50%", background: c.surfaceAlt, color: c.ink3, display: "grid", placeItems: "center" }}>
            <Icon name="alerta" size={22} />
          </span>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.035em", color: c.inkTitle }}>Barbearia não encontrada</div>
          <p style={{ fontSize: 13.5, color: c.ink2, margin: 0, lineHeight: 1.5 }}>Confira o link de agendamento com a barbearia.</p>
        </div>
      ) : step === "sucesso" ? (
        /* Sucesso */
        <div className="oc-pop" style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 22px", textAlign: "center" }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: c.neon, color: c.onNeon, display: "grid", placeItems: "center", boxShadow: "0 0 0 10px rgba(183,255,24,.16), 0 14px 32px -10px rgba(140,200,0,.7)" }}>
            <Icon name="check" size={34} stroke={2.6} />
          </div>
          <h1 className="oc-h1" style={{ fontSize: 28, marginTop: 24 }}>
            Agendamento confirmado.
            <span>Até logo, {nome.split(" ")[0]}!</span>
          </h1>
          <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 10, lineHeight: 1.5 }}>Enviamos os detalhes por mensagem.</p>
          <div className="oc-card" style={{ width: "100%", padding: "8px 18px", marginTop: 20, textAlign: "left" }}>
            <Resumo l="Serviço" v={svc?.nome ?? ""} />
            <Resumo l="Profissional" v={barb?.nome ?? ""} />
            <Resumo l="Quando" v={quando} />
            <div style={{ display: "flex", alignItems: "center", padding: "12px 0 10px", borderTop: `1px solid ${c.borderSoft}`, marginTop: 4 }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: c.inkTitle }}>Total</span>
              <span className="num" style={{ fontSize: 17, fontWeight: 500, color: c.inkTitle }}>{svc ? formatBRL(svc.preco) : ""}</span>
            </div>
          </div>
          <Button variant="ghost" block onClick={reset} style={{ marginTop: 18, padding: "13px 18px" }}>
            Fazer novo agendamento
          </Button>
        </div>
      ) : (
        <>
          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 20px 18px" }}>
            {/* Passos */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {[1, 2].map((n) => (
                <span key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= passo ? c.accent : c.borderInput, transition: "background .3s" }} />
              ))}
            </div>
            <div className="oc-label" style={{ marginBottom: 4 }}>
              {step === "selecao" ? "Passo 1 de 2 · Escolha o horário" : "Passo 2 de 2 · Seus dados"}
            </div>

            {step === "selecao" ? (
              <>
                {/* Serviço */}
                <div style={sectionTitle}>Serviço</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {catalog.servicos.map((s) => {
                    const on = s.id === servicoId;
                    return (
                      <button key={s.id} onClick={() => setServicoId(s.id)} aria-pressed={on} className="oc-tile" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px" }}>
                        <span style={{ width: 36, height: 36, borderRadius: 12, background: on ? c.forest : c.surfaceAlt, color: on ? c.neon : c.ink3, display: "grid", placeItems: "center", flex: "none", transition: "background .15s" }}>
                          <Icon name="tesoura" size={17} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: c.inkTitle }}>{s.nome}</div>
                          <div style={{ fontSize: 12, color: c.ink3, marginTop: 2 }}>{fmtDur(s.duracaoMin)}</div>
                        </div>
                        <div className="num" style={{ fontSize: 14, fontWeight: 500, color: c.inkTitle }}>{formatBRL(s.preco)}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Profissional */}
                <div style={sectionTitle}>Profissional</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {catalog.barbeiros.map((b) => {
                    const on = b.id === barbeiroId;
                    return (
                      <button key={b.id} onClick={() => setBarbeiroId(b.id)} aria-pressed={on} className="oc-tile" style={{ flex: "1 1 30%", minWidth: 92, padding: "14px 8px", textAlign: "center" }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: on ? c.forest : c.surfaceAlt, color: on ? c.neon : c.ink, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, margin: "0 auto 8px", transition: "background .15s" }}>{b.iniciais}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: c.inkTitle }}>{b.nome}</div>
                        {b.rating || b.especialidade ? (
                          <div style={{ fontSize: 11, color: c.ink3, marginTop: 2 }}>{b.rating ? `★ ${b.rating}` : ""}{b.rating && b.especialidade ? " · " : ""}{b.especialidade ?? ""}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Data */}
                <div style={sectionTitle}>Data</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {dias.map((d) => {
                    const on = d === dia;
                    return (
                      <button
                        key={d}
                        onClick={() => setDia(d)}
                        aria-pressed={on}
                        style={{ flex: 1, background: on ? c.primaryBtnBg : c.surface, border: `1px solid ${on ? "transparent" : c.border}`, borderRadius: 16, padding: "10px 2px", textAlign: "center", cursor: "pointer", transition: "background .15s" }}
                      >
                        <div style={{ fontSize: 10.5, fontWeight: 500, textTransform: "capitalize", color: on ? "var(--oc-btn-icon)" : c.ink3 }}>{diaSemanaCurtoLabel(d)}</div>
                        <div className="num" style={{ fontSize: 17, fontWeight: 500, color: on ? c.primaryBtnText : c.inkTitle, marginTop: 3 }}>{Number(d.slice(8, 10))}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Horário */}
                <div style={sectionTitle}>Horário</div>
                {!temSlotLivre ? (
                  <div className="oc-card" style={{ padding: "16px 14px", textAlign: "center", fontSize: 13, color: c.ink2 }}>
                    Sem horários disponíveis neste dia. Escolha outra data.
                  </div>
                ) : null}
                <div style={{ display: temSlotLivre ? "grid" : "none", gridTemplateColumns: "repeat(4,1fr)", gap: 7 }}>
                  {horarios.map((h) => {
                    const on = h === hora;
                    const livre = slotDisponivel(h);
                    return (
                      <button
                        key={h}
                        onClick={() => livre && setHora(h)}
                        disabled={!livre}
                        aria-pressed={on}
                        title={livre ? undefined : "Horário indisponível"}
                        className="oc-tile num"
                        style={{ padding: "11px 2px", textAlign: "center", fontSize: 13.5, fontWeight: 500, borderRadius: 999, textDecoration: livre ? "none" : "line-through" }}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              /* dados */
              <>
                <div style={sectionTitle}>Seus dados</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={fieldLabel}>Nome completo</label>
                  <input className="oc-input" autoComplete="name" style={fieldInput} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar?" />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={fieldLabel}>Telefone (WhatsApp)</label>
                  <input className="oc-input" type="tel" autoComplete="tel" inputMode="tel" style={fieldInput} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
                </div>
                <div className="oc-card" style={{ padding: "8px 16px" }}>
                  <Resumo l="Serviço" v={svc?.nome ?? ""} />
                  <Resumo l="Profissional" v={barb?.nome ?? ""} />
                  <Resumo l="Quando" v={quando} />
                </div>
                <button onClick={() => setStep("selecao")} style={{ marginTop: 14, border: "none", background: "transparent", color: c.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: 0 }}>
                  <Icon name="setaEsq" size={14} /> Trocar horário
                </button>
              </>
            )}
          </div>

          {/* rodapé com o CTA neon */}
          <div className="oc-phone-foot">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: c.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{svc?.nome ?? ""} · {quando}</div>
              <div className="num" style={{ fontSize: 21, fontWeight: 500, color: c.inkTitle, marginTop: 2 }}>{svc ? formatBRL(svc.preco) : ""}</div>
            </div>
            {step === "selecao" ? (
              <Button variant="neon" onClick={() => hora && setStep("dados")} disabled={!hora}>
                Continuar <Icon name="seta" size={16} stroke={2.2} />
              </Button>
            ) : (
              <Button variant="neon" onClick={confirmar} disabled={enviando}>
                {enviando ? "Enviando…" : "Confirmar"}
                {!enviando ? <Icon name="check" size={16} stroke={2.4} /> : null}
              </Button>
            )}
          </div>
        </>
      )}
    </PhoneFrame>
  );
}

function Resumo({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0" }}>
      <span style={{ flex: 1, fontSize: 12.5, color: c.ink3 }}>{l}</span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: c.inkTitle, textAlign: "right" }}>{v}</span>
    </div>
  );
}
