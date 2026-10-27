/** Pílula de status: texto colorido sobre o tint da mesma cor, sem borda. */
export function StatusPill({ label, fg, bg, dot = false }: { label: string; fg: string; bg: string; dot?: boolean }) {
  return (
    <span className="oc-chip" style={{ background: bg, color: fg }}>
      {dot ? <span className="oc-chip-dot" /> : null}
      {label}
    </span>
  );
}

export function Tag({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <span className="oc-chip" style={{ background: bg, color: fg, fontSize: 10.5, padding: "2px 8px", flex: "none" }}>
      {label}
    </span>
  );
}
