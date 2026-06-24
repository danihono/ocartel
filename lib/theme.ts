// Design tokens for O Cartel — palette, fonts, shadows.
// Fonts are wired as CSS variables in app/layout.tsx (next/font).
//
// Paleta "Esmeralda & Latão": o marrom (espresso/couro/creme) é o PALCO; o
// verde-esmeralda (accent*) é a cor que "chama atenção" — botões, nav ativo,
// série principal de gráficos, KPI destaque. Latão fica como brilho metálico.

export const c = {
  // surfaces
  bg: "#F1ECE1",
  surface: "#FFFFFF",
  surfaceAlt: "#F6F1E8",
  surfaceWarm: "#F2EDE2",
  // ink
  ink: "#1E1812",
  ink2: "#7C6E5E",
  ink3: "#8F8170",
  ink4: "#A2937C",
  inkTitle: "#241B12", // títulos (antes hardcoded em vários lugares)
  inkLabel: "#6B5C4B", // labels de campo (antes hardcoded)
  // borders
  border: "#E6DCCB",
  borderSoft: "#F1EADC",
  borderInput: "#DCD0BC",
  // browns (palco — mantidos como charme)
  espresso: "#1F1611",
  espressoDeep: "#190F0B",
  espressoLine: "#34271E",
  leather: "#4A342A",
  brown: "#5D4037",
  brown2: "#6B4A36",
  // brass accent (metálico — um pouco mais brilhante)
  brass: "#CDAA63",
  brassSoft: "#F1E4C6",
  brassTint: "#FBF3E2",
  brassDeep: "#9C6F28",
  // accent — esmeralda (hero da marca)
  accent: "#0E3B33",
  accentBright: "#1C6B5C",
  accentSoft: "#E4EFEA",
  accentDark: "#6FC9B4", // verdigris — hero do tema escuro (super-admin)
  // botão primário (antes hardcoded #241711 / #F4EAD8)
  primaryBtnBg: "#0E3B33",
  primaryBtnText: "#F4EAD8",
  // status
  green: "#3E7A4E",
  greenText: "#3c6a45",
  greenBg: "#E7EFE6",
  red: "#A35C4F",
  redText: "#8a463b",
  redBg: "#F5E8E4",
  amber: "#B07D2B",
  amberText: "#8a5f1c",
  amberBg: "#F7EEDC",
  // dark theme (super admin)
  darkBg: "#101512",
  darkSurface: "#18211C",
  darkLine: "#24302A",
  darkText: "#E5E9DF",
  darkMuted: "#8E9A8C",
  darkGreen: "#A6D697",
  darkAmber: "#E7C078",
  darkRed: "#E6A293",
} as const;

export const font = {
  cinzel: "var(--font-cinzel), serif",
  serif: "var(--font-spectral), Georgia, serif",
  sans: "var(--font-sans), system-ui, sans-serif",
} as const;

export const shadow = {
  card: "0 1px 2px rgba(60,40,20,.04)",
  pop: "0 1px 2px rgba(0,0,0,.08)",
  phone: "0 30px 70px rgba(40,25,10,.4)",
} as const;
