"use client";

// Página que o cliente abre pelo link do WhatsApp para cadastrar, ver ou remover o cartão
// que paga a mensalidade dele.
//
// Layout fluido, sem PhoneFrame — mesma escolha de /c/[codigo], e pelo mesmo motivo: esta
// página é aberta no celular de verdade.
//
// O CARTÃO NÃO É DIGITADO AQUI. Esta tela explica a assinatura, colhe a autorização e
// manda para a página hospedada do Asaas, que é quem recebe o número. É a diferença entre
// preencher um questionário PCI de uma página e precisar de certificação SAQ-D.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { c, shadow } from "@/lib/theme";
import { Icon } from "@/components/ui/Icon";
import { Seal } from "@/components/ui/Seal";
import { formatBRL } from "@/lib/selectors";
import { isoParaLabelLongo } from "@/lib/date";
import { carregarCartao, iniciarCadastroCartao, removerCartaoDoCliente, type DadosCartao } from "./actions";

type Fase = "carregando" | "pronto" | "erro";

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

export default function CartaoPage() {
  const params = useParams<{ codigo: string }>();
  const codigo = String(params?.codigo ?? "");

  const [fase, setFase] = useState<Fase>("carregando");
  const [dados, setDados] = useState<DadosCartao | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aceite, setAceite] = useState(false);
  const [ocupado, setOcupado] = useState<"cadastrar" | "remover" | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await carregarCartao(codigo);
      if (!vivo) return;
      if (!r.ok || !r.dados) {
        setErro(r.error ?? "Link inválido.");
        setFase("erro");
        return;
      }
      setDados(r.dados);
      setFase("pronto");
    })();
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const cadastrar = useCallback(async () => {
    setAviso("");
    setOcupado("cadastrar");
    const r = await iniciarCadastroCartao(codigo, aceite);
    if (!r.ok || !r.url) {
      setOcupado(null);
      setAviso(r.error ?? "Não foi possível abrir o cadastro.");
      return;
    }
    // Sai daqui para a página do Asaas. `ocupado` fica ligado de propósito: a navegação
    // leva um instante, e um botão que volta a "clicável" convida a um segundo clique —
    // que seria uma segunda cobrança.
    window.location.href = r.url;
  }, [codigo, aceite]);

  const remover = useCallback(async () => {
    setAviso("");
    setOcupado("remover");
    const r = await removerCartaoDoCliente(codigo);
    setOcupado(null);
    if (!r.ok || !r.dados) {
      setAviso(r.error ?? "Não foi possível remover o cartão.");
      return;
    }
    setDados(r.dados);
    setAceite(false);
    setAviso("Cartão removido. Suas próximas mensalidades voltam a ser cobradas como antes.");
  }, [codigo]);

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
            <div style={{ fontSize: 11.5, color: c.darkMuted, marginTop: 2 }}>Mensalidade no cartão</div>
          </div>
        </div>

        {fase === "carregando" ? (
          <div style={{ ...cartao, textAlign: "center", color: c.ink3, fontSize: 13.5 }}>Carregando…</div>
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
        ) : dados?.cartao ? (
          /* ---- Já tem cartão salvo ---- */
          <div style={cartao}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                margin: "6px auto 0",
                background: c.neon,
                color: c.onNeon,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 0 10px rgba(183,255,24,.16), 0 14px 30px -10px rgba(140,200,0,.7)",
              }}
            >
              <Icon name="check" size={32} stroke={2.6} />
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 500,
                letterSpacing: "-0.04em",
                color: c.inkTitle,
                marginTop: 20,
                textAlign: "center",
              }}
            >
              Cartão cadastrado
            </div>
            <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, marginTop: 6, textAlign: "center" }}>
              Sua mensalidade é cobrada automaticamente todo dia {dados.diaVencimento}. Você recebe um aviso no
              WhatsApp a cada cobrança.
            </p>

            <div style={{ marginTop: 14 }}>
              <Linha rotulo="Cartão" valor={`${dados.cartao.bandeira} ••${dados.cartao.ultimosDigitos}`} />
              <Linha rotulo="Plano" valor={dados.plano} />
              <Linha rotulo="Valor" valor={formatBRL(dados.valor)} />
              <Linha rotulo="Cobrança" valor={`todo dia ${dados.diaVencimento}`} />
            </div>

            {aviso ? (
              <p style={{ fontSize: 13, color: c.ink2, lineHeight: 1.55, marginTop: 14 }}>{aviso}</p>
            ) : null}

            <button
              onClick={remover}
              disabled={ocupado !== null}
              style={{
                width: "100%",
                marginTop: 18,
                border: "none",
                background: "transparent",
                cursor: ocupado ? "default" : "pointer",
                color: c.ink3,
                padding: 12,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {ocupado === "remover" ? "Removendo…" : "Remover meu cartão"}
            </button>
          </div>
        ) : (
          /* ---- Cadastro ---- */
          <div style={cartao}>
            <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.04em", color: c.inkTitle, lineHeight: 1.1 }}>
              {dados?.cliente ? `Oi, ${dados.cliente.split(" ")[0]}!` : "Sua mensalidade"}
            </div>
            <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, margin: "6px 0 4px" }}>
              {aviso
                ? aviso
                : "Deixe sua mensalidade no cartão e não precise pagar boleto todo mês. A cobrança acontece sozinha, sempre no mesmo dia."}
            </p>

            <div style={{ marginTop: 10 }}>
              <Linha rotulo="Plano" valor={dados?.plano ?? ""} />
              <Linha rotulo="Valor" valor={formatBRL(dados?.valor ?? 0)} />
              <Linha rotulo="Cobrança" valor={`todo dia ${dados?.diaVencimento ?? ""}`} />
              {dados?.mensalidadeAberta ? (
                <Linha
                  rotulo="Em aberto"
                  valor={`${formatBRL(dados.mensalidadeAberta.valor)} · venceu ${isoParaLabelLongo(dados.mensalidadeAberta.vencimentoISO)}`}
                />
              ) : null}
            </div>

            {dados?.mensalidadeAberta ? (
              <>
                {/*
                  O aceite é obrigatório e o texto é o MESMO que fica gravado como prova.
                  A página do Asaas cobra aquela fatura e não pergunta nada sobre as
                  próximas — quem recorre somos nós, então é aqui que a pessoa autoriza.
                */}
                <label
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    marginTop: 18,
                    cursor: "pointer",
                    background: c.field,
                    border: `1px solid ${c.borderSoft}`,
                    borderRadius: 16,
                    padding: "14px 15px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={aceite}
                    onChange={(e) => setAceite(e.target.checked)}
                    style={{ marginTop: 2, width: 17, height: 17, flex: "none" }}
                  />
                  <span style={{ fontSize: 12.5, color: c.ink2, lineHeight: 1.5 }}>{dados.textoAutorizacao}</span>
                </label>

                <button
                  onClick={cadastrar}
                  disabled={ocupado !== null || !aceite}
                  className="oc-btn oc-btn-neon oc-btn-block"
                  style={{ marginTop: 16, padding: 16, fontSize: 15.5 }}
                >
                  {ocupado !== "cadastrar" ? <Icon name="cartao" size={18} /> : null}
                  {ocupado === "cadastrar" ? "Abrindo…" : "Cadastrar cartão"}
                </button>

                <p style={{ fontSize: 11.5, color: c.ink4, lineHeight: 1.5, marginTop: 12, textAlign: "center" }}>
                  Os dados do cartão são digitados na página segura do Asaas, o processador de pagamentos da
                  barbearia. O O Cartel não recebe nem guarda o número do seu cartão.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: c.ink3, lineHeight: 1.55, marginTop: 16 }}>
                Sua mensalidade deste mês já está paga. O cartão pode ser cadastrado na próxima cobrança — a gente
                te avisa por aqui.
              </p>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: c.ink4, marginTop: 20 }}>
          Mensalidade gerenciada pelo O Cartel
        </div>
      </div>
    </div>
  );
}
