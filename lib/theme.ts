// Design tokens for O Cartel — palette, fonts, shadows.
// Fonts are wired as CSS variables in app/layout.tsx (next/font).
//
// Paleta "Esmeralda Elétrica": base CINZA-FRIA (nada de bege/marrom). O
// esmeralda (#0EA37A) é o HERO — botões, nav ativa, série principal de
// gráficos, KPI destaque. Teal/lima/violeta entram como sistema de cor
// SEMÂNTICO (categorias, barbeiros, comparativos). O escuro (sidebar /
// super-admin) é um carvão-esmeralda frio, não mais espresso marrom.

export const c = {
  // surfaces — base fria, sem bege
  bg: "#F5F7F8",
  surface: "#FFFFFF",
  surfaceAlt: "#EDF1F3",
  surfaceWarm: "#EDF1F3", // (compat: outrora bege, agora frio)
  // ink — ardósia fria
  ink: "#0F1B19",
  ink2: "#5B6B69",
  ink3: "#82908D",
  ink4: "#9DA9A6",
  inkTitle: "#0F1B19",
  inkLabel: "#475553",
  // borders — cinza frio
  border: "#E2E8EC",
  borderSoft: "#EEF2F4",
  borderInput: "#D8E0E4",
  // shell escuro (sidebar / super-admin) — carvão-esmeralda, não marrom
  espresso: "#0B201C",
  espressoDeep: "#071714",
  espressoLine: "#16332D",
  leather: "#2F4A44", // fundo de avatar (slate-esmeralda)
  brown: "#7C5CFC", // (repaginado) categoria secundária = violeta
  brown2: "#475553", // (repaginado) texto frio legível
  // destaque metálico → agora ESMERALDA (mantido sob os nomes brass* p/ compat)
  brass: "#0EA37A",
  brassSoft: "#DCF3EC",
  brassTint: "#EAF8F2",
  brassDeep: "#0C7D5E",
  // accent — esmeralda viva (hero da marca)
  accent: "#0EA37A",
  accentBright: "#0C8E69",
  accentSoft: "#E3F5EE",
  accentDark: "#34D6A6", // verdigris — hero do tema escuro (super-admin)
  // botão primário
  primaryBtnBg: "#0EA37A",
  primaryBtnText: "#FFFFFF",
  // sistema de cor semântico (novos)
  primary: "#0EA37A",
  primaryHover: "#0C8E69",
  teal: "#0FB6C8",
  lime: "#A0E61A",
  violet: "#7C5CFC",
  pink: "#F0476A",
  // ordem categórica fixa p/ gráficos, barbeiros, planos, tags de categoria
  series: ["#0EA37A", "#0FB6C8", "#7C5CFC", "#E0A21A", "#F0476A"] as readonly string[],
  // status — limpo e moderno
  green: "#12A150",
  greenText: "#0E7A3D",
  greenBg: "#E4F5EA",
  red: "#E5484D",
  redText: "#C0353A",
  redBg: "#FDEAEA",
  amber: "#E0A21A",
  amberText: "#9A6E0E",
  amberBg: "#FBF1DC",
  // dark theme (super admin) — carvão-esmeralda
  darkBg: "#08130F",
  darkSurface: "#102019",
  darkLine: "#1E332B",
  darkText: "#E5EFEA",
  darkMuted: "#8FA59E",
  darkGreen: "#34D6A6",
  darkAmber: "#E7C078",
  darkRed: "#F0978A",
} as const;

export const font = {
  cinzel: "var(--font-cinzel), serif",
  // serifa aposentada da UI (cue "rústico"): apontada para a sans moderna.
  // O wordmark "O CARTEL" segue em Cinzel (font.cinzel).
  serif: "var(--font-sans), system-ui, sans-serif",
  sans: "var(--font-sans), system-ui, sans-serif",
} as const;

export const shadow = {
  // sombras frias e neutras (antes quentes/marrom) + glow esmeralda p/ hero
  card: "0 1px 2px rgba(15,27,25,.05)",
  pop: "0 8px 24px rgba(15,27,25,.12)",
  phone: "0 30px 70px rgba(11,32,28,.40)",
  glow: "0 8px 24px rgba(14,163,122,.22)",
} as const;
