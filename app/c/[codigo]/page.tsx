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
import { c, shadow } from "@/lib/theme";
import { Icon } from "@/components/ui/Icon";
import { Seal } from "@/components/ui/Seal";
import { fmtDur } from "@/lib/selectors";
import { isoParaLabelLongo } from "@/lib/date";
import { STATUS_LABEL } from "@/lib/status";
import { carregarConfirmacao, responderConfirmacao, type Confirmacao, type Resposta } from "./actions";

type Fase = "carregando" | "pronto" | "confirmado" | "recusado" | "erro";

const cartao: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.borderSoft}`,
  borderRadius: 24,
  padding: "24px 22px",
  boxShadow: shadow.card,
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: `1px solid ${c.borderSoft}` }}>
      <span style={{ fontSize: 12.5, color: c.ink3, width: 96, flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: 14, color: c.inkTitle, fontWeight: 500, flex: 1 }}>{valor}</span>
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
    <div className="oc-public-bg" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 16px 40px" }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Marca: faixa floresta "barber pole" */}
        <div className="oc-card-hero" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 24, marginBottom: 14 }}>
          <Seal size={40} />
          <div style={{ minWidth: 0 }}>
            <div className="oc-wordmark" style={{ fontSize: 14.5, letterSpacing: "0.12em", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {dados?.barbearia?.toUpperCase() ?? "O CARTEL"}
            </div>
            <div style={{ fontSize: 11.5, color: c.darkMuted, marginTop: 2 }}>Confirmação de horário</div>
          </div>
        </div>

        {fase === "carregando" ? (
          <div style={{ ...cartao, textAlign: "center", color: c.ink3, fontSize: 13.5 }}>Carregando seu agendamento…</div>
        ) : fase === "erro" ? (
          <div style={{ ...cartao, textAlign: "center" }}>
            <span style={{ width: 56, height: 56, borderRadius: "50%", background: c.surfaceAlt, color: c.ink3, display: "inline-grid", placeItems: "center" }}>
              <Icon name="alerta" size={24} />
            </span>
            <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.035em", color: c.inkTitle, marginTop: 10 }}>
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
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    margin: "6px auto 0",
                    background: fase === "confirmado" ? c.neon : c.surfaceAlt,
                    color: fase === "confirmado" ? c.onNeon : c.ink2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: fase === "confirmado" ? "0 0 0 10px rgba(183,255,24,.16), 0 14px 30px -10px rgba(140,200,0,.7)" : "none",
                  }}
                >
                  <Icon name={fase === "confirmado" ? "check" : "fechar"} size={32} stroke={2.6} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.04em", color: c.inkTitle, marginTop: 20 }}>
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
                  <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.04em", color: c.inkTitle, lineHeight: 1.1 }}>
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
                    className="oc-btn oc-btn-neon oc-btn-block"
                    style={{ marginTop: 22, padding: 16, fontSize: 15.5 }}
                  >
                    {enviando === "confirmar" ? "Confirmando…" : "Confirmar presença"}
                    {enviando !== "confirmar" ? <Icon name="check" size={18} stroke={2.4} /> : null}
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
                      fontWeight: 500,
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
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
