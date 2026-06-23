"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { formatBRL, fmtDur } from "@/lib/selectors";
import { addDias, diaSemanaCurtoLabel, hojeLocalISO, isoParaDiaMes } from "@/lib/date";
import { carregarCatalogoPorSlug, type BookingCatalog } from "@/lib/firebase/booking";
import { criarAgendamentoPublico } from "./actions";

const sectionTitle: React.CSSProperties = { fontFamily: font.serif, fontSize: 16, fontWeight: 600, color: "#241B12", margin: "20px 0 10px" };

type Step = "selecao" | "dados" | "sucesso";

function gerarHorarios(abre: string, fecha: string): string[] {
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const ini = min(abre);
  const fim = min(fecha);
  const out: string[] = [];
  for (let t = ini; t < fim; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

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
        const proximosDias = Array.from({ length: 6 }, (_, i) => addDias(hojeLocalISO(), i));
        const slots = gerarHorarios(cat.abre, cat.fecha);
        setCatalog(cat);
        setServicoId(cat.servicos[0]?.id ?? "");
        setBarbeiroId(cat.barbeiros[0]?.id ?? "");
        setDias(proximosDias);
        setDia(proximosDias[0]);
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

  const svc = catalog?.servicos.find((s) => s.id === servicoId) ?? null;
  const barb = catalog?.barbeiros.find((b) => b.id === barbeiroId) ?? null;
  const quando = dia ? `${isoParaDiaMes(dia)} · ${hora}` : "";

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

  const eyebrowTxt =
    step === "selecao" ? "Passo 2 de 3 · Agende seu horário" : step === "dados" ? "Passo 3 de 3 · Seus dados" : "Confirmado";

  return (
    <div style={{ minHeight: "100vh", background: "#E7DFD2", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "36px 20px" }}>
      <div style={{ width: 392, height: 812, background: c.espressoDeep, borderRadius: 46, padding: 11, boxShadow: shadow.phone }}>
        <div style={{ position: "relative", width: "100%", height: "100%", background: c.surfaceAlt, borderRadius: 36, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* status bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", zIndex: 5, color: "#E8DAC0", fontSize: 12, fontWeight: 600 }}>
            <span>9:41</span>
            <div style={{ width: 120, height: 26, background: c.espressoDeep, borderRadius: "0 0 16px 16px", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 0 }} />
            <span>● ● ●</span>
          </div>

          {/* header */}
          <div style={{ background: c.espressoDeep, color: "#E8DAC0", padding: "46px 22px 20px", flex: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Seal size={42} />
              <div>
                <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 15, letterSpacing: 1.5, color: "#F2E6D2" }}>{(catalog?.nome ?? "Barbearia").toUpperCase()}</div>
                <div style={{ fontSize: 11, color: c.darkMuted, marginTop: 2 }}>{catalog?.endereco ?? ""}</div>
              </div>
            </div>
          </div>

          {carregando ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: c.ink3, fontSize: 13 }}>Carregando…</div>
          ) : erro || !catalog ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", textAlign: "center" }}>
              <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: "#241B12" }}>Barbearia não encontrada</div>
              <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 8, lineHeight: 1.5 }}>Confira o link de agendamento com a barbearia.</p>
            </div>
          ) : step === "sucesso" ? (
            /* Sucesso */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 26px", textAlign: "center" }}>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: c.brass, color: c.espressoDeep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>✓</div>
              <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: "#241B12", marginTop: 18 }}>Agendamento confirmado</div>
              <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 6, lineHeight: 1.5 }}>Enviamos os detalhes por mensagem. Até logo, {nome.split(" ")[0]}!</p>
              <div style={{ width: "100%", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16, marginTop: 22, textAlign: "left" }}>
                <Resumo l="Serviço" v={svc?.nome ?? ""} />
                <Resumo l="Profissional" v={barb?.nome ?? ""} />
                <Resumo l="Quando" v={quando} />
                <div style={{ display: "flex", alignItems: "center", marginTop: 10, paddingTop: 12, borderTop: `1px solid ${c.borderSoft}` }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#3E2C20" }}>Total</span>
                  <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#221A13" }}>{svc ? formatBRL(svc.preco) : ""}</span>
                </div>
              </div>
              <button onClick={reset} style={{ marginTop: 20, width: "100%", border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: 14, borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}>Fazer novo agendamento</button>
            </div>
          ) : (
            <>
              {/* body */}
              <div style={{ flex: 1, overflow: "auto", padding: "18px 20px 16px" }}>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: c.ink3, fontWeight: 700, marginBottom: 14 }}>
                  {eyebrowTxt}
                </div>

                {step === "selecao" ? (
                  <>
                    {/* Serviço */}
                    <div style={{ ...sectionTitle, marginTop: 0 }}>Serviço</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {catalog.servicos.map((s) => {
                        const on = s.id === servicoId;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setServicoId(s.id)}
                            style={{ display: "flex", alignItems: "center", gap: 10, background: on ? c.brassTint : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#241B12" }}>{s.nome}</div>
                              <div style={{ fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{fmtDur(s.duracaoMin)}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#3E2C20" }}>{formatBRL(s.preco)}</div>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: c.brass, color: c.espressoDeep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, opacity: on ? 1 : 0 }}>✓</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Profissional */}
                    <div style={sectionTitle}>Profissional</div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                      {catalog.barbeiros.map((b) => {
                        const on = b.id === barbeiroId;
                        return (
                          <button
                            key={b.id}
                            onClick={() => setBarbeiroId(b.id)}
                            style={{ flex: "1 1 30%", minWidth: 88, background: on ? c.brassTint : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 12, padding: "13px 8px", textAlign: "center", cursor: "pointer" }}
                          >
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.leather, color: "#E8DAC0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, margin: "0 auto 7px" }}>{b.iniciais}</div>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#241B12" }}>{b.nome}</div>
                            {b.rating || b.especialidade ? (
                              <div style={{ fontSize: 10.5, color: c.ink2, marginTop: 1 }}>{b.rating ? `★ ${b.rating}` : ""}{b.rating && b.especialidade ? " · " : ""}{b.especialidade ?? ""}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {/* Data */}
                    <div style={sectionTitle}>Data</div>
                    <div style={{ display: "flex", gap: 7 }}>
                      {dias.map((d) => {
                        const on = d === dia;
                        return (
                          <button
                            key={d}
                            onClick={() => setDia(d)}
                            style={{ flex: 1, background: on ? c.brass : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 11, padding: "9px 4px", textAlign: "center", cursor: "pointer" }}
                          >
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: on ? "#5a4a2a" : c.ink3 }}>{diaSemanaCurtoLabel(d)}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: on ? c.espressoDeep : "#3E2C20", marginTop: 2, fontFamily: font.serif }}>{Number(d.slice(8, 10))}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Horário */}
                    <div style={sectionTitle}>Horário</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                      {horarios.map((h) => {
                        const on = h === hora;
                        return (
                          <button
                            key={h}
                            onClick={() => setHora(h)}
                            style={{
                              background: on ? c.brass : c.surface,
                              border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`,
                              borderRadius: 10,
                              padding: "11px 4px",
                              textAlign: "center",
                              fontSize: 13,
                              fontWeight: on ? 700 : 500,
                              color: on ? c.espressoDeep : "#3E2C20",
                              cursor: "pointer",
                            }}
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
                    <div style={{ ...sectionTitle, marginTop: 0 }}>Seus dados</div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={fieldLabel}>Nome completo</label>
                      <input style={fieldInput} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar?" />
                    </div>
                    <div style={{ marginBottom: 18 }}>
                      <label style={fieldLabel}>Telefone (WhatsApp)</label>
                      <input style={fieldInput} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 90000-0000" />
                    </div>
                    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 14 }}>
                      <Resumo l="Serviço" v={svc?.nome ?? ""} />
                      <Resumo l="Profissional" v={barb?.nome ?? ""} />
                      <Resumo l="Quando" v={quando} />
                    </div>
                  </>
                )}
              </div>

              {/* footer */}
              <div style={{ flex: "none", background: c.surface, borderTop: `1px solid ${c.border}`, padding: "14px 20px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>{svc?.nome ?? ""} · {quando}</div>
                  <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: "#221A13" }}>{svc ? formatBRL(svc.preco) : ""}</div>
                </div>
                {step === "selecao" ? (
                  <button onClick={() => setStep("dados")} style={{ border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: "14px 22px", borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}>Continuar</button>
                ) : (
                  <button onClick={confirmar} disabled={enviando} style={{ border: "none", cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.7 : 1, background: "#241711", color: "#F4EAD8", padding: "14px 22px", borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}>{enviando ? "Enviando…" : "Confirmar"}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Resumo({ l, v }: { l: string; v: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "5px 0" }}>
      <span style={{ flex: 1, fontSize: 12.5, color: c.ink3, fontWeight: 600 }}>{l}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#241B12" }}>{v}</span>
    </div>
  );
}
