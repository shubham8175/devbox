export type BezierPoints = [number, number, number, number];

/** CSS keyword curves. */
export const NAMED_CURVES: Record<string, BezierPoints> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Vertical overshoot allowed for the handles (CSS itself allows any y). */
export const Y_RANGE = { min: -0.5, max: 1.5 } as const;

export interface BezierPreset {
  name: string;
  points: BezierPoints;
  group: "css" | "sine" | "quad" | "cubic" | "quart" | "expo" | "circ" | "back";
}

export const PRESETS: BezierPreset[] = [
  { name: "linear", points: [0, 0, 1, 1], group: "css" },
  { name: "ease", points: [0.25, 0.1, 0.25, 1], group: "css" },
  { name: "ease-in", points: [0.42, 0, 1, 1], group: "css" },
  { name: "ease-out", points: [0, 0, 0.58, 1], group: "css" },
  { name: "ease-in-out", points: [0.42, 0, 0.58, 1], group: "css" },
  { name: "easeInSine", points: [0.12, 0, 0.39, 0], group: "sine" },
  { name: "easeOutSine", points: [0.61, 1, 0.88, 1], group: "sine" },
  { name: "easeInOutSine", points: [0.37, 0, 0.63, 1], group: "sine" },
  { name: "easeInQuad", points: [0.11, 0, 0.5, 0], group: "quad" },
  { name: "easeOutQuad", points: [0.5, 1, 0.89, 1], group: "quad" },
  { name: "easeInOutQuad", points: [0.45, 0, 0.55, 1], group: "quad" },
  { name: "easeInCubic", points: [0.32, 0, 0.67, 0], group: "cubic" },
  { name: "easeOutCubic", points: [0.33, 1, 0.68, 1], group: "cubic" },
  { name: "easeInOutCubic", points: [0.65, 0, 0.35, 1], group: "cubic" },
  { name: "easeInQuart", points: [0.5, 0, 0.75, 0], group: "quart" },
  { name: "easeOutQuart", points: [0.25, 1, 0.5, 1], group: "quart" },
  { name: "easeInOutQuart", points: [0.76, 0, 0.24, 1], group: "quart" },
  { name: "easeInExpo", points: [0.7, 0, 0.84, 0], group: "expo" },
  { name: "easeOutExpo", points: [0.16, 1, 0.3, 1], group: "expo" },
  { name: "easeInOutExpo", points: [0.87, 0, 0.13, 1], group: "expo" },
  { name: "easeInCirc", points: [0.55, 0, 1, 0.45], group: "circ" },
  { name: "easeOutCirc", points: [0, 0.55, 0.45, 1], group: "circ" },
  { name: "easeInOutCirc", points: [0.85, 0, 0.15, 1], group: "circ" },
  { name: "easeInBack", points: [0.36, 0, 0.66, -0.56], group: "back" },
  { name: "easeOutBack", points: [0.34, 1.56, 0.64, 1], group: "back" },
  { name: "easeInOutBack", points: [0.68, -0.6, 0.32, 1.6], group: "back" },
];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const trim = (n: number, places = 3) => String(Math.round(n * 10 ** places) / 10 ** places);

export interface ParsedBezier {
  ok: true;
  points: BezierPoints;
  /** Set when the input was a CSS keyword. */
  name?: string;
}

export interface BezierError {
  ok: false;
  error: string;
}

/** Accepts `cubic-bezier(a, b, c, d)`, bare `a, b, c, d` (comma or space separated) or a CSS keyword. */
export function parseBezier(text: string): ParsedBezier | BezierError {
  const input = text.trim().toLowerCase().slice(0, 200);
  if (!input) return { ok: false, error: "Enter a cubic-bezier() value or a keyword such as ease-in-out." };
  const named = Object.prototype.hasOwnProperty.call(NAMED_CURVES, input) ? NAMED_CURVES[input] : undefined;
  if (named) return { ok: true, points: [...named] as BezierPoints, name: input };
  const fn = /^cubic-bezier\(\s*(.*?)\s*\)$/.exec(input);
  const body = fn ? fn[1] : input;
  const parts = body.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 4) return { ok: false, error: `Expected four numbers, found ${parts.length}.` };
  const nums = parts.map((p) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isFinite(n))) return { ok: false, error: "All four values must be numbers." };
  const [x1, y1, x2, y2] = nums;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return { ok: false, error: "x1 and x2 must be between 0 and 1 (time cannot run backwards)." };
  if (Math.abs(y1) > 10 || Math.abs(y2) > 10) return { ok: false, error: "y1 and y2 must be between -10 and 10." };
  return { ok: true, points: [x1, y1, x2, y2] };
}

export function formatBezier(points: BezierPoints, places = 3): string {
  return `cubic-bezier(${points.map((p) => trim(p, places)).join(", ")})`;
}

/** Point on the curve for parameter t in 0..1 (P0 = (0,0), P3 = (1,1)). */
export function bezierPoint(t: number, [x1, y1, x2, y2]: BezierPoints): { x: number; y: number } {
  const mt = 1 - t;
  const a = 3 * mt * mt * t;
  const b = 3 * mt * t * t;
  const c = t * t * t;
  return { x: a * x1 + b * x2 + c, y: a * y1 + b * y2 + c };
}

export function sampleCurve(points: BezierPoints, steps = 32): Array<{ x: number; y: number }> {
  const n = clamp(Math.round(steps), 1, 1000);
  return Array.from({ length: n + 1 }, (_, i) => bezierPoint(i / n, points));
}

/**
 * SVG path in a `size` x `size` box with y pointing up. Values outside 0..1
 * overshoot the box, which is expected for "back" easings.
 */
export function buildSvgPath(points: BezierPoints, size: number): string {
  const [x1, y1, x2, y2] = points;
  const px = (x: number) => trim(x * size, 2);
  const py = (y: number) => trim(size - y * size, 2);
  return `M 0 ${size} C ${px(x1)} ${py(y1)}, ${px(x2)} ${py(y2)}, ${size} 0`;
}

/** Progress (y) at time x, solved the way browsers do: Newton-Raphson, then bisection. */
export function solveBezierY(x: number, points: BezierPoints): number {
  const [x1, , x2] = points;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleDx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const target = clamp(x, 0, 1);
  if (target === 0) return 0;
  if (target === 1) return 1;

  let t = target;
  for (let i = 0; i < 8; i++) {
    const err = sampleX(t) - target;
    if (Math.abs(err) < 1e-7) return bezierPoint(t, points).y;
    const d = sampleDx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = target;
  while (hi - lo > 1e-7) {
    const err = sampleX(t) - target;
    if (Math.abs(err) < 1e-7) break;
    if (err > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return bezierPoint(t, points).y;
}

export const TABLE_STOPS = [0, 25, 50, 75, 100] as const;

export function easingTable(points: BezierPoints): Array<{ percent: number; progress: number }> {
  return TABLE_STOPS.map((percent) => ({ percent, progress: Math.round(solveBezierY(percent / 100, points) * 10000) / 10000 }));
}

const TAILWIND_EASINGS: Array<{ cls: string; points: BezierPoints }> = [
  { cls: "ease-linear", points: [0, 0, 1, 1] },
  { cls: "ease-in", points: [0.4, 0, 1, 1] },
  { cls: "ease-out", points: [0, 0, 0.2, 1] },
  { cls: "ease-in-out", points: [0.4, 0, 0.2, 1] },
];

export function bezierToTailwind(points: BezierPoints): string {
  const hit = TAILWIND_EASINGS.find((e) => e.points.every((p, i) => Math.abs(p - points[i]) < 1e-6));
  if (hit) return hit.cls;
  return `ease-[cubic-bezier(${points.map((p) => trim(p)).join(",")})]`;
}

/** Everything the UI prints for one curve. */
export function bezierOutputs(points: BezierPoints) {
  const value = formatBezier(points);
  return {
    value,
    transition: `transition: all 300ms ${value};`,
    animation: `animation-timing-function: ${value};`,
    tailwind: bezierToTailwind(points),
    table: easingTable(points),
  };
}

export const CUBIC_BEZIER_SAMPLE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
