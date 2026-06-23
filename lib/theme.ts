// Design tokens for O Cartel — palette, fonts, shadows.
// Fonts are wired as CSS variables in app/layout.tsx (next/font).

export const c = {
  // surfaces
  bg: "#F2ECE2",
  surface: "#FFFFFF",
  surfaceAlt: "#F7F2EA",
  surfaceWarm: "#F4EEE2",
  // ink
  ink: "#211A14",
  ink2: "#8A7A68",
  ink3: "#9A8B79",
  ink4: "#A8987F",
  // borders
  border: "#EADFCD",
  borderSoft: "#F2E9DA",
  borderInput: "#E2D6C2",
  // browns
  espresso: "#211711",
  espressoDeep: "#1B130F",
  espressoLine: "#34271E",
  leather: "#4A342A",
  brown: "#5D4037",
  brown2: "#6B4A36",
  // brass accent
  brass: "#C9A86A",
  brassSoft: "#F1E4CB",
  brassTint: "#FBF3E2",
  brassDeep: "#9A6F2E",
  // status
  green: "#5E7A52",
  greenText: "#4f6644",
  greenBg: "#ECF1E7",
  red: "#A35C4F",
  redText: "#8a463b",
  redBg: "#F5E8E4",
  amber: "#B07D2B",
  amberText: "#8a5f1c",
  amberBg: "#F7EEDC",
  // dark theme (super admin)
  darkBg: "#181210",
  darkSurface: "#221913",
  darkLine: "#342720",
  darkText: "#E7DCC9",
  darkMuted: "#9A8771",
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
