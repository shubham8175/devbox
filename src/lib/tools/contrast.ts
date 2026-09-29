import { hslToRgb, luminance, parseColor, rgbToHex, rgbToHsl, type RGBA } from "@/lib/tools/color";

/**
 * WCAG 2.x contrast. `luminance` in color.ts is the sRGB-linearised relative
 * luminance formula from WCAG 2.0 (0.03928 threshold, 2.4 gamma), so it is
 * reused here rather than re-implemented.
 */

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Alpha-composite `top` over `bottom` (bottom is first flattened over white if it is translucent). */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const base = bottom.a < 1 ? composite(bottom, { r: 255, g: 255, b: 255, a: 1 }) : bottom;
  const a = Math.min(1, Math.max(0, top.a));
  if (a >= 1) return { r: top.r, g: top.g, b: top.b, a: 1 };
  return {
    r: Math.round(top.r * a + base.r * (1 - a)),
    g: Math.round(top.g * a + base.g * (1 - a)),
    b: Math.round(top.b * a + base.b * (1 - a)),
    a: 1,
  };
}

/** Contrast ratio 1..21. The foreground is composited over the background first, as a browser would paint it. */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const back = bg.a < 1 ? composite(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const front = composite(fg, back);
  const l1 = luminance(front);
  const l2 = luminance(back);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface WcagGrades {
  /** Body text (< 18pt / < 14pt bold): 4.5:1 */
  normalAA: boolean;
  /** Body text, enhanced: 7:1 */
  normalAAA: boolean;
  /** Large text (≥ 18pt or ≥ 14pt bold): 3:1 */
  largeAA: boolean;
  /** Large text, enhanced: 4.5:1 */
  largeAAA: boolean;
  /** Non-text UI components and graphics (WCAG 1.4.11): 3:1 */
  uiAA: boolean;
}

export const WCAG_THRESHOLDS = { normalAA: 4.5, normalAAA: 7, largeAA: 3, largeAAA: 4.5, uiAA: 3 } as const;

export function wcagGrades(ratio: number): WcagGrades {
  return {
    normalAA: ratio >= WCAG_THRESHOLDS.normalAA,
    normalAAA: ratio >= WCAG_THRESHOLDS.normalAAA,
    largeAA: ratio >= WCAG_THRESHOLDS.largeAA,
    largeAAA: ratio >= WCAG_THRESHOLDS.largeAAA,
    uiAA: ratio >= WCAG_THRESHOLDS.uiAA,
  };
}

/** Format a ratio the way audit tools print it: `4.54:1`. */
export function formatRatio(ratio: number): string {
  return `${round(ratio, 2).toFixed(2)}:1`;
}

export interface Suggestion {
  ok: true;
  /** Hex of the adjusted foreground (alpha preserved from the input). */
  hex: string;
  color: RGBA;
  ratio: number;
  /** Number of 1 % lightness steps applied. 0 means the input already passes. */
  steps: number;
  direction: "darker" | "lighter" | "none";
}

export interface SuggestionError {
  ok: false;
  error: string;
}

const MAX_STEPS = 100;

function walk(fg: RGBA, bg: RGBA, target: number, dir: -1 | 1): { color: RGBA; ratio: number; steps: number } | null {
  const hsl = rgbToHsl(fg);
  for (let steps = 1; steps <= MAX_STEPS; steps++) {
    const l = hsl.l + dir * steps;
    if (l < 0 || l > 100) return null;
    const candidate = hslToRgb({ ...hsl, l });
    const ratio = contrastRatio(candidate, bg);
    if (ratio >= target) return { color: candidate, ratio, steps };
  }
  return null;
}

/**
 * Nudge the foreground's HSL lightness in 1 % steps towards black or white
 * until `target` is met. Both directions are tried; the one needing fewer
 * steps (closest to the original colour) wins.
 */
export function suggestAccessible(fg: RGBA, bg: RGBA, target = 4.5): Suggestion | SuggestionError {
  if (!Number.isFinite(target) || target < 1 || target > 21) return { ok: false, error: "Target ratio must be between 1 and 21." };
  const current = contrastRatio(fg, bg);
  if (current >= target) return { ok: true, hex: rgbToHex(fg, fg.a < 1), color: fg, ratio: current, steps: 0, direction: "none" };
  const darker = walk(fg, bg, target, -1);
  const lighter = walk(fg, bg, target, 1);
  const pick = darker && lighter ? (darker.steps <= lighter.steps ? darker : lighter) : (darker ?? lighter);
  if (!pick) {
    return { ok: false, error: `No lightness of this hue reaches ${target}:1 on this background. Try a different background or hue.` };
  }
  return {
    ok: true,
    hex: rgbToHex(pick.color, pick.color.a < 1),
    color: pick.color,
    ratio: pick.ratio,
    steps: pick.steps,
    direction: pick === darker ? "darker" : "lighter",
  };
}

/** Swap foreground and background. */
export function swap<T>(pair: { fg: T; bg: T }): { fg: T; bg: T } {
  return { fg: pair.bg, bg: pair.fg };
}

/** Parse two colour strings and compute everything the UI needs in one go. */
export function checkContrast(fgText: string, bgText: string, target = 4.5) {
  const fg = parseColor(fgText);
  const bg = parseColor(bgText);
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  return { fg, bg, ratio, grades: wcagGrades(ratio), suggestion: suggestAccessible(fg, bg, target) };
}

export interface ContrastPair {
  name: string;
  fg: string;
  bg: string;
}

export const CONTRAST_SAMPLE: ContrastPair = { name: "Grey on white", fg: "#767676", bg: "#ffffff" };

/** Token pairs from this app's own themes (src/app/globals.css) plus a few classics. */
export const CONTRAST_PAIRS_SAMPLE: ContrastPair[] = [
  { name: "Dark · text on page", fg: "#e8eaf0", bg: "#0a0b0e" },
  { name: "Dark · muted on surface", fg: "#9ea4b2", bg: "#15181e" },
  { name: "Dark · subtle on surface", fg: "#6e7483", bg: "#15181e" },
  { name: "Dark · white on accent", fg: "#ffffff", bg: "#7c8cff" },
  { name: "Dark · accent on elevated", fg: "#98a4ff", bg: "#101217" },
  { name: "Light · text on page", fg: "#15171c", bg: "#f7f8fa" },
  { name: "Light · muted on surface", fg: "#5b6170", bg: "#ffffff" },
  { name: "Light · subtle on surface", fg: "#8a8f9c", bg: "#ffffff" },
  { name: "Light · white on accent", fg: "#ffffff", bg: "#4f5fe6" },
  { name: "Light · accent on surface", fg: "#3b4bd1", bg: "#ffffff" },
  { name: "Black on white", fg: "#000000", bg: "#ffffff" },
  { name: "Placeholder grey", fg: "#9ca3af", bg: "#ffffff" },
];
