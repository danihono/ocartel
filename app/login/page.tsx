"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { c, font } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { useStore } from "@/lib/store";
import { useToast } from "@/components/ui/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { dispatch } = useStore();
  const toast = useToast();

  const [tab, setTab] = useState<"entrar" | "criar">("entrar");
  const [plano, setPlano] = useState<"Básico" | "Pro">("Pro");

  // entrar
  const [email, setEmail] = useState("marina@barbeariacartel.com.br");
  const [senha, setSenha] = useState("senhasegura");

  // criar (wizard)
  const [step, setStep] = useState(1);
  const [novaBarbearia, setNovaBarbearia] = useState("Barbearia Cartel");
  const [seuNome, setSeuNome] = useState("Marina Rocha");
  const [telefone, setTelefone] = useState("(11) 99000-1234");

  function entrar() {
    if (!email.trim() || !senha.trim()) {
      toast("Preencha e-mail e senha.", "error");
      return;
    }
    dispatch({ type: "LOGIN" });
    toast("Bem-vindo de volta.");
    router.push("/dashboard");
  }

  function entrarComGoogle() {
    dispatch({ type: "LOGIN" });
    toast("Conectado com Google.");
    router.push("/dashboard");
  }

  function concluirOnboarding() {
    dispatch({ type: "LOGIN", nome: seuNome.trim() || "Marina Rocha" });
    dispatch({ type: "UPDATE_CONFIG", patch: { nome: novaBarbearia.trim() || "Barbearia Cartel", telefone } });
    toast("Sua barbearia foi criada. Teste grátis iniciado!");
    router.push("/dashboard");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Left — brand */}
      <div style={{ flex: "0 0 44%", background: c.espressoDeep, color: "#E8DAC0", padding: "60px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden", boxShadow: "inset -40px 0 80px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Seal size={46} fontSize={16} />
          <div>
            <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: "#F2E6D2" }}>O CARTEL</div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#7C6B58", marginTop: 2 }}>Clube de barbearia</div>
          </div>
        </div>

        <div style={{ maxWidth: 380 }}>
          <div style={{ fontFamily: font.serif, fontSize: 38, lineHeight: 1.18, fontWeight: 500, color: "#F4EAD8", textWrap: "balance" } as React.CSSProperties}>
            Gestão de barbearia para quem leva o ofício a sério.
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#9A8771", marginTop: 20, maxWidth: 330 }}>
            Agenda, clientes, planos e financeiro num só lugar — com a discrição de um clube fechado.
          </p>
        </div>

        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6E5F50", marginBottom: 14 }}>Monograma · estudo</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Seal size={44} />
            <div style={{ width: 44, height: 44, transform: "rotate(45deg)", border: "1.4px solid #6E5F50", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ transform: "rotate(-45deg)", fontFamily: font.cinzel, fontWeight: 700, fontSize: 12, color: "#B6A488" }}>OC</span>
            </div>
            <div style={{ width: 40, height: 46, border: "1.4px solid #6E5F50", borderRadius: "6px 6px 18px 18px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontWeight: 700, fontSize: 15, color: "#B6A488" }}>C</div>
            <div style={{ width: 44, height: 44, border: "1.4px solid #6E5F50", outline: "1.4px solid #6E5F50", outlineOffset: 3, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.cinzel, fontWeight: 600, fontSize: 11, letterSpacing: 1, color: "#B6A488" }}>OC</div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div style={{ flex: 1, background: "#F7F2EA", display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <div style={{ width: "100%", maxWidth: 392 }}>
          <div style={{ display: "flex", background: "#EFE6D7", borderRadius: 11, padding: 4, marginBottom: 28 }}>
            {(["entrar", "criar"] as const).map((t) => {
              const on = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ flex: 1, border: "none", cursor: "pointer", padding: 9, borderRadius: 8, fontSize: 13.5, fontWeight: 600, background: on ? c.surface : "transparent", color: on ? "#241B12" : c.ink3, boxShadow: on ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}
                >
                  {t === "entrar" ? "Entrar" : "Criar barbearia"}
                </button>
              );
            })}
          </div>

          {tab === "entrar" ? (
            <div>
              <h1 style={{ fontFamily: font.serif, fontSize: 27, fontWeight: 600, margin: "0 0 4px", color: "#241B12" }}>Bem-vindo de volta</h1>
              <p style={{ fontSize: 13.5, color: c.ink2, margin: "0 0 26px" }}>Acesse o painel da sua barbearia.</p>
              <label style={fieldLabel}>E-mail</label>
              <input style={{ ...fieldInput, marginBottom: 16 }} value={email} onChange={(e) => setEmail(e.target.value)} />
              <label style={fieldLabel}>Senha</label>
              <input type="password" style={{ ...fieldInput, marginBottom: 10 }} value={senha} onChange={(e) => setSenha(e.target.value)} />
              <div style={{ textAlign: "right", marginBottom: 22 }}>
                <button onClick={() => toast("Enviamos um link de recuperação para seu e-mail.", "info")} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: c.brassDeep, fontWeight: 600 }}>
                  Esqueci minha senha
                </button>
              </div>
              <button onClick={entrar} style={{ width: "100%", border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700 }}>Entrar no painel</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0", color: "#B6A78F", fontSize: 11.5 }}>
                <div style={{ flex: 1, height: 1, background: c.borderInput }} />ou<div style={{ flex: 1, height: 1, background: c.borderInput }} />
              </div>
              <button onClick={entrarComGoogle} style={{ width: "100%", border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: "#3E2C20", padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 600 }}>Continuar com Google</button>
            </div>
          ) : (
            <div>
              <h1 style={{ fontFamily: font.serif, fontSize: 27, fontWeight: 600, margin: "0 0 4px", color: "#241B12" }}>Crie sua barbearia</h1>
              <p style={{ fontSize: 13.5, color: c.ink2, margin: "0 0 22px" }}>14 dias grátis. Sem cartão.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {[
                  { n: "1 · Conta" },
                  { n: "2 · Barbearia" },
                  { n: "3 · Plano" },
                ].map((s, i) => {
                  const done = i + 1 <= step;
                  return (
                    <div key={s.n} style={{ flex: 1 }}>
                      <div style={{ height: 4, background: done ? c.brass : c.borderInput, borderRadius: 2 }} />
                      <div style={{ fontSize: 11, color: done ? "#3E2C20" : "#A89880", fontWeight: done ? 700 : 600, marginTop: 7 }}>{s.n}</div>
                    </div>
                  );
                })}
              </div>

              {step === 1 ? (
                <>
                  <label style={fieldLabel}>E-mail</label>
                  <input style={{ ...fieldInput, marginBottom: 14 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                  <label style={fieldLabel}>Senha</label>
                  <input type="password" style={{ ...fieldInput, marginBottom: 22 }} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Crie uma senha" />
                  <button onClick={() => setStep(2)} style={{ width: "100%", border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700 }}>Continuar</button>
                </>
              ) : step === 2 ? (
                <>
                  <label style={fieldLabel}>Nome da barbearia</label>
                  <input style={{ ...fieldInput, marginBottom: 14 }} value={novaBarbearia} onChange={(e) => setNovaBarbearia(e.target.value)} />
                  <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
                    <div style={{ flex: 1 }}>
                      <label style={fieldLabel}>Seu nome</label>
                      <input style={fieldInput} value={seuNome} onChange={(e) => setSeuNome(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={fieldLabel}>Telefone</label>
                      <input style={fieldInput} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setStep(1)} style={{ flex: "0 0 auto", border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: "#3E2C20", padding: "14px 20px", borderRadius: 11, fontSize: 14, fontWeight: 600 }}>Voltar</button>
                    <button onClick={() => setStep(3)} style={{ flex: 1, border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700 }}>Continuar</button>
                  </div>
                </>
              ) : (
                <>
                  <label style={fieldLabel}>Escolha o plano</label>
                  <div style={{ display: "flex", gap: 12, marginBottom: 22, marginTop: 6 }}>
                    {([
                      { id: "Básico", preco: "R$ 129", desc: "1 unidade · até 3 barbeiros" },
                      { id: "Pro", preco: "R$ 249", desc: "Multi-unidade · ilimitado" },
                    ] as const).map((p) => {
                      const on = plano === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setPlano(p.id)}
                          style={{ flex: 1, textAlign: "left", cursor: "pointer", background: on ? c.brassTint : c.surface, border: `1.5px solid ${on ? c.brass : c.borderInput}`, borderRadius: 12, padding: "13px 14px" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#241B12" }}>{p.id}</span>
                            <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${on ? c.brass : c.borderInput}`, background: on ? c.brass : "transparent" }} />
                          </div>
                          <div style={{ fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: "#221A13", marginTop: 4 }}>{p.preco}<span style={{ fontSize: 11, fontFamily: font.sans, color: c.ink3, fontWeight: 500 }}>/mês</span></div>
                          <div style={{ fontSize: 11, color: c.ink2, marginTop: 4 }}>{p.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setStep(2)} style={{ flex: "0 0 auto", border: `1px solid ${c.borderInput}`, cursor: "pointer", background: c.surface, color: "#3E2C20", padding: "14px 20px", borderRadius: 11, fontSize: 14, fontWeight: 600 }}>Voltar</button>
                    <button onClick={concluirOnboarding} style={{ flex: 1, border: "none", cursor: "pointer", background: "#241711", color: "#F4EAD8", padding: 14, borderRadius: 11, fontSize: 14.5, fontWeight: 700 }}>Começar teste grátis</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
