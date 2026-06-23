"use client";

import { useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useStore, makeId } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";
import { barbeiroIdPorNome, duracaoServico } from "@/lib/selectors";
import { diaSemanaCurtoLabel } from "@/lib/date";
import { BARBEARIA, bookingBarbeiros, bookingDias, bookingHorarios, bookingServicos } from "@/lib/mock-data";

const sectionTitle: React.CSSProperties = { fontFamily: font.serif, fontSize: 16, fontWeight: 600, color: "#241B12", margin: "20px 0 10px" };

type Step = "selecao" | "dados" | "sucesso";

export default function BookingPage() {
  const { state, dispatch } = useStore();
  const toast = useToast();

  const [step, setStep] = useState<Step>("selecao");
  const [servico, setServico] = useState("Corte + Barba");
  const [barbeiro, setBarbeiro] = useState("Everton");
  const [dia, setDia] = useState("24");
  const [hora, setHora] = useState("11:00");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const svc = bookingServicos.find((s) => s.nome === servico);
  const diaLabel = diaSemanaCurtoLabel(`2026-06-${dia}`);

  function confirmar() {
    if (!nome.trim()) {
      toast("Informe seu nome.", "error");
      return;
    }
    dispatch({
      type: "ADD_AGENDAMENTO",
      agendamento: {
        id: makeId("ag"),
        date: `2026-06-${dia}`,
        barbeiroId: barbeiroIdPorNome(state, barbeiro),
        clienteNome: nome.trim(),
        servico,
        servicoId: state.servicos.find((s) => s.nome === servico)?.id,
        inicio: hora,
        duracaoMin: duracaoServico(state, servico),
        status: "agendado",
        origem: "booking",
      },
    });
    setStep("sucesso");
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
                <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 15, letterSpacing: 1.5, color: "#F2E6D2" }}>{state.config.nome.toUpperCase()}</div>
                <div style={{ fontSize: 11, color: c.darkMuted, marginTop: 2 }}>{BARBEARIA.endereco}</div>
              </div>
            </div>
          </div>

          {step === "sucesso" ? (
            /* Sucesso */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 26px", textAlign: "center" }}>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: c.brass, color: c.espressoDeep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>✓</div>
              <div style={{ fontFamily: font.serif, fontSize: 23, fontWeight: 600, color: "#241B12", marginTop: 18 }}>Agendamento confirmado</div>
              <p style={{ fontSize: 13.5, color: c.ink2, marginTop: 6, lineHeight: 1.5 }}>Enviamos os detalhes por mensagem. Até logo, {nome.split(" ")[0]}!</p>
              <div style={{ width: "100%", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 16, marginTop: 22, textAlign: "left" }}>
                <Resumo l="Serviço" v={servico} />
                <Resumo l="Profissional" v={barbeiro} />
                <Resumo l="Quando" v={`${diaLabel} ${dia} jun · ${hora}`} />
                <div style={{ display: "flex", alignItems: "center", marginTop: 10, paddingTop: 12, borderTop: `1px solid ${c.borderSoft}` }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#3E2C20" }}>Total</span>
                  <span style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#221A13" }}>{svc?.preco}</span>
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
                      {bookingServicos.map((s) => {
                        const on = s.nome === servico;
                        return (
                          <button
                            key={s.nome}
                            onClick={() => setServico(s.nome)}
                            style={{ display: "flex", alignItems: "center", gap: 10, background: on ? c.brassTint : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 12, padding: "13px 14px", cursor: "pointer", textAlign: "left" }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#241B12" }}>{s.nome}</div>
                              <div style={{ fontSize: 11.5, color: c.ink2, marginTop: 1 }}>{s.dur}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#3E2C20" }}>{s.preco}</div>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: c.brass, color: c.espressoDeep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, opacity: on ? 1 : 0 }}>✓</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Profissional */}
                    <div style={sectionTitle}>Profissional</div>
                    <div style={{ display: "flex", gap: 9 }}>
                      {bookingBarbeiros.map((b) => {
                        const on = b.nome === barbeiro;
                        return (
                          <button
                            key={b.nome}
                            onClick={() => setBarbeiro(b.nome)}
                            style={{ flex: 1, background: on ? c.brassTint : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 12, padding: "13px 8px", textAlign: "center", cursor: "pointer" }}
                          >
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.leather, color: "#E8DAC0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, margin: "0 auto 7px" }}>{b.iniciais}</div>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#241B12" }}>{b.nome}</div>
                            <div style={{ fontSize: 10.5, color: c.ink2, marginTop: 1 }}>★ {b.rating} · {b.especialidade}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Data */}
                    <div style={sectionTitle}>Data</div>
                    <div style={{ display: "flex", gap: 7 }}>
                      {bookingDias.map((d) => {
                        const on = d.num === dia;
                        return (
                          <button
                            key={d.num}
                            onClick={() => setDia(d.num)}
                            style={{ flex: 1, background: on ? c.brass : c.surface, border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`, borderRadius: 11, padding: "9px 4px", textAlign: "center", cursor: "pointer" }}
                          >
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: on ? "#5a4a2a" : c.ink3 }}>{diaSemanaCurtoLabel(`2026-06-${d.num}`)}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: on ? c.espressoDeep : "#3E2C20", marginTop: 2, fontFamily: font.serif }}>{d.num}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Horário */}
                    <div style={sectionTitle}>Horário</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                      {bookingHorarios.map((t) => {
                        const ocupado = t.estado === "ocupado";
                        const on = t.hora === hora && !ocupado;
                        return (
                          <button
                            key={t.hora}
                            disabled={ocupado}
                            onClick={() => setHora(t.hora)}
                            style={{
                              background: on ? c.brass : ocupado ? "#EFE7D9" : c.surface,
                              border: `1.5px solid ${on ? c.brass : "#E6DCCB"}`,
                              borderRadius: 10,
                              padding: "11px 4px",
                              textAlign: "center",
                              fontSize: 13,
                              fontWeight: on ? 700 : 500,
                              color: on ? c.espressoDeep : ocupado ? "#C2B6A2" : "#3E2C20",
                              cursor: ocupado ? "not-allowed" : "pointer",
                            }}
                          >
                            {t.hora}
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
                      <Resumo l="Serviço" v={servico} />
                      <Resumo l="Profissional" v={barbeiro} />
                      <Resumo l="Quando" v={`${diaLabel} ${dia} jun · ${hora}`} />
                    </div>
                  </>
                )}
              </div>

              {/* footer */}
              <div style={{ flex: "none", background: c.surface, borderTop: `1px solid ${c.border}`, padding: "14px 20px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: c.ink3, fontWeight: 600 }}>{servico} · {diaLabel} {dia}, {hora}</div>
                  <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: "#221A13" }}>{svc?.preco}</div>
                </div>
                {step === "selecao" ? (
                  <button onClick={() => setStep("dados")} style={{ border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: "14px 22px", borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}>Continuar</button>
                ) : (
                  <button onClick={confirmar} style={{ border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: "14px 22px", borderRadius: 12, fontSize: 14.5, fontWeight: 700 }}>Confirmar</button>
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
