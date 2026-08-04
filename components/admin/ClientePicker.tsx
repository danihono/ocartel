"use client";

// Seletor de cliente no estilo do sistema — substitui o <datalist> nativo, que
// abria uma lista do navegador (preta, gigante, sem estilo) com todos os nomes.
// Aqui a lista é nossa: avatar, telefone e marcador, no mesmo vocabulário visual
// dos cards da tela de agendamento público.
//
// Devolve o `id` do cadastro junto com o nome — antes o vínculo era por string
// exata, e um espaço a mais criava agendamento órfão.

import { useEffect, useMemo, useRef, useState } from "react";
import { c, font, shadow } from "@/lib/theme";
import { fieldInput } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Seal";
import { useStore } from "@/lib/store";
import { selectClientesFiltrados, tagDerivadaCliente } from "@/lib/selectors";
import { tagMeta } from "@/lib/status";
import { useHoje } from "@/lib/useRelogio";

export interface ClienteEscolhido {
  nome: string;
  id?: string;
}

const MAX_SUGESTOES = 8;

export function ClientePicker({
  valor,
  onChange,
  placeholder = "Nome do cliente",
  autoFocus,
}: {
  valor: ClienteEscolhido;
  onChange: (escolhido: ClienteEscolhido) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { state } = useStore();
  const hoje = useHoje();
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busca = valor.nome;
  // Reaproveita a busca sem acento por nome/telefone/e-mail já usada em Clientes.
  const sugestoes = useMemo(
    () => selectClientesFiltrados(state, "Todos", busca, hoje).slice(0, MAX_SUGESTOES),
    [state, busca, hoje],
  );
  // Só oferece "usar o nome digitado" quando ele ainda não é um cadastro exato.
  // A opção fica por ÚLTIMO: com resultados na tela, Enter deve escolher um
  // cliente do cadastro, não criar um homônimo pela metade ("ric").
  const nomeLimpo = busca.trim();
  const ofereceNovo = nomeLimpo.length > 0 && !sugestoes.some((cl) => cl.nome === nomeLimpo);
  const indiceNovo = sugestoes.length; // só existe quando `ofereceNovo`
  const opcoes = ofereceNovo ? sugestoes.length + 1 : sugestoes.length;

  useEffect(() => setDestaque(0), [busca]);

  // Clique fora fecha (o modal em volta não tem overlay próprio para isso).
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(indice: number) {
    const cl = sugestoes[indice];
    if (cl) onChange({ nome: cl.nome, id: cl.id });
    else onChange({ nome: nomeLimpo }); // "Cliente novo"
    setAberto(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setAberto(false);
      return;
    }
    if (!aberto || opcoes === 0) {
      if (e.key === "ArrowDown") setAberto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((i) => (i + 1) % opcoes);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((i) => (i - 1 + opcoes) % opcoes);
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(destaque);
    }
  }

  const linha = (ativo: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    border: "none",
    borderRadius: 9,
    padding: "8px 9px",
    cursor: "pointer",
    background: ativo ? c.brassTint : "transparent",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="oc-input"
        style={fieldInput}
        value={busca}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => {
          onChange({ nome: e.target.value }); // digitar desfaz o vínculo anterior
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={onKeyDown}
      />
      {valor.id ? (
        <span style={{ position: "absolute", right: 12, top: 13, fontSize: 11, fontWeight: 700, color: c.brassDeep }}>
          ✓ cadastrado
        </span>
      ) : null}

      {aberto && opcoes > 0 ? (
        <div
          className="oc-pop"
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            left: 0,
            right: 0,
            zIndex: 30,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            boxShadow: shadow.pop,
            padding: 6,
            maxHeight: 268,
            overflowY: "auto",
          }}
        >
          {sugestoes.map((cl, indice) => {
            const seloTag = tagDerivadaCliente(state, cl, hoje);
            const selo = tagMeta(seloTag);
            return (
              <button
                key={cl.id}
                type="button"
                style={linha(destaque === indice)}
                onMouseEnter={() => setDestaque(indice)}
                onClick={() => escolher(indice)}
              >
                <Avatar initials={cl.iniciais} size={30} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: c.inkTitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cl.nome}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: c.ink3, fontFamily: font.sans }}>
                    {cl.telefone || cl.email || "—"}
                  </span>
                </span>
                {selo ? (
                  <span style={{ flex: "none", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: selo.bg, color: selo.fg }}>
                    {seloTag}
                  </span>
                ) : null}
              </button>
            );
          })}

          {ofereceNovo ? (
            <button
              type="button"
              style={{ ...linha(destaque === indiceNovo), borderTop: sugestoes.length ? `1px solid ${c.borderSoft}` : undefined }}
              onMouseEnter={() => setDestaque(indiceNovo)}
              onClick={() => escolher(indiceNovo)}
            >
              <Avatar initials="+" size={30} />
              <span style={{ fontSize: 13, color: c.ink2 }}>
                Cliente novo: <strong style={{ color: c.inkTitle }}>{nomeLimpo}</strong>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
