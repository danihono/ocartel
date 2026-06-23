export function StatusPill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "4px 11px",
        borderRadius: 999,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function Tag({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: bg,
        color: fg,
        flex: "none",
      }}
    >
      {label}
    </span>
  );
}
