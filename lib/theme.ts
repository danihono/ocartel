// Design tokens do O Cartel: paleta "Navalha" (ver app/globals.css).
//
// Cada cor aqui é uma REFERÊNCIA a variável CSS, não um hex: os estilos inline das
// telas leem `c.*` e passam a seguir o tema claro/escuro sozinhos. Template literals
// como `1px solid ${c.border}` continuam valendo. O que NÃO dá é concatenar alfa em
// hex (`c.x + "22"`): para tintas, use as variáveis *Tint/*Bg prontas.
//
// Base clara e quente; o destaque é o par da marca, floresta quase preta + limão neon.
// Neon nunca é texto sobre o claro: o acento legível é `accent` (oliva escuro no
// claro, o próprio neon no escuro). Alguns nomes antigos (brass*, espresso*, dark*)
// ficam como apelidos para não mexer nos 38 arquivos que os importam:
//   brass*    → acento (texto/preenchimento legível no tema atual)
//   espresso* → floresta (superfície escura em QUALQUER tema)
//   dark*     → tinta sobre floresta (para o que vive em cima de espresso*)

const v = (name: string) => `var(--oc-${name})`;

export const c = {
  // superfícies
  bg: v("page"),
  surface: v("surface"),
  surfaceAlt: v("raised"),
  surfaceWarm: v("raised"),
  field: v("field"),
  // tinta
  ink: v("ink"),
  ink2: v("sub"),
  ink3: v("muted"),
  ink4: v("faint"),
  inkTitle: v("ink"),
  inkLabel: v("sub"),
  inkDim: v("dim"),
  // bordas
  border: v("line"),
  borderSoft: v("hair"),
  borderInput: v("line-strong"),
  // floresta: superfícies escuras em qualquer tema
  forest: v("forest"),
  espresso: v("forest"),
  espressoDeep: v("forest-deep"),
  espressoLine: v("forest-line"),
  leather: v("forest-2"),
  // neon da marca (só sobre floresta/escuro, ou como preenchimento com texto floresta)
  neon: v("neon"),
  onNeon: v("on-neon"),
  lime: v("neon"),
  // acento legível no tema atual
  accent: v("accent"),
  accentBright: v("accent-strong"),
  accentSoft: v("accent-soft"),
  accentTint: v("accent-tint"),
  accentLine: v("accent-line"),
  accentDark: v("neon"),
  brass: v("accent"),
  brassSoft: v("accent-soft"),
  brassTint: v("accent-tint"),
  brassDeep: v("accent-strong"),
  brown: v("violet"),
  brown2: v("sub"),
  // botão principal
  primary: v("btn-bg"),
  primaryHover: v("btn-bg-hover"),
  primaryBtnBg: v("btn-bg"),
  primaryBtnText: v("btn-ink"),
  // sistema semântico
  teal: v("blue"),
  violet: v("violet"),
  pink: v("pink"),
  series: [v("s1"), v("s2"), v("s3"), v("s4"), v("s5")] as readonly string[],
  // status
  green: v("green"),
  greenText: v("green-ink"),
  greenBg: v("green-tint"),
  red: v("red"),
  redText: v("red-ink"),
  redBg: v("red-tint"),
  amber: v("amber"),
  amberText: v("amber-ink"),
  amberBg: v("amber-tint"),
  blue: v("blue"),
  blueText: v("blue-ink"),
  blueBg: v("blue-tint"),
  // sobre floresta
  darkBg: v("forest-deep"),
  darkSurface: v("forest"),
  darkLine: v("forest-line"),
  darkText: v("on-forest"),
  darkMuted: v("on-forest-dim"),
  darkGreen: v("neon"),
  darkAmber: "#E7C078",
  darkRed: "#F0978A",
} as const;

export const font = {
  cinzel: "var(--font-cinzel), serif",
  // Não há serifa na UI: só o wordmark "O CARTEL" (font.cinzel). `serif` fica como
  // apelido da sans para os títulos que ainda o pedem.
  serif: "var(--font-sans), system-ui, sans-serif",
  sans: "var(--font-sans), system-ui, sans-serif",
  mono: "var(--font-mono), ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

export const shadow = {
  card: v("shadow-card"),
  pop: v("shadow-pop"),
  modal: v("shadow-modal"),
  phone: v("shadow-phone"),
  glow: v("glow"),
} as const;
