export type CssUnit = "px" | "rem" | "em" | "%" | "pt";

export const CSS_UNITS: CssUnit[] = ["px", "rem", "em", "%", "pt"];

export interface UnitContext {
  /** Root (html) font size in px, used by rem */
  root: number;
  /** Parent font size in px, used by em and % */
  parent: number;
}

const PT_PER_PX = 0.75;

/** Convert a value in `unit` to pixels. */
export function toPx(value: number, unit: CssUnit, ctx: UnitContext): number {
  switch (unit) {
    case "px":
      return value;
    case "rem":
      return value * ctx.root;
    case "em":
      return value * ctx.parent;
    case "%":
      return (value / 100) * ctx.parent;
    case "pt":
      return value / PT_PER_PX;
  }
}

/** Convert pixels to `unit`. */
export function fromPx(px: number, unit: CssUnit, ctx: UnitContext): number {
  switch (unit) {
    case "px":
      return px;
    case "rem":
      return ctx.root ? px / ctx.root : 0;
    case "em":
      return ctx.parent ? px / ctx.parent : 0;
    case "%":
      return ctx.parent ? (px / ctx.parent) * 100 : 0;
    case "pt":
      return px * PT_PER_PX;
  }
}

export function convertAllUnits(value: number, unit: CssUnit, ctx: UnitContext): Record<CssUnit, number> {
  const px = toPx(value, unit, ctx);
  return Object.fromEntries(CSS_UNITS.map((u) => [u, fromPx(px, u, ctx)])) as Record<CssUnit, number>;
}

/** Trim floating noise: up to 4 decimals, no trailing zeros. */
export function formatUnit(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}

export const COMMON_PX_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96];
