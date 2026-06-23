"use client";

import type { CSSProperties, ReactNode } from "react";
import { c, font } from "@/lib/theme";

// Estilos extraídos do formulário de login para reuso em modais e telas.
export const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6B5C4B",
  display: "block",
  marginBottom: 6,
};

export const fieldInput: CSSProperties = {
  width: "100%",
  background: c.surface,
  border: `1px solid ${c.borderInput}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  color: "#241B12",
  fontFamily: font.sans,
  outline: "none",
};

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "block", ...style }}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export function TextInput({ style, ...rest }: InputProps) {
  return <input {...rest} style={{ ...fieldInput, ...style }} />;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode };
export function Select({ style, children, ...rest }: SelectProps) {
  return (
    <select {...rest} style={{ ...fieldInput, cursor: "pointer", appearance: "auto", ...style }}>
      {children}
    </select>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export function Textarea({ style, ...rest }: TextareaProps) {
  return <textarea {...rest} style={{ ...fieldInput, resize: "vertical", minHeight: 70, ...style }} />;
}

/** Entrada de valor em R$ — mantém o número e mostra o prefixo. */
export function MoneyInput({ value, onChange, style }: { value: number; onChange: (n: number) => void; style?: CSSProperties }) {
  return (
    <div style={{ ...fieldInput, display: "flex", alignItems: "center", gap: 6, padding: "0 14px", ...style }}>
      <span style={{ color: c.ink3, fontSize: 14, fontWeight: 600 }}>R$</span>
      <input
        inputMode="numeric"
        value={value ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
        style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "12px 0", fontSize: 14, color: "#241B12", fontFamily: font.sans, width: "100%" }}
      />
    </div>
  );
}
