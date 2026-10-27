import type { ReactNode } from "react";

/**
 * Cabeçalho de tela: eyebrow em pílula + título em dois tons ("Agenda." / "12 horários
 * hoje.") + ações à direita. O título sempre termina com ponto; o subtítulo vem
 * no tom apagado logo abaixo.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  live = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Ponto do acento na eyebrow (algo acontecendo agora). */
  live?: boolean;
}) {
  return (
    <div className="oc-page-head">
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
        {eyebrow ? (
          <span className="oc-eyebrow">
            {live ? <span className="oc-eyebrow-dot" /> : null}
            {eyebrow}
          </span>
        ) : null}
        <h1 className="oc-h1">
          {title}
          {subtitle ? <span>{subtitle}</span> : null}
        </h1>
      </div>
      {actions ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}
