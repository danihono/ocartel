"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Image from "next/image";
import { c } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { Seal } from "@/components/ui/Seal";
import { fieldInput, fieldLabel } from "@/components/ui/Field";
import { auth, db } from "@/lib/firebase/config";
import { signOutApp } from "@/lib/firebase/auth";
import { bootstrapTenant } from "@/lib/firebase/bootstrap";
import { useToast } from "@/components/ui/Toast";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mensagemErroAuth(e: unknown): string {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  switch (code) {
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou senha incorretos.";
    case "auth/email-already-in-use":
      return "Esse e-mail já tem uma conta. Tente entrar.";
    case "auth/weak-password":
      return "A senha precisa ter ao menos 6 caracteres.";
    default:
      return "Não foi possível concluir. Tente novamente.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<"entrar" | "criar">("entrar");
  const [carregando, setCarregando] = useState(false);

  // entrar
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  // criar (wizard)
  const [step, setStep] = useState(1);
  const [novaBarbearia, setNovaBarbearia] = useState("");

  async function esqueciSenha() {
    if (!email.trim()) {
      toast("Digite seu e-mail acima para enviarmos o link.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      /* não revela se a conta existe — mensagem genérica abaixo */
    }
    toast("Se houver uma conta com esse e-mail, enviamos um link de recuperação.", "info");
  }

  async function entrar() {
    if (!email.trim() || !senha.trim()) {
      toast("Preencha e-mail e senha.", "error");
      return;
    }
    setCarregando(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
      // superAdmin não tem tenant — mandá-lo pro /dashboard o expulsaria (guarda
      // "tenant"). Lê o role do perfil pra escolher o destino certo.
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const role = snap.exists() ? (snap.data() as { role?: string }).role : undefined;
      toast("Bem-vindo de volta.");
      const dest = role === "superAdmin" ? "/super-admin" : role === "barbeiro" ? "/barbeiro" : "/dashboard";
      router.push(dest);
    } catch (e) {
      toast(mensagemErroAuth(e), "error");
      setCarregando(false);
    }
  }

  /** Validação do passo 1 (conta): e-mail válido + senha forte o suficiente. */
  function validarPasso1(): boolean {
    if (!EMAIL_RE.test(email.trim())) {
      toast("Informe um e-mail válido.", "error");
      return false;
    }
    if (senha.length < 6) {
      toast("A senha precisa ter ao menos 6 caracteres.", "error");
      return false;
    }
    return true;
  }

  async function concluirOnboarding() {
    if (!validarPasso1()) {
      setStep(1);
      return;
    }
    if (novaBarbearia.trim().length < 2) {
      toast("Informe o nome da barbearia.", "error");
      return;
    }
    setCarregando(true);

    // Cria a conta — erros aqui são de credencial (e-mail em uso, senha fraca…).
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
    } catch (e) {
      toast(mensagemErroAuth(e), "error");
      setCarregando(false);
      return;
    }

    // Cria o tenant/catálogo. Se falhar, faz ROLLBACK da conta recém-criada para
    // não deixar um usuário órfão (sem barbearia) que não consegue nem refazer o onboarding.
    try {
      await bootstrapTenant({
        uid: cred.user.uid,
        email: email.trim(),
        // Sem campo de nome próprio no cadastro: o dono ajusta em Configurações.
        nome: email.trim().split("@")[0],
        barbeariaNome: novaBarbearia.trim(),
      });
      toast("Cadastro enviado. Assim que for aprovado, a barbearia libera.");
      // Vai para o painel de propósito: quem manda na espera é o próprio painel,
      // que mostra a tela de "aguardando aprovação" enquanto o status for pendente.
      // Assim o dono vê a mesma coisa se fechar e entrar de novo depois.
      router.push("/dashboard");
    } catch {
      try {
        await cred.user.delete();
      } catch {
        await signOutApp();
      }
      toast("Não foi possível configurar a barbearia. Nenhuma conta foi criada — tente novamente.", "error");
      setCarregando(false);
    }
  }

  return (
    <div className="oc-login">
      {/* Esquerda — marca: floresta "barber pole" com a navalha acesa */}
      <div className="oc-login-brand oc-card-hero" style={{ borderRadius: 0, border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <Seal size={44} />
          <div>
            <div className="oc-wordmark" style={{ fontSize: 17, color: "#FFFFFF" }}>O CARTEL</div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: c.darkMuted, marginTop: 3 }}>Clube de barbearia</div>
          </div>
        </div>

        <div className="oc-login-razor" aria-hidden>
          <span className="oc-login-glow" />
          <Image src="/marca/simbolo-quadrado.png" alt="" width={168} height={168} priority className="oc-breathe" style={{ borderRadius: 38, position: "relative" }} />
        </div>

        <div style={{ maxWidth: 420 }}>
          <span className="oc-eyebrow" style={{ background: "rgba(183,255,24,.08)", borderColor: "rgba(183,255,24,.22)", color: c.neon }}>
            <span className="oc-eyebrow-dot" style={{ background: c.neon, boxShadow: "0 0 0 3px rgba(183,255,24,.2)" }} />
            Gestão de barbearia
          </span>
          <h2 style={{ fontSize: "clamp(30px, 3.2vw, 42px)", lineHeight: 1.06, fontWeight: 500, letterSpacing: "-0.045em", color: "#FFFFFF", margin: "16px 0 0", textWrap: "balance" } as React.CSSProperties}>
            Para quem leva o ofício a sério.
            <span style={{ display: "block", color: "rgba(238,244,236,.42)" }}>Agenda, clientes e caixa num lugar só.</span>
          </h2>
        </div>
      </div>

      {/* Direita — formulário */}
      <div className="oc-login-form">
        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <ThemeSwitch />
        </div>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="oc-seg" role="tablist" style={{ display: "flex", marginBottom: 32 }}>
            {(["entrar", "criar"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ flex: 1, justifyContent: "center", padding: "9px 0", fontSize: 13.5 }}>
                {t === "entrar" ? "Entrar" : "Criar barbearia"}
              </button>
            ))}
          </div>

          {tab === "entrar" ? (
            <div className="oc-pop" key="entrar">
              <h1 className="oc-h1" style={{ fontSize: 32, marginBottom: 26 }}>
                Bem-vindo de volta.
                <span>Acesse o painel da sua barbearia.</span>
              </h1>
              <label style={fieldLabel}>E-mail</label>
              <input className="oc-input" type="email" autoComplete="email" style={{ ...fieldInput, marginBottom: 16 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
              <label style={fieldLabel}>Senha</label>
              <input className="oc-input" type="password" autoComplete="current-password" style={{ ...fieldInput, marginBottom: 10 }} value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void entrar(); }} />
              <div style={{ textAlign: "right", marginBottom: 22 }}>
                <button onClick={esqueciSenha} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: c.accent, fontWeight: 600 }}>
                  Esqueci minha senha
                </button>
              </div>
              <Button block onClick={entrar} disabled={carregando} style={{ padding: "13px 18px", fontSize: 14.5 }}>
                {carregando ? "Entrando…" : "Entrar no painel"}
                {!carregando ? <Icon name="seta" size={16} style={{ color: "var(--oc-btn-icon)" }} /> : null}
              </Button>
            </div>
          ) : (
            <div className="oc-pop" key="criar">
              <h1 className="oc-h1" style={{ fontSize: 32, marginBottom: 22 }}>
                Crie sua barbearia.
                <span>O cadastro passa por aprovação.</span>
              </h1>
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {[
                  { n: "1 · Conta" },
                  { n: "2 · Barbearia" },
                ].map((st, i) => {
                  const done = i + 1 <= step;
                  return (
                    <div key={st.n} style={{ flex: 1 }}>
                      <div style={{ height: 4, background: done ? c.accent : c.borderInput, borderRadius: 999, transition: "background .3s" }} />
                      <div style={{ fontSize: 11.5, color: done ? c.inkTitle : c.ink3, fontWeight: done ? 600 : 500, marginTop: 8 }}>{st.n}</div>
                    </div>
                  );
                })}
              </div>

              {step === 1 ? (
                <>
                  <label style={fieldLabel}>E-mail</label>
                  <input className="oc-input" type="email" autoComplete="email" style={{ ...fieldInput, marginBottom: 14 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                  <label style={fieldLabel}>Senha</label>
                  <input className="oc-input" type="password" autoComplete="new-password" style={{ ...fieldInput, marginBottom: 22 }} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Crie uma senha" />
                  <Button block onClick={() => { if (validarPasso1()) setStep(2); }} style={{ padding: "13px 18px", fontSize: 14.5 }}>
                    Continuar <Icon name="seta" size={16} style={{ color: "var(--oc-btn-icon)" }} />
                  </Button>
                </>
              ) : (
                <>
                  <label style={fieldLabel}>Nome da barbearia</label>
                  <input
                    className="oc-input"
                    style={{ ...fieldInput, marginBottom: 8 }}
                    value={novaBarbearia}
                    onChange={(e) => setNovaBarbearia(e.target.value)}
                    placeholder="Ex.: Barbearia Cartel"
                    autoFocus
                  />
                  <p style={{ fontSize: 12.5, color: c.ink3, margin: "0 0 22px", lineHeight: 1.5 }}>
                    É o nome que aparece para os seus clientes. Dá para mudar depois.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Button variant="ghost" icon="setaEsq" onClick={() => setStep(1)} style={{ padding: "13px 18px" }}>
                      Voltar
                    </Button>
                    <Button onClick={concluirOnboarding} disabled={carregando} style={{ flex: 1, padding: "13px 18px", fontSize: 14.5 }}>
                      {carregando ? "Enviando…" : "Enviar cadastro"}
                    </Button>
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
