"use client";

import { useTema, type Tema } from "@/lib/tema";
import { Icon, type IconName } from "./Icon";

const OPCOES: { tema: Tema; icon: IconName; label: string }[] = [
  { tema: "light", icon: "sol", label: "Tema claro" },
  { tema: "dark", icon: "lua", label: "Tema escuro" },
  { tema: "system", icon: "monitor", label: "Seguir o sistema" },
];

/** Seletor de tema: três botões redondos dentro de uma pílula. */
export function ThemeSwitch() {
  const { tema, setTema } = useTema();
  return (
    <div className="oc-seg" role="group" aria-label="Tema">
      {OPCOES.map((o) => (
        <button
          key={o.tema}
          type="button"
          aria-pressed={tema === o.tema}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTema(o.tema)}
          style={{ width: 30, height: 30, padding: 0, justifyContent: "center" }}
        >
          <Icon name={o.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
