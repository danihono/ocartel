"use client";

// Página que o cliente abre pelo link do WhatsApp. Um toque para confirmar a
// presença — e, discreto embaixo, avisar que não vai (o que cancela e libera a
// vaga na agenda).
//
// Diferente de /book e /barbeiro, aqui NÃO se usa o PhoneFrame: aquele é um
// mockup de largura fixa (392px), bom de ver no desktop e ruim num celular de
// verdade, que é exatamente onde esta página é aberta. Layout fluido.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { fmtDur } from "@/lib/selectors";
import { isoParaLabelLongo } from "@/lib/date";
import { STATUS_LABEL } from "@/lib/status";
import { carregarConfirmacao, responderConfirmacao, type Confirmacao, type Resposta } from "./actions";

type Fase = "carregando" | "pronto" | "confirmado" | "recusado" | "erro";

const cartao: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 16,
  padding: "22px 20px",
  boxShadow: shadow.card,
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: c.ink3, fontWeight: 600, width: 96, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 14, color: c.inkTitle, fontWeight: 600, flex: 1 }}>{valor}</span>
    </div>
  );
}

export default function ConfirmacaoPage() {
  const params = useParams<{ codigo: string }>();
  const codigo = String(params?.codigo ?? "");

  const [fase, setFase] = useState<Fase>("carregando");
  const [dados, setDados] = useState<Confirmacao | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await carregarConfirmacao(codigo);
      if (!vivo) return;
      if (!r.ok || !r.dados) {
        setErro(r.error ?? "Link inválido.");
        setFase("erro");
        return;
      }
      setDados(r.dados);
      // Já respondeu antes: abre direto no estado final, sem pedir de novo.
      if (r.dados.jaRespondeu && r.dados.status === "confirmado") setFase("confirmado");
      else if (r.dados.jaRespondeu && r.dados.status === "cancelado") setFase("recusado");
      else setFase("pronto");
    })();
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const responder = useCallback(
    async (resposta: Resposta) => {
      setEnviando(resposta);
      const r = await responderConfirmacao(codigo, resposta);
      setEnviando(null);
      if (!r.ok || !r.dados) {
        setErro(r.error ?? "Não foi possível registrar sua resposta.");
        setFase("erro");
        return;
      }
      setDados(r.dados);
      setFase(resposta === "confirmar" ? "confirmado" : "recusado");
    },
    [codigo],
  );

  const quando = dados ? `${isoParaLabelLongo(dados.dateISO)} · ${dados.inicio}` : "";
  const naoRespondivel =
    dados !== null && dados.status !== "agendado" && dados.status !== "confirmado";

  return (
    <div style={{ minHeight: "100vh", background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 18px 40px" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, justifyContent: "center", marginBottom: 22 }}>
          <Seal size={38} />
          <div style={{ fontFamily: font.cinzel, fontWeight: 600, fontSize: 15, letterSpacing: 2.5, color: c.inkTitle }}>
            {dados?.barbearia?.toUpperCase() ?? "O CARTEL"}
          </div>
        </div>

        {fase === "carregando" ? (
          <div style={{ ...cartao, textAlign: "center", color: c.ink3, fontSize: 13.5 }}>Carregando seu agendamento…</div>
        ) : fase === "erro" ? (
          <div style={{ ...cartao, textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🤔</div>
            <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle, marginTop: 10 }}>
              Não deu certo
            </div>
            <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, marginTop: 8 }}>{erro}</p>
          </div>
        ) : (
          <>
            {/* Resposta registrada */}
            {fase === "confirmado" || fase === "recusado" ? (
              <div style={{ ...cartao, textAlign: "center", marginBottom: 14 }}>
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    margin: "0 auto",
                    background: fase === "confirmado" ? c.brass : c.surfaceAlt,
                    color: fase === "confirmado" ? "#FFFFFF" : c.ink2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  {fase === "confirmado" ? "✓" : "✕"}
                </div>
                <div style={{ fontFamily: font.serif, fontSize: 22, fontWeight: 600, color: c.inkTitle, marginTop: 14 }}>
                  {fase === "confirmado" ? "Presença confirmada" : "Tudo bem, avisamos"}
                </div>
                <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, marginTop: 6 }}>
                  {fase === "confirmado"
                    ? "A barbearia já foi avisada. Te esperamos!"
                    : "O horário foi liberado. Quando quiser, é só chamar para remarcar."}
                </p>
              </div>
            ) : null}

            {/* Resumo do horário */}
            <div style={cartao}>
              {fase === "pronto" ? (
                <>
                  <div style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: c.inkTitle }}>
                    {dados?.cliente ? `Oi, ${dados.cliente.split(" ")[0]}!` : "Seu horário"}
                  </div>
                  <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, margin: "6px 0 4px" }}>
                    {naoRespondivel
                      ? "Este é o seu agendamento:"
                      : "Confirma que você vem? É só tocar no botão."}
                  </p>
                </>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <Linha rotulo="Quando" valor={quando} />
                <Linha rotulo="Serviço" valor={dados?.servico ?? ""} />
                {dados?.profissional ? <Linha rotulo="Profissional" valor={dados.profissional} /> : null}
                <Linha rotulo="Duração" valor={fmtDur(dados?.duracaoMin ?? 30)} />
              </div>

              {fase === "pronto" && !naoRespondivel ? (
                <>
                  <button
                    onClick={() => responder("confirmar")}
                    disabled={enviando !== null}
                    className="oc-btn oc-btn-primary"
                    style={{
                      width: "100%",
                      marginTop: 20,
                      border: "none",
                      cursor: enviando ? "default" : "pointer",
                      opacity: enviando ? 0.7 : 1,
                      background: c.primaryBtnBg,
                      color: c.primaryBtnText,
                      padding: 16,
                      borderRadius: 13,
                      fontSize: 15.5,
                      fontWeight: 700,
                    }}
                  >
                    {enviando === "confirmar" ? "Confirmando…" : "Confirmar presença"}
                  </button>
                  <button
                    onClick={() => responder("recusar")}
                    disabled={enviando !== null}
                    style={{
                      width: "100%",
                      marginTop: 10,
                      border: "none",
                      background: "transparent",
                      cursor: enviando ? "default" : "pointer",
                      color: c.ink3,
                      padding: 12,
                      fontSize: 13.5,
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                  >
                    {enviando === "recusar" ? "Avisando…" : "Não vou poder ir"}
                  </button>
                </>
              ) : null}

              {fase === "pronto" && naoRespondivel ? (
                <p style={{ fontSize: 13, color: c.ink3, lineHeight: 1.55, marginTop: 16 }}>
                  Situação: <strong style={{ color: c.inkTitle }}>{STATUS_LABEL[dados!.status]}</strong>. Fale com a
                  barbearia se precisar mudar alguma coisa.
                </p>
              ) : null}
            </div>
          </>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: c.ink4, marginTop: 20 }}>
          Agendamento gerenciado pelo O Cartel
        </div>
      </div>
    </div>
  );
}
