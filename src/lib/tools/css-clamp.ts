export type ClampUnit = "px" | "rem";

export interface ClampInput {
  /** In `unit`. */
  minSize: number;
  maxSize: number;
  /** Always px. */
  minViewport: number;
  maxViewport: number;
  unit: ClampUnit;
  rootFontSize: number;
  precision: number;
}

export const CLAMP_DEFAULTS: ClampInput = { minSize: 16, maxSize: 24, minViewport: 360, maxViewport: 1280, unit: "px", rootFontSize: 16, precision: 4 };

export const COMMON_VIEWPORTS = [360, 768, 1024, 1280, 1536, 1920] as const;

export interface ClampResult {
  ok: true;
  minPx: number;
  maxPx: number;
  /** px of size per px of viewport. */
  slope: number;
  /** px at viewport 0. */
  interceptPx: number;
  clampRem: string;
  clampPx: string;
  calcFallback: string;
  tailwind: string;
  samples: Array<{ viewport: number; px: number; rem: number }>;
  warning?: string;
}

export interface ClampError {
  ok: false;
  error: string;
}

const LIMITS = { maxSize: 10_000, maxViewport: 20_000, maxPrecision: 8 } as const;

/** Number with at most `places` decimals and no trailing zeros. */
export function fmt(n: number, places: number): string {
  const p = Math.min(LIMITS.maxPrecision, Math.max(0, Math.round(places)));
  const s = n.toFixed(p);
  const t = s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  return t === "-0" ? "0" : t;
}

function validate(i: ClampInput): string | null {
  const nums = [i.minSize, i.maxSize, i.minViewport, i.maxViewport, i.rootFontSize, i.precision];
  if (nums.some((n) => !Number.isFinite(n))) return "All inputs must be numbers.";
  if (i.rootFontSize <= 0) return "Root font size must be positive.";
  if (i.minSize < 0 || i.maxSize < 0) return "Sizes cannot be negative.";
  if (i.minViewport <= 0 || i.maxViewport <= 0) return "Viewports must be positive.";
  if (i.minViewport === i.maxViewport) return "Min and max viewport must differ, otherwise the slope is undefined.";
  if (i.minViewport > i.maxViewport) return "Min viewport must be smaller than max viewport.";
  const px = i.unit === "rem" ? i.rootFontSize : 1;
  if (i.minSize * px > LIMITS.maxSize || i.maxSize * px > LIMITS.maxSize) return `Sizes above ${LIMITS.maxSize}px are not supported.`;
  if (i.maxViewport > LIMITS.maxViewport) return `Viewports above ${LIMITS.maxViewport}px are not supported.`;
  return null;
}

function toPx(size: number, i: ClampInput): number {
  return i.unit === "rem" ? size * i.rootFontSize : size;
}

/** Fluid size in px at a given viewport width (clamped to the two sizes, whichever order they are in). */
export function sizeAtViewport(i: ClampInput, viewport: number): number {
  const minPx = toPx(i.minSize, i);
  const maxPx = toPx(i.maxSize, i);
  const slope = (maxPx - minPx) / (i.maxViewport - i.minViewport);
  const raw = minPx + slope * (viewport - i.minViewport);
  return Math.min(Math.max(raw, Math.min(minPx, maxPx)), Math.max(minPx, maxPx));
}

export function computeClamp(i: ClampInput): ClampResult | ClampError {
  const error = validate(i);
  if (error) return { ok: false, error };
  const p = i.precision;
  const root = i.rootFontSize;
  const minPx = toPx(i.minSize, i);
  const maxPx = toPx(i.maxSize, i);
  const slope = (maxPx - minPx) / (i.maxViewport - i.minViewport);
  const interceptPx = minPx - slope * i.minViewport;
  const vw = slope * 100;

  const lowPx = Math.min(minPx, maxPx);
  const highPx = Math.max(minPx, maxPx);
  const sign = interceptPx < 0 ? "-" : "";
  const absIntercept = Math.abs(interceptPx);
  const vwStr = `${fmt(vw, p)}vw`;

  const preferredRem = `calc(${sign}${fmt(absIntercept / root, p)}rem + ${vwStr})`;
  const preferredPx = `calc(${sign}${fmt(absIntercept, p)}px + ${vwStr})`;
  const clampRem = `clamp(${fmt(lowPx / root, p)}rem, ${preferredRem}, ${fmt(highPx / root, p)}rem)`;
  const clampPx = `clamp(${fmt(lowPx, p)}px, ${preferredPx}, ${fmt(highPx, p)}px)`;
  const calcFallback = preferredRem;
  // Tailwind arbitrary values: no spaces after commas, remaining spaces become underscores.
  const tailwind = `text-[${clampRem.replace(/,\s+/g, ",").replace(/\s+/g, "_")}]`;

  const samples = COMMON_VIEWPORTS.map((viewport) => {
    const px = sizeAtViewport(i, viewport);
    return { viewport, px: Math.round(px * 100) / 100, rem: Math.round((px / root) * 10000) / 10000 };
  });

  let warning: string | undefined;
  if (minPx > maxPx) warning = "Minimum is larger than maximum: the size shrinks as the viewport grows. The clamp bounds were swapped so it stays valid.";
  else if (minPx === maxPx) warning = "Min and max are equal, so the value never changes. A plain length would do.";

  return { ok: true, minPx, maxPx, slope, interceptPx, clampRem, clampPx, calcFallback, tailwind, samples, warning };
}

export const TYPE_SCALE_RATIOS: Array<{ value: number; name: string }> = [
  { value: 1.125, name: "Major second" },
  { value: 1.2, name: "Minor third" },
  { value: 1.25, name: "Major third" },
  { value: 1.333, name: "Perfect fourth" },
  { value: 1.5, name: "Perfect fifth" },
  { value: 1.618, name: "Golden ratio" },
];

export const TYPE_SCALE_STEPS = [-2, -1, 0, 1, 2, 3, 4, 5] as const;

export interface TypeScaleStep {
  step: number;
  name: string;
  minSize: number;
  maxSize: number;
  clamp: string;
}

export interface TypeScaleResult {
  ok: true;
  steps: TypeScaleStep[];
  css: string;
}

/** Fluid type scale: the base clamp multiplied by `ratio` per step, as CSS custom properties. */
export function typeScale(base: ClampInput, ratio: number): TypeScaleResult | ClampError {
  if (!Number.isFinite(ratio) || ratio <= 1 || ratio > 3) return { ok: false, error: "Ratio must be between 1 and 3." };
  const steps: TypeScaleStep[] = [];
  for (const step of TYPE_SCALE_STEPS) {
    const factor = ratio ** step;
    const input: ClampInput = { ...base, minSize: base.minSize * factor, maxSize: base.maxSize * factor };
    const r = computeClamp(input);
    if (!r.ok) return r;
    const name = `--step-${step < 0 ? `-${-step}` : step}`;
    steps.push({ step, name, minSize: Math.round(input.minSize * 1000) / 1000, maxSize: Math.round(input.maxSize * 1000) / 1000, clamp: r.clampRem });
  }
  const css = `:root {\n${steps.map((s) => `  ${s.name}: ${s.clamp};`).join("\n")}\n}`;
  return { ok: true, steps, css };
}

export const CSS_CLAMP_SAMPLE = CLAMP_DEFAULTS;
