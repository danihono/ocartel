"use client";

// Duração do atendimento, editável na hora de agendar. O serviço define o
// padrão (ex.: 30 min), mas nem todo atendimento cabe nele — aqui dá pra ajustar
// antes de criar, sem depender do resize na grade.

import { Field, TextInput } from "@/components/ui/Field";
import { c } from "@/lib/theme";
import { fmtDur } from "@/lib/selectors";

/** Passo da grade da agenda (15 min) — mantém a duração alinhada às linhas. */
export const DURACAO_PASSO = 15;
export const DURACAO_MIN = 15;
const ATALHOS = [15, 30, 45, 60, 90];

export function normalizaDuracao(min: number): number {
  return Math.max(DURACAO_MIN, Math.round((Number(min) || DURACAO_MIN) / DURACAO_PASSO) * DURACAO_PASSO);
}

export function DuracaoField({
  valor,
  onChange,
  padrao,
  style,
}: {
  valor: number;
  onChange: (min: number) => void;
  /** Duração do serviço escolhido — mostrada como referência quando difere. */
  padrao?: number;
  style?: React.CSSProperties;
}) {
  return (
    <Field label="Duração" style={style}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {ATALHOS.map((min) => {
          const on = min === valor;
          return (
            <button
              key={min}
              type="button"
              onClick={() => onChange(min)}
              style={{
                border: `1.5px solid ${on ? c.brass : c.border}`,
                background: on ? c.brassTint : c.surface,
                color: on ? c.inkTitle : c.ink2,
                borderRadius: 999,
                padding: "6px 11px",
                fontSize: 12.5,
                fontWeight: on ? 700 : 600,
                cursor: "pointer",
              }}
            >
              {fmtDur(min)}
            </button>
          );
        })}
        <TextInput
          type="number"
          min={DURACAO_MIN}
          step={DURACAO_PASSO}
          value={valor}
          inputMode="numeric"
          onChange={(e) => onChange(Math.max(DURACAO_MIN, Number(e.target.value) || DURACAO_MIN))}
          onBlur={(e) => onChange(normalizaDuracao(Number(e.target.value)))}
          style={{ width: 88, padding: "9px 10px", fontSize: 13 }}
        />
        <span style={{ fontSize: 12, color: c.ink3 }}>min</span>
      </div>
      {padrao && padrao !== valor ? (
        <span style={{ display: "block", marginTop: 6, fontSize: 11.5, color: c.ink3 }}>
          Padrão do serviço: {fmtDur(padrao)}
        </span>
      ) : null}
    </Field>
  );
}
