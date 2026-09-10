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
import { c, font, shadow } from "@/lib/theme";
import { Seal } from "@/components/ui/Seal";
import { formatBRL } from "@/lib/selectors";
import { isoParaLabelLongo } from "@/lib/date";
import { carregarCartao, iniciarCadastroCartao, removerCartaoDoCliente, type DadosCartao } from "./actions";

type Fase = "carregando" | "pronto" | "erro";

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
    <div
      style={{
        minHeight: "100vh",
        background: c.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "28px 18px 40px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, justifyContent: "center", marginBottom: 22 }}>
          <Seal size={38} />
          <div
            style={{
              fontFamily: font.cinzel,
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: 2.5,
              color: c.inkTitle,
            }}
          >
            {dados?.barbearia?.toUpperCase() ?? "O CARTEL"}
          </div>
        </div>

        {fase === "carregando" ? (
          <div style={{ ...cartao, textAlign: "center", color: c.ink3, fontSize: 13.5 }}>Carregando…</div>
        ) : fase === "erro" ? (
          <div style={{ ...cartao, textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🤔</div>
            <div style={{ fontFamily: font.serif, fontSize: 20, fontWeight: 600, color: c.inkTitle, marginTop: 10 }}>
              Não deu certo
            </div>
            <p style={{ fontSize: 13.5, color: c.ink2, lineHeight: 1.55, marginTop: 8 }}>{erro}</p>
          </div>
        ) : dados?.cartao ? (
          /* ---- Já tem cartão salvo ---- */
          <div style={cartao}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                margin: "0 auto",
                background: c.brass,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              ✓
            </div>
            <div
              style={{
                fontFamily: font.serif,
                fontSize: 22,
                fontWeight: 600,
                color: c.inkTitle,
                marginTop: 14,
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
                fontWeight: 600,
                textDecoration: "underline",
              }}
            >
              {ocupado === "remover" ? "Removendo…" : "Remover meu cartão"}
            </button>
          </div>
        ) : (
          /* ---- Cadastro ---- */
          <div style={cartao}>
            <div style={{ fontFamily: font.serif, fontSize: 21, fontWeight: 600, color: c.inkTitle }}>
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
                    background: c.surfaceAlt,
                    border: `1px solid ${c.borderSoft}`,
                    borderRadius: 12,
                    padding: "13px 14px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={aceite}
                    onChange={(e) => setAceite(e.target.checked)}
                    style={{ marginTop: 2, width: 17, height: 17, flex: "none", accentColor: c.brass }}
                  />
                  <span style={{ fontSize: 12.5, color: c.ink2, lineHeight: 1.5 }}>{dados.textoAutorizacao}</span>
                </label>

                <button
                  onClick={cadastrar}
                  disabled={ocupado !== null || !aceite}
                  className="oc-btn oc-btn-primary"
                  style={{
                    width: "100%",
                    marginTop: 14,
                    border: "none",
                    cursor: ocupado || !aceite ? "default" : "pointer",
                    opacity: ocupado || !aceite ? 0.55 : 1,
                    background: c.primaryBtnBg,
                    color: c.primaryBtnText,
                    padding: 16,
                    borderRadius: 13,
                    fontSize: 15.5,
                    fontWeight: 700,
                  }}
                >
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
