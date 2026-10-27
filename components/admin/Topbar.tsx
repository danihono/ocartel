"use client";

import { useState } from "react";
import { isoParaLabel } from "@/lib/date";
import { useHoje } from "@/lib/useRelogio";
import { useStore } from "@/lib/store";
import { NovoAgendamentoModal } from "@/components/admin/NovoAgendamentoModal";
import { useNavegacao } from "@/components/admin/navegacao";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";

// Barra do topo: a própria página (sem faixa nem borda). Breadcrumb "Barbearia / Aba"
// à esquerda; busca em pílula, data, tema e o botão principal à direita. O título
// grande da aba mora no PageHeader, dentro da tela.
export default function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { ir } = useNavegacao();
  const { state, dispatch } = useStore();
  const hoje = useHoje();
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);

  /** Aplica a busca na tela de Clientes e leva até lá. Só no submit: navegar a
   *  cada tecla disparava uma requisição por caractere — e sem nenhum efeito. */
  function buscar() {
    dispatch({ type: "SET_TELA", tela: "clientes", patch: { busca: q, selId: null } });
    ir("/clientes");
  }

  return (
    <header className="oc-topbar">
      <button className="oc-icon-btn oc-only-mobile" onClick={onMenu} aria-label="Abrir menu">
        <Icon name="menu" size={18} />
      </button>

      <div className="oc-crumb">
        <span className="oc-only-desktop" style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
          {state.config.nome || "Barbearia"}
        </span>
        <span className="oc-only-desktop">/</span>
        <b>{title}</b>
      </div>

      <span style={{ flex: 1 }} />

      <form
        className="oc-search oc-only-desktop"
        style={{ width: 340, maxWidth: "34vw" }}
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <Icon name="busca" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente" />
        <span className="oc-kbd">↵</span>
      </form>

      <div
        className="oc-only-desktop"
        style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--oc-sub)", background: "var(--oc-surface)", border: "1px solid var(--oc-line)", borderRadius: 999, padding: "0 13px", height: 38, whiteSpace: "nowrap", fontWeight: 500 }}
      >
        <Icon name="agenda" size={14} />
        {isoParaLabel(hoje)}
      </div>

      <div className="oc-only-desktop">
        <ThemeSwitch />
      </div>

      <Button icon="mais" onClick={() => setNovo(true)}>
        <span className="oc-only-desktop">Novo agendamento</span>
        <span className="oc-only-mobile">Novo</span>
      </Button>

      <NovoAgendamentoModal open={novo} onClose={() => setNovo(false)} />
    </header>
  );
}
