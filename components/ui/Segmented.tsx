"use client";

import type { ReactNode } from "react";

/** Controle segmentado em pílula; o selecionado é floresta (neon no tema escuro). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  label?: string;
}) {
  return (
    <div className="oc-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined ? <span className="oc-seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
