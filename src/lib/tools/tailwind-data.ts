/**
 * Data tables for the Tailwind <-> CSS translator. Values follow the Tailwind
 * v3.4 defaults (which v4 keeps for the core utilities covered here).
 * Everything is plain data so the same tables drive both directions.
 */

export type Declaration = { property: string; value: string };
export type Decls = Array<[string, string]>;

/** Spacing scale: key -> rem/px value. */
export const SPACING: Record<string, string> = { "0": "0px", px: "1px" };
for (const n of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]) {
  SPACING[String(n)] = `${n * 0.25}rem`;
}

export const FRACTIONS: Record<string, string> = {};
for (const d of [2, 3, 4, 5, 6, 12]) {
  for (let n = 1; n < d; n++) {
    const pct = (n / d) * 100;
    FRACTIONS[`${n}/${d}`] = `${Number.isInteger(pct) ? pct : pct.toFixed(6)}%`;
  }
}

export const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const PALETTE_RAW: Record<string, string> = {
  slate: "f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617",
  gray: "f9fafb f3f4f6 e5e7eb d1d5db 9ca3af 6b7280 4b5563 374151 1f2937 111827 030712",
  zinc: "fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b",
  neutral: "fafafa f5f5f5 e5e5e5 d4d4d4 a3a3a3 737373 525252 404040 262626 171717 0a0a0a",
  stone: "fafaf9 f5f5f4 e7e5e4 d6d3d1 a8a29e 78716c 57534e 44403c 292524 1c1917 0c0a09",
  red: "fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a",
  orange: "fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407",
  amber: "fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03",
  yellow: "fefce8 fef9c3 fef08a fde047 facc15 eab308 ca8a04 a16207 854d0e 713f12 422006",
  lime: "f7fee7 ecfccb d9f99d bef264 a3e635 84cc16 65a30d 4d7c0f 3f6212 365314 1a2e05",
  green: "f0fdf4 dcfce7 bbf7d0 86efac 4ade80 22c55e 16a34a 15803d 166534 14532d 052e16",
  emerald: "ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22",
  teal: "f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e",
  cyan: "ecfeff cffafe a5f3fc 67e8f9 22d3ee 06b6d4 0891b2 0e7490 155e75 164e63 083344",
  sky: "f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49",
  blue: "eff6ff dbeafe bfdbfe 93c5fd 60a5fa 3b82f6 2563eb 1d4ed8 1e40af 1e3a8a 172554",
  indigo: "eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b",
  violet: "f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065",
  purple: "faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764",
  fuchsia: "fdf4ff fae8ff f5d0fe f0abfc e879f9 d946ef c026d3 a21caf 86198f 701a75 4a044e",
  pink: "fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724",
  rose: "fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519",
};

/** Colour name (`red-500`, `white`, `transparent`) -> CSS value. */
export const COLORS: Record<string, string> = {
  inherit: "inherit",
  current: "currentColor",
  transparent: "transparent",
  black: "#000000",
  white: "#ffffff",
};
for (const [name, list] of Object.entries(PALETTE_RAW)) {
  const hexes = list.split(" ");
  SHADES.forEach((shade, i) => {
    COLORS[`${name}-${shade}`] = `#${hexes[i]}`;
  });
}

/** Reverse: hex -> first colour name that has it. */
export const COLOR_BY_HEX: Record<string, string> = {};
for (const [name, hex] of Object.entries(COLORS)) {
  if (hex.startsWith("#") && !(hex in COLOR_BY_HEX)) COLOR_BY_HEX[hex] = name;
}

export const FONT_SIZE: Record<string, [string, string]> = {
  xs: ["0.75rem", "1rem"],
  sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"],
  lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"],
  "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"],
  "4xl": ["2.25rem", "2.5rem"],
  "5xl": ["3rem", "1"],
  "6xl": ["3.75rem", "1"],
  "7xl": ["4.5rem", "1"],
  "8xl": ["6rem", "1"],
  "9xl": ["8rem", "1"],
};

export const FONT_WEIGHT: Record<string, string> = { thin: "100", extralight: "200", light: "300", normal: "400", medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900" };

export const FONT_FAMILY: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

export const LINE_HEIGHT: Record<string, string> = { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" };
for (const n of [3, 4, 5, 6, 7, 8, 9, 10]) LINE_HEIGHT[String(n)] = `${n * 0.25}rem`;

export const LETTER_SPACING: Record<string, string> = { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" };

export const RADIUS: Record<string, string> = { none: "0px", sm: "0.125rem", "": "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" };

export const SHADOW: Record<string, string> = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  "": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
  none: "0 0 #0000",
};

export const MAX_WIDTH: Record<string, string> = {
  "0": "0rem",
  none: "none",
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
  "4xl": "56rem",
  "5xl": "64rem",
  "6xl": "72rem",
  "7xl": "80rem",
  full: "100%",
  min: "min-content",
  max: "max-content",
  fit: "fit-content",
  prose: "65ch",
  "screen-sm": "640px",
  "screen-md": "768px",
  "screen-lg": "1024px",
  "screen-xl": "1280px",
  "screen-2xl": "1536px",
};

export const BLUR: Record<string, string> = { none: "0", sm: "4px", "": "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "40px", "3xl": "64px" };

export const EASE: Record<string, string> = { linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" };

const TRANSITION_DEFAULT = "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter";
export const TRANSITION_PROPERTY: Record<string, string> = {
  "": TRANSITION_DEFAULT,
  all: "all",
  colors: "color, background-color, border-color, text-decoration-color, fill, stroke",
  opacity: "opacity",
  shadow: "box-shadow",
  transform: "transform",
  none: "none",
};

const numbers = (list: number[], fmt: (n: number) => string): Record<string, string> => Object.fromEntries(list.map((n) => [String(n), fmt(n)]));

export const DURATION = numbers([0, 75, 100, 150, 200, 300, 500, 700, 1000], (n) => `${n}ms`);
export const OPACITY = numbers([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100], (n) => String(n / 100));
export const SCALE = numbers([0, 50, 75, 90, 95, 100, 105, 110, 125, 150], (n) => String(n / 100));
export const ROTATE = numbers([0, 1, 2, 3, 6, 12, 45, 90, 180], (n) => `${n}deg`);
export const SKEW = numbers([0, 1, 2, 3, 6, 12], (n) => `${n}deg`);
export const Z_INDEX: Record<string, string> = { ...numbers([0, 10, 20, 30, 40, 50], String), auto: "auto" };
export const ORDER: Record<string, string> = { ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], String), first: "-9999", last: "9999", none: "0" };
export const GRID_COLS: Record<string, string> = { ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (n) => `repeat(${n}, minmax(0, 1fr))`), none: "none", subgrid: "subgrid" };
export const GRID_ROWS: Record<string, string> = { ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (n) => `repeat(${n}, minmax(0, 1fr))`), none: "none", subgrid: "subgrid" };
export const SPAN: Record<string, string> = { ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (n) => `span ${n} / span ${n}`), full: "1 / -1" };
export const LINE_START: Record<string, string> = { ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], String), auto: "auto" };
export const BORDER_WIDTH: Record<string, string> = { "": "1px", "0": "0px", "2": "2px", "4": "4px", "8": "8px" };
export const RING_WIDTH: Record<string, string> = { "": "3px", "0": "0px", "1": "1px", "2": "2px", "4": "4px", "8": "8px" };
export const RING_OFFSET: Record<string, string> = { "0": "0px", "1": "1px", "2": "2px", "4": "4px", "8": "8px" };
export const OUTLINE_WIDTH: Record<string, string> = { "0": "0px", "1": "1px", "2": "2px", "4": "4px", "8": "8px" };
export const DECORATION_THICKNESS: Record<string, string> = { auto: "auto", "from-font": "from-font", "0": "0px", "1": "1px", "2": "2px", "4": "4px", "8": "8px" };
export const UNDERLINE_OFFSET: Record<string, string> = { auto: "auto", "0": "0px", "1": "1px", "2": "2px", "4": "4px", "8": "8px" };
export const LINE_CLAMP = numbers([1, 2, 3, 4, 5, 6], String);
export const ASPECT: Record<string, string> = { auto: "auto", square: "1 / 1", video: "16 / 9" };
export const COLUMNS: Record<string, string> = {
  ...numbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], String),
  auto: "auto",
  "3xs": "16rem",
  "2xs": "18rem",
  xs: "20rem",
  sm: "24rem",
  md: "28rem",
  lg: "32rem",
  xl: "36rem",
  "2xl": "42rem",
  "3xl": "48rem",
  "4xl": "56rem",
  "5xl": "64rem",
  "6xl": "72rem",
  "7xl": "80rem",
};

/** Selector suffix used by space-* and divide-* utilities. */
export const CHILD_SELECTOR = " > :not([hidden]) ~ :not([hidden])";

/** Static utilities: class -> declarations. */
export const STATIC: Record<string, Decls> = {
  // display
  block: [["display", "block"]],
  "inline-block": [["display", "inline-block"]],
  inline: [["display", "inline"]],
  flex: [["display", "flex"]],
  "inline-flex": [["display", "inline-flex"]],
  grid: [["display", "grid"]],
  "inline-grid": [["display", "inline-grid"]],
  table: [["display", "table"]],
  "inline-table": [["display", "inline-table"]],
  "table-caption": [["display", "table-caption"]],
  "table-cell": [["display", "table-cell"]],
  "table-row": [["display", "table-row"]],
  "flow-root": [["display", "flow-root"]],
  contents: [["display", "contents"]],
  "list-item": [["display", "list-item"]],
  hidden: [["display", "none"]],
  // position
  static: [["position", "static"]],
  fixed: [["position", "fixed"]],
  absolute: [["position", "absolute"]],
  relative: [["position", "relative"]],
  sticky: [["position", "sticky"]],
  // visibility, box
  visible: [["visibility", "visible"]],
  invisible: [["visibility", "hidden"]],
  collapse: [["visibility", "collapse"]],
  "box-border": [["box-sizing", "border-box"]],
  "box-content": [["box-sizing", "content-box"]],
  isolate: [["isolation", "isolate"]],
  "isolation-auto": [["isolation", "auto"]],
  // flex
  "flex-row": [["flex-direction", "row"]],
  "flex-row-reverse": [["flex-direction", "row-reverse"]],
  "flex-col": [["flex-direction", "column"]],
  "flex-col-reverse": [["flex-direction", "column-reverse"]],
  "flex-wrap": [["flex-wrap", "wrap"]],
  "flex-wrap-reverse": [["flex-wrap", "wrap-reverse"]],
  "flex-nowrap": [["flex-wrap", "nowrap"]],
  "flex-1": [["flex", "1 1 0%"]],
  "flex-auto": [["flex", "1 1 auto"]],
  "flex-initial": [["flex", "0 1 auto"]],
  "flex-none": [["flex", "none"]],
  grow: [["flex-grow", "1"]],
  "grow-0": [["flex-grow", "0"]],
  shrink: [["flex-shrink", "1"]],
  "shrink-0": [["flex-shrink", "0"]],
  // alignment
  "justify-normal": [["justify-content", "normal"]],
  "justify-start": [["justify-content", "flex-start"]],
  "justify-end": [["justify-content", "flex-end"]],
  "justify-center": [["justify-content", "center"]],
  "justify-between": [["justify-content", "space-between"]],
  "justify-around": [["justify-content", "space-around"]],
  "justify-evenly": [["justify-content", "space-evenly"]],
  "justify-stretch": [["justify-content", "stretch"]],
  "justify-items-start": [["justify-items", "start"]],
  "justify-items-end": [["justify-items", "end"]],
  "justify-items-center": [["justify-items", "center"]],
  "justify-items-stretch": [["justify-items", "stretch"]],
  "justify-self-auto": [["justify-self", "auto"]],
  "justify-self-start": [["justify-self", "start"]],
  "justify-self-end": [["justify-self", "end"]],
  "justify-self-center": [["justify-self", "center"]],
  "justify-self-stretch": [["justify-self", "stretch"]],
  "content-normal": [["align-content", "normal"]],
  "content-center": [["align-content", "center"]],
  "content-start": [["align-content", "flex-start"]],
  "content-end": [["align-content", "flex-end"]],
  "content-between": [["align-content", "space-between"]],
  "content-around": [["align-content", "space-around"]],
  "content-evenly": [["align-content", "space-evenly"]],
  "content-baseline": [["align-content", "baseline"]],
  "content-stretch": [["align-content", "stretch"]],
  "items-start": [["align-items", "flex-start"]],
  "items-end": [["align-items", "flex-end"]],
  "items-center": [["align-items", "center"]],
  "items-baseline": [["align-items", "baseline"]],
  "items-stretch": [["align-items", "stretch"]],
  "self-auto": [["align-self", "auto"]],
  "self-start": [["align-self", "flex-start"]],
  "self-end": [["align-self", "flex-end"]],
  "self-center": [["align-self", "center"]],
  "self-stretch": [["align-self", "stretch"]],
  "self-baseline": [["align-self", "baseline"]],
  "place-content-center": [["place-content", "center"]],
  "place-content-start": [["place-content", "start"]],
  "place-content-end": [["place-content", "end"]],
  "place-content-between": [["place-content", "space-between"]],
  "place-content-around": [["place-content", "space-around"]],
  "place-content-evenly": [["place-content", "space-evenly"]],
  "place-content-baseline": [["place-content", "baseline"]],
  "place-content-stretch": [["place-content", "stretch"]],
  "place-items-start": [["place-items", "start"]],
  "place-items-end": [["place-items", "end"]],
  "place-items-center": [["place-items", "center"]],
  "place-items-baseline": [["place-items", "baseline"]],
  "place-items-stretch": [["place-items", "stretch"]],
  "place-self-auto": [["place-self", "auto"]],
  "place-self-start": [["place-self", "start"]],
  "place-self-end": [["place-self", "end"]],
  "place-self-center": [["place-self", "center"]],
  "place-self-stretch": [["place-self", "stretch"]],
  // grid
  "grid-flow-row": [["grid-auto-flow", "row"]],
  "grid-flow-col": [["grid-auto-flow", "column"]],
  "grid-flow-dense": [["grid-auto-flow", "dense"]],
  "grid-flow-row-dense": [["grid-auto-flow", "row dense"]],
  "grid-flow-col-dense": [["grid-auto-flow", "column dense"]],
  "auto-cols-auto": [["grid-auto-columns", "auto"]],
  "auto-cols-min": [["grid-auto-columns", "min-content"]],
  "auto-cols-max": [["grid-auto-columns", "max-content"]],
  "auto-cols-fr": [["grid-auto-columns", "minmax(0, 1fr)"]],
  "auto-rows-auto": [["grid-auto-rows", "auto"]],
  "auto-rows-min": [["grid-auto-rows", "min-content"]],
  "auto-rows-max": [["grid-auto-rows", "max-content"]],
  "auto-rows-fr": [["grid-auto-rows", "minmax(0, 1fr)"]],
  "col-auto": [["grid-column", "auto"]],
  "row-auto": [["grid-row", "auto"]],
  // typography
  italic: [["font-style", "italic"]],
  "not-italic": [["font-style", "normal"]],
  uppercase: [["text-transform", "uppercase"]],
  lowercase: [["text-transform", "lowercase"]],
  capitalize: [["text-transform", "capitalize"]],
  "normal-case": [["text-transform", "none"]],
  "text-left": [["text-align", "left"]],
  "text-center": [["text-align", "center"]],
  "text-right": [["text-align", "right"]],
  "text-justify": [["text-align", "justify"]],
  "text-start": [["text-align", "start"]],
  "text-end": [["text-align", "end"]],
  truncate: [
    ["overflow", "hidden"],
    ["text-overflow", "ellipsis"],
    ["white-space", "nowrap"],
  ],
  "text-ellipsis": [["text-overflow", "ellipsis"]],
  "text-clip": [["text-overflow", "clip"]],
  "text-wrap": [["text-wrap", "wrap"]],
  "text-nowrap": [["text-wrap", "nowrap"]],
  "text-balance": [["text-wrap", "balance"]],
  "text-pretty": [["text-wrap", "pretty"]],
  "whitespace-normal": [["white-space", "normal"]],
  "whitespace-nowrap": [["white-space", "nowrap"]],
  "whitespace-pre": [["white-space", "pre"]],
  "whitespace-pre-line": [["white-space", "pre-line"]],
  "whitespace-pre-wrap": [["white-space", "pre-wrap"]],
  "whitespace-break-spaces": [["white-space", "break-spaces"]],
  "break-normal": [
    ["overflow-wrap", "normal"],
    ["word-break", "normal"],
  ],
  "break-words": [["overflow-wrap", "break-word"]],
  "break-all": [["word-break", "break-all"]],
  "break-keep": [["word-break", "keep-all"]],
  underline: [["text-decoration-line", "underline"]],
  overline: [["text-decoration-line", "overline"]],
  "line-through": [["text-decoration-line", "line-through"]],
  "no-underline": [["text-decoration-line", "none"]],
  "decoration-solid": [["text-decoration-style", "solid"]],
  "decoration-double": [["text-decoration-style", "double"]],
  "decoration-dotted": [["text-decoration-style", "dotted"]],
  "decoration-dashed": [["text-decoration-style", "dashed"]],
  "decoration-wavy": [["text-decoration-style", "wavy"]],
  antialiased: [
    ["-webkit-font-smoothing", "antialiased"],
    ["-moz-osx-font-smoothing", "grayscale"],
  ],
  "subpixel-antialiased": [
    ["-webkit-font-smoothing", "auto"],
    ["-moz-osx-font-smoothing", "auto"],
  ],
  "list-none": [["list-style-type", "none"]],
  "list-disc": [["list-style-type", "disc"]],
  "list-decimal": [["list-style-type", "decimal"]],
  "list-inside": [["list-style-position", "inside"]],
  "list-outside": [["list-style-position", "outside"]],
  "align-baseline": [["vertical-align", "baseline"]],
  "align-top": [["vertical-align", "top"]],
  "align-middle": [["vertical-align", "middle"]],
  "align-bottom": [["vertical-align", "bottom"]],
  "align-text-top": [["vertical-align", "text-top"]],
  "align-text-bottom": [["vertical-align", "text-bottom"]],
  "line-clamp-none": [
    ["overflow", "visible"],
    ["display", "block"],
    ["-webkit-box-orient", "horizontal"],
    ["-webkit-line-clamp", "none"],
  ],
  // borders
  "border-solid": [["border-style", "solid"]],
  "border-dashed": [["border-style", "dashed"]],
  "border-dotted": [["border-style", "dotted"]],
  "border-double": [["border-style", "double"]],
  "border-hidden": [["border-style", "hidden"]],
  "border-none": [["border-style", "none"]],
  "border-collapse": [["border-collapse", "collapse"]],
  "border-separate": [["border-collapse", "separate"]],
  "outline-none": [
    ["outline", "2px solid transparent"],
    ["outline-offset", "2px"],
  ],
  outline: [["outline-style", "solid"]],
  "outline-dashed": [["outline-style", "dashed"]],
  "outline-dotted": [["outline-style", "dotted"]],
  "outline-double": [["outline-style", "double"]],
  "ring-inset": [["--tw-ring-inset", "inset"]],
  // effects & filters
  "mix-blend-multiply": [["mix-blend-mode", "multiply"]],
  "mix-blend-screen": [["mix-blend-mode", "screen"]],
  "mix-blend-overlay": [["mix-blend-mode", "overlay"]],
  "mix-blend-normal": [["mix-blend-mode", "normal"]],
  // transitions
  "transition-none": [["transition-property", "none"]],
  // transforms
  "transform-none": [["transform", "none"]],
  "transform-gpu": [["transform", "translate3d(0, 0, 0)"]],
  "origin-center": [["transform-origin", "center"]],
  "origin-top": [["transform-origin", "top"]],
  "origin-top-right": [["transform-origin", "top right"]],
  "origin-right": [["transform-origin", "right"]],
  "origin-bottom-right": [["transform-origin", "bottom right"]],
  "origin-bottom": [["transform-origin", "bottom"]],
  "origin-bottom-left": [["transform-origin", "bottom left"]],
  "origin-left": [["transform-origin", "left"]],
  "origin-top-left": [["transform-origin", "top left"]],
  // overflow
  "overflow-auto": [["overflow", "auto"]],
  "overflow-hidden": [["overflow", "hidden"]],
  "overflow-clip": [["overflow", "clip"]],
  "overflow-visible": [["overflow", "visible"]],
  "overflow-scroll": [["overflow", "scroll"]],
  "overflow-x-auto": [["overflow-x", "auto"]],
  "overflow-y-auto": [["overflow-y", "auto"]],
  "overflow-x-hidden": [["overflow-x", "hidden"]],
  "overflow-y-hidden": [["overflow-y", "hidden"]],
  "overflow-x-clip": [["overflow-x", "clip"]],
  "overflow-y-clip": [["overflow-y", "clip"]],
  "overflow-x-visible": [["overflow-x", "visible"]],
  "overflow-y-visible": [["overflow-y", "visible"]],
  "overflow-x-scroll": [["overflow-x", "scroll"]],
  "overflow-y-scroll": [["overflow-y", "scroll"]],
  "overscroll-auto": [["overscroll-behavior", "auto"]],
  "overscroll-contain": [["overscroll-behavior", "contain"]],
  "overscroll-none": [["overscroll-behavior", "none"]],
  "scroll-smooth": [["scroll-behavior", "smooth"]],
  "scroll-auto": [["scroll-behavior", "auto"]],
  // object
  "object-contain": [["object-fit", "contain"]],
  "object-cover": [["object-fit", "cover"]],
  "object-fill": [["object-fit", "fill"]],
  "object-none": [["object-fit", "none"]],
  "object-scale-down": [["object-fit", "scale-down"]],
  "object-bottom": [["object-position", "bottom"]],
  "object-center": [["object-position", "center"]],
  "object-left": [["object-position", "left"]],
  "object-left-bottom": [["object-position", "left bottom"]],
  "object-left-top": [["object-position", "left top"]],
  "object-right": [["object-position", "right"]],
  "object-right-bottom": [["object-position", "right bottom"]],
  "object-right-top": [["object-position", "right top"]],
  "object-top": [["object-position", "top"]],
  // backgrounds
  "bg-none": [["background-image", "none"]],
  "bg-gradient-to-t": [["background-image", "linear-gradient(to top, var(--tw-gradient-stops))"]],
  "bg-gradient-to-tr": [["background-image", "linear-gradient(to top right, var(--tw-gradient-stops))"]],
  "bg-gradient-to-r": [["background-image", "linear-gradient(to right, var(--tw-gradient-stops))"]],
  "bg-gradient-to-br": [["background-image", "linear-gradient(to bottom right, var(--tw-gradient-stops))"]],
  "bg-gradient-to-b": [["background-image", "linear-gradient(to bottom, var(--tw-gradient-stops))"]],
  "bg-gradient-to-bl": [["background-image", "linear-gradient(to bottom left, var(--tw-gradient-stops))"]],
  "bg-gradient-to-l": [["background-image", "linear-gradient(to left, var(--tw-gradient-stops))"]],
  "bg-gradient-to-tl": [["background-image", "linear-gradient(to top left, var(--tw-gradient-stops))"]],
  "bg-auto": [["background-size", "auto"]],
  "bg-cover": [["background-size", "cover"]],
  "bg-contain": [["background-size", "contain"]],
  "bg-fixed": [["background-attachment", "fixed"]],
  "bg-local": [["background-attachment", "local"]],
  "bg-scroll": [["background-attachment", "scroll"]],
  "bg-center": [["background-position", "center"]],
  "bg-top": [["background-position", "top"]],
  "bg-bottom": [["background-position", "bottom"]],
  "bg-left": [["background-position", "left"]],
  "bg-right": [["background-position", "right"]],
  "bg-repeat": [["background-repeat", "repeat"]],
  "bg-no-repeat": [["background-repeat", "no-repeat"]],
  "bg-repeat-x": [["background-repeat", "repeat-x"]],
  "bg-repeat-y": [["background-repeat", "repeat-y"]],
  "bg-clip-border": [["background-clip", "border-box"]],
  "bg-clip-padding": [["background-clip", "padding-box"]],
  "bg-clip-content": [["background-clip", "content-box"]],
  "bg-clip-text": [["background-clip", "text"]],
  // interactivity
  "pointer-events-none": [["pointer-events", "none"]],
  "pointer-events-auto": [["pointer-events", "auto"]],
  "select-none": [["user-select", "none"]],
  "select-text": [["user-select", "text"]],
  "select-all": [["user-select", "all"]],
  "select-auto": [["user-select", "auto"]],
  "resize-none": [["resize", "none"]],
  "resize-y": [["resize", "vertical"]],
  "resize-x": [["resize", "horizontal"]],
  resize: [["resize", "both"]],
  "appearance-none": [["appearance", "none"]],
  "appearance-auto": [["appearance", "auto"]],
  "touch-none": [["touch-action", "none"]],
  "touch-auto": [["touch-action", "auto"]],
  "touch-pan-x": [["touch-action", "pan-x"]],
  "touch-pan-y": [["touch-action", "pan-y"]],
  "will-change-auto": [["will-change", "auto"]],
  "will-change-transform": [["will-change", "transform"]],
  // accessibility
  "sr-only": [
    ["position", "absolute"],
    ["width", "1px"],
    ["height", "1px"],
    ["padding", "0"],
    ["margin", "-1px"],
    ["overflow", "hidden"],
    ["clip", "rect(0, 0, 0, 0)"],
    ["white-space", "nowrap"],
    ["border-width", "0"],
  ],
  "not-sr-only": [
    ["position", "static"],
    ["width", "auto"],
    ["height", "auto"],
    ["padding", "0"],
    ["margin", "0"],
    ["overflow", "visible"],
    ["clip", "auto"],
    ["white-space", "normal"],
  ],
  "space-x-reverse": [["--tw-space-x-reverse", "1"]],
  "space-y-reverse": [["--tw-space-y-reverse", "1"]],
};

for (const c of ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "context-menu", "progress", "cell", "crosshair", "vertical-text", "alias", "copy", "no-drop", "grab", "grabbing", "all-scroll", "col-resize", "row-resize", "n-resize", "e-resize", "s-resize", "w-resize", "ew-resize", "ns-resize", "zoom-in", "zoom-out"]) {
  STATIC[`cursor-${c}`] = [["cursor", c]];
}

export type ScaleKind = "spacing" | "color" | "table";

export interface ScaleRule {
  /** Class prefix, e.g. `p`, `gap-x`, `bg`. */
  prefix: string;
  /** CSS properties written. */
  props: string[];
  kind: ScaleKind;
  /** Only for `kind: "table"`. Arrays are zipped with `props`. */
  table?: Record<string, string | string[]>;
  /** Extra named keys merged into the scale (e.g. `auto`, `full`). */
  extra?: Record<string, string>;
  /** Accept `1/2`-style fractions. */
  fractions?: boolean;
  /** Accept a leading `-` (negative values). */
  negative?: boolean;
  /** Accept `[...]` arbitrary values of this type. */
  arbitrary?: "length" | "any" | "color" | "none";
  /** Wrap the value, e.g. `scale(0.5)`. */
  format?: (value: string) => string;
  /** Selector suffix appended to the element selector. */
  selector?: string;
  /** Human note printed with the block. */
  note?: string;
}

const SIZE_EXTRA = { auto: "auto", full: "100%", min: "min-content", max: "max-content", fit: "fit-content" };

const spacing = (prefix: string, props: string[], o: Partial<ScaleRule> = {}): ScaleRule => ({ prefix, props, kind: "spacing", arbitrary: "length", ...o });
const table = (prefix: string, props: string[], t: Record<string, string | string[]>, o: Partial<ScaleRule> = {}): ScaleRule => ({ prefix, props, kind: "table", table: t, arbitrary: "any", ...o });
const color = (prefix: string, props: string[], o: Partial<ScaleRule> = {}): ScaleRule => ({ prefix, props, kind: "color", arbitrary: "color", ...o });

const M = { negative: true, fractions: false, extra: { auto: "auto" } };
const INSET = { negative: true, fractions: true, extra: { auto: "auto", full: "100%" } };
const TRANSLATE = { negative: true, fractions: true, extra: { full: "100%" } };

/**
 * Order matters: the first rule whose prefix and value match wins, so width
 * rules for `border` come before the colour rule, and `text` sizes before
 * `text` colours.
 */
export const SCALES: ScaleRule[] = [
  // padding / margin
  spacing("p", ["padding"]),
  spacing("px", ["padding-left", "padding-right"]),
  spacing("py", ["padding-top", "padding-bottom"]),
  spacing("pt", ["padding-top"]),
  spacing("pr", ["padding-right"]),
  spacing("pb", ["padding-bottom"]),
  spacing("pl", ["padding-left"]),
  spacing("ps", ["padding-inline-start"]),
  spacing("pe", ["padding-inline-end"]),
  spacing("m", ["margin"], M),
  spacing("mx", ["margin-left", "margin-right"], M),
  spacing("my", ["margin-top", "margin-bottom"], M),
  spacing("mt", ["margin-top"], M),
  spacing("mr", ["margin-right"], M),
  spacing("mb", ["margin-bottom"], M),
  spacing("ml", ["margin-left"], M),
  spacing("ms", ["margin-inline-start"], M),
  spacing("me", ["margin-inline-end"], M),
  spacing("space-x", ["margin-left"], { negative: true, selector: CHILD_SELECTOR, note: "space-x adds margin between siblings; Tailwind also handles reverse order via --tw-space-x-reverse." }),
  spacing("space-y", ["margin-top"], { negative: true, selector: CHILD_SELECTOR, note: "space-y adds margin between siblings; Tailwind also handles reverse order via --tw-space-y-reverse." }),
  // inset
  spacing("inset", ["inset"], INSET),
  spacing("inset-x", ["left", "right"], INSET),
  spacing("inset-y", ["top", "bottom"], INSET),
  spacing("top", ["top"], INSET),
  spacing("right", ["right"], INSET),
  spacing("bottom", ["bottom"], INSET),
  spacing("left", ["left"], INSET),
  spacing("start", ["inset-inline-start"], INSET),
  spacing("end", ["inset-inline-end"], INSET),
  // sizing
  spacing("w", ["width"], { fractions: true, extra: { ...SIZE_EXTRA, screen: "100vw", svw: "100svw", lvw: "100lvw", dvw: "100dvw" } }),
  spacing("h", ["height"], { fractions: true, extra: { ...SIZE_EXTRA, screen: "100vh", svh: "100svh", lvh: "100lvh", dvh: "100dvh" } }),
  spacing("size", ["width", "height"], { fractions: true, extra: SIZE_EXTRA }),
  spacing("min-w", ["min-width"], { extra: SIZE_EXTRA }),
  spacing("min-h", ["min-height"], { extra: { ...SIZE_EXTRA, screen: "100vh", svh: "100svh", lvh: "100lvh", dvh: "100dvh" } }),
  spacing("max-h", ["max-height"], { extra: { ...SIZE_EXTRA, none: "none", screen: "100vh", svh: "100svh", lvh: "100lvh", dvh: "100dvh" } }),
  table("max-w", ["max-width"], MAX_WIDTH),
  spacing("basis", ["flex-basis"], { fractions: true, extra: { auto: "auto", full: "100%" } }),
  // gap
  spacing("gap", ["gap"]),
  spacing("gap-x", ["column-gap"]),
  spacing("gap-y", ["row-gap"]),
  // grid
  table("grid-cols", ["grid-template-columns"], GRID_COLS),
  table("grid-rows", ["grid-template-rows"], GRID_ROWS),
  table("col-span", ["grid-column"], SPAN),
  table("row-span", ["grid-row"], SPAN),
  table("col-start", ["grid-column-start"], LINE_START),
  table("col-end", ["grid-column-end"], LINE_START),
  table("row-start", ["grid-row-start"], LINE_START),
  table("row-end", ["grid-row-end"], LINE_START),
  table("order", ["order"], ORDER, { negative: true }),
  table("z", ["z-index"], Z_INDEX, { negative: true }),
  // typography
  table("text", ["font-size", "line-height"], FONT_SIZE, { arbitrary: "length" }),
  color("text", ["color"]),
  table("font", ["font-weight"], FONT_WEIGHT, { arbitrary: "none" }),
  table("font", ["font-family"], FONT_FAMILY),
  table("leading", ["line-height"], LINE_HEIGHT),
  table("tracking", ["letter-spacing"], LETTER_SPACING, { negative: true }),
  spacing("indent", ["text-indent"], { negative: true }),
  table("line-clamp", ["overflow", "display", "-webkit-box-orient", "-webkit-line-clamp"], Object.fromEntries(Object.entries(LINE_CLAMP).map(([k, v]) => [k, ["hidden", "-webkit-box", "vertical", v]]))),
  table("decoration", ["text-decoration-thickness"], DECORATION_THICKNESS, { arbitrary: "length" }),
  color("decoration", ["text-decoration-color"]),
  table("underline-offset", ["text-underline-offset"], UNDERLINE_OFFSET, { arbitrary: "length" }),
  // colours
  color("bg", ["background-color"]),
  color("border", ["border-color"]),
  color("border-x", ["border-left-color", "border-right-color"]),
  color("border-y", ["border-top-color", "border-bottom-color"]),
  color("border-t", ["border-top-color"]),
  color("border-r", ["border-right-color"]),
  color("border-b", ["border-bottom-color"]),
  color("border-l", ["border-left-color"]),
  color("divide", ["border-color"], { selector: CHILD_SELECTOR }),
  color("ring", ["--tw-ring-color"]),
  color("ring-offset", ["--tw-ring-offset-color"]),
  color("outline", ["outline-color"]),
  color("shadow", ["--tw-shadow-color"]),
  color("accent", ["accent-color"]),
  color("caret", ["caret-color"]),
  color("fill", ["fill"]),
  color("stroke", ["stroke"]),
  color("from", ["--tw-gradient-from"]),
  color("via", ["--tw-gradient-via"]),
  color("to", ["--tw-gradient-to"]),
  // borders
  table("border", ["border-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-x", ["border-left-width", "border-right-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-y", ["border-top-width", "border-bottom-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-t", ["border-top-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-r", ["border-right-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-b", ["border-bottom-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-l", ["border-left-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-s", ["border-inline-start-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("border-e", ["border-inline-end-width"], BORDER_WIDTH, { arbitrary: "length" }),
  table("divide-x", ["border-right-width", "border-left-width"], Object.fromEntries(Object.entries(BORDER_WIDTH).map(([k, v]) => [k, ["0px", v]])), { selector: CHILD_SELECTOR, arbitrary: "none" }),
  table("divide-y", ["border-top-width", "border-bottom-width"], Object.fromEntries(Object.entries(BORDER_WIDTH).map(([k, v]) => [k, [v, "0px"]])), { selector: CHILD_SELECTOR, arbitrary: "none" }),
  table("rounded", ["border-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-t", ["border-top-left-radius", "border-top-right-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-r", ["border-top-right-radius", "border-bottom-right-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-b", ["border-bottom-right-radius", "border-bottom-left-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-l", ["border-top-left-radius", "border-bottom-left-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-tl", ["border-top-left-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-tr", ["border-top-right-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-br", ["border-bottom-right-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-bl", ["border-bottom-left-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-s", ["border-start-start-radius", "border-end-start-radius"], RADIUS, { arbitrary: "length" }),
  table("rounded-e", ["border-start-end-radius", "border-end-end-radius"], RADIUS, { arbitrary: "length" }),
  table("outline", ["outline-width"], OUTLINE_WIDTH, { arbitrary: "length" }),
  table("outline-offset", ["outline-offset"], OUTLINE_WIDTH, { negative: true, arbitrary: "length" }),
  // effects
  table("shadow", ["box-shadow"], SHADOW),
  table("opacity", ["opacity"], OPACITY, { arbitrary: "any" }),
  table("ring", ["box-shadow"], RING_WIDTH, { format: (v) => `0 0 0 ${v} var(--tw-ring-color, rgb(59 130 246 / 0.5))`, arbitrary: "none" }),
  table("ring-offset", ["--tw-ring-offset-width"], RING_OFFSET, { arbitrary: "length" }),
  table("blur", ["filter"], BLUR, { format: (v) => `blur(${v})` }),
  table("backdrop-blur", ["backdrop-filter"], BLUR, { format: (v) => `blur(${v})` }),
  // transitions
  table("transition", ["transition-property", "transition-timing-function", "transition-duration"], Object.fromEntries(Object.entries(TRANSITION_PROPERTY).filter(([k]) => k !== "none").map(([k, v]) => [k, [v, "cubic-bezier(0.4, 0, 0.2, 1)", "150ms"]])), { arbitrary: "none" }),
  table("duration", ["transition-duration"], DURATION, { arbitrary: "any" }),
  table("delay", ["transition-delay"], DURATION, { arbitrary: "any" }),
  table("ease", ["transition-timing-function"], EASE),
  // transforms (simplified: Tailwind composes these through CSS variables)
  table("scale", ["transform"], SCALE, { format: (v) => `scale(${v})`, arbitrary: "any" }),
  table("scale-x", ["transform"], SCALE, { format: (v) => `scaleX(${v})`, arbitrary: "any" }),
  table("scale-y", ["transform"], SCALE, { format: (v) => `scaleY(${v})`, arbitrary: "any" }),
  table("rotate", ["transform"], ROTATE, { negative: true, format: (v) => `rotate(${v})`, arbitrary: "any" }),
  spacing("translate-x", ["transform"], { ...TRANSLATE, format: (v) => `translateX(${v})` }),
  spacing("translate-y", ["transform"], { ...TRANSLATE, format: (v) => `translateY(${v})` }),
  table("skew-x", ["transform"], SKEW, { negative: true, format: (v) => `skewX(${v})`, arbitrary: "any" }),
  table("skew-y", ["transform"], SKEW, { negative: true, format: (v) => `skewY(${v})`, arbitrary: "any" }),
  // layout misc
  table("aspect", ["aspect-ratio"], ASPECT),
  table("columns", ["columns"], COLUMNS),
  spacing("scroll-m", ["scroll-margin"], { negative: true }),
  spacing("scroll-p", ["scroll-padding"]),
];

export interface Variant {
  /** Pseudo-class / pseudo-element suffix appended to the selector. */
  pseudo?: string;
  /** Media query condition (without `@media`). */
  media?: string;
  /** Selector prefix (ancestor / sibling condition). */
  wrap?: (selector: string) => string;
}

const PSEUDO: Record<string, string> = {
  hover: ":hover",
  focus: ":focus",
  "focus-visible": ":focus-visible",
  "focus-within": ":focus-within",
  active: ":active",
  visited: ":visited",
  target: ":target",
  disabled: ":disabled",
  enabled: ":enabled",
  checked: ":checked",
  indeterminate: ":indeterminate",
  default: ":default",
  required: ":required",
  valid: ":valid",
  invalid: ":invalid",
  "in-range": ":in-range",
  "out-of-range": ":out-of-range",
  "placeholder-shown": ":placeholder-shown",
  autofill: ":autofill",
  "read-only": ":read-only",
  first: ":first-child",
  last: ":last-child",
  only: ":only-child",
  odd: ":nth-child(odd)",
  even: ":nth-child(even)",
  "first-of-type": ":first-of-type",
  "last-of-type": ":last-of-type",
  "only-of-type": ":only-of-type",
  empty: ":empty",
  open: "[open]",
  before: "::before",
  after: "::after",
  placeholder: "::placeholder",
  selection: "::selection",
  marker: "::marker",
  file: "::file-selector-button",
  "first-letter": "::first-letter",
  "first-line": "::first-line",
  backdrop: "::backdrop",
};

export const VARIANTS: Record<string, Variant> = {};
for (const [name, pseudo] of Object.entries(PSEUDO)) VARIANTS[name] = { pseudo };
for (const [name, px] of Object.entries(BREAKPOINTS)) {
  VARIANTS[name] = { media: `(min-width: ${px}px)` };
  VARIANTS[`max-${name}`] = { media: `not all and (min-width: ${px}px)` };
}
VARIANTS.dark = { media: "(prefers-color-scheme: dark)" };
VARIANTS["motion-safe"] = { media: "(prefers-reduced-motion: no-preference)" };
VARIANTS["motion-reduce"] = { media: "(prefers-reduced-motion: reduce)" };
VARIANTS["contrast-more"] = { media: "(prefers-contrast: more)" };
VARIANTS["contrast-less"] = { media: "(prefers-contrast: less)" };
VARIANTS.print = { media: "print" };
VARIANTS.portrait = { media: "(orientation: portrait)" };
VARIANTS.landscape = { media: "(orientation: landscape)" };
VARIANTS.rtl = { wrap: (s) => `[dir="rtl"] ${s}` };
VARIANTS.ltr = { wrap: (s) => `[dir="ltr"] ${s}` };
for (const state of ["hover", "focus", "focus-within", "focus-visible", "active", "disabled", "checked", "invalid", "first", "last", "odd", "even"]) {
  const p = PSEUDO[state];
  VARIANTS[`group-${state}`] = { wrap: (s) => `.group${p} ${s}` };
  VARIANTS[`peer-${state}`] = { wrap: (s) => `.peer${p} ~ ${s}` };
}

/** CSS property -> class prefix, used for arbitrary values in the reverse direction. */
export const PROPERTY_PREFIX: Record<string, string> = {
  padding: "p",
  "padding-left": "pl",
  "padding-right": "pr",
  "padding-top": "pt",
  "padding-bottom": "pb",
  "padding-inline-start": "ps",
  "padding-inline-end": "pe",
  margin: "m",
  "margin-left": "ml",
  "margin-right": "mr",
  "margin-top": "mt",
  "margin-bottom": "mb",
  "margin-inline-start": "ms",
  "margin-inline-end": "me",
  width: "w",
  height: "h",
  "min-width": "min-w",
  "max-width": "max-w",
  "min-height": "min-h",
  "max-height": "max-h",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  inset: "inset",
  gap: "gap",
  "column-gap": "gap-x",
  "row-gap": "gap-y",
  "flex-basis": "basis",
  "z-index": "z",
  order: "order",
  color: "text",
  "font-size": "text",
  "font-weight": "font",
  "font-family": "font",
  "line-height": "leading",
  "letter-spacing": "tracking",
  "text-indent": "indent",
  "background-color": "bg",
  "border-color": "border",
  "border-top-color": "border-t",
  "border-right-color": "border-r",
  "border-bottom-color": "border-b",
  "border-left-color": "border-l",
  "border-width": "border",
  "border-top-width": "border-t",
  "border-right-width": "border-r",
  "border-bottom-width": "border-b",
  "border-left-width": "border-l",
  "border-radius": "rounded",
  "border-top-left-radius": "rounded-tl",
  "border-top-right-radius": "rounded-tr",
  "border-bottom-right-radius": "rounded-br",
  "border-bottom-left-radius": "rounded-bl",
  "box-shadow": "shadow",
  opacity: "opacity",
  "outline-color": "outline",
  "outline-width": "outline",
  "outline-offset": "outline-offset",
  "text-decoration-color": "decoration",
  "text-decoration-thickness": "decoration",
  "text-underline-offset": "underline-offset",
  "accent-color": "accent",
  "caret-color": "caret",
  fill: "fill",
  stroke: "stroke",
  "grid-template-columns": "grid-cols",
  "grid-template-rows": "grid-rows",
  "grid-column": "col",
  "grid-row": "row",
  "grid-column-start": "col-start",
  "grid-column-end": "col-end",
  "grid-row-start": "row-start",
  "grid-row-end": "row-end",
  "transition-duration": "duration",
  "transition-delay": "delay",
  "transition-timing-function": "ease",
  "transition-property": "transition",
  "aspect-ratio": "aspect",
  columns: "columns",
  filter: "filter",
  "backdrop-filter": "backdrop-filter",
  transform: "transform",
  "scroll-margin": "scroll-m",
  "scroll-padding": "scroll-p",
};

/** Properties whose lengths can be snapped to the spacing scale. */
export const SPACING_PROPERTIES = new Set([
  "padding",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "padding-inline-start",
  "padding-inline-end",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "margin-inline-start",
  "margin-inline-end",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "gap",
  "column-gap",
  "row-gap",
  "flex-basis",
  "text-indent",
  "scroll-margin",
  "scroll-padding",
]);

/** Colour-valued properties (for the reverse direction). */
export const COLOR_PROPERTIES = new Set(["color", "background-color", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "outline-color", "text-decoration-color", "accent-color", "caret-color", "fill", "stroke", "--tw-ring-color", "--tw-gradient-from", "--tw-gradient-via", "--tw-gradient-to"]);
