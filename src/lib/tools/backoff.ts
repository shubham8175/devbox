export type JitterMode = "none" | "full" | "equal" | "decorrelated";

export interface BackoffOptions {
  initialDelay: number;
  multiplier: number;
  maxRetries: number;
  maxDelay: number;
  jitter: JitterMode;
}

export interface BackoffStep {
  attempt: number;
  baseDelay: number;
  delay: number;
  cumulative: number;
}

export const JITTER_MODES: Array<{ id: JitterMode; label: string; hint: string }> = [
  { id: "none", label: "None", hint: "delay = base × multiplier^attempt (capped)" },
  { id: "full", label: "Full", hint: "random(0, base) — best at spreading thundering herds" },
  { id: "equal", label: "Equal", hint: "base/2 + random(0, base/2) — keeps a minimum wait" },
  { id: "decorrelated", label: "Decorrelated", hint: "random(initial, previous × 3), capped — AWS style" },
];

/** Deterministic PRNG so the preview is stable until the user re-rolls. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeSchedule(opts: BackoffOptions, seed = 1): BackoffStep[] {
  const rand = mulberry32(seed);
  const steps: BackoffStep[] = [];
  const retries = Math.max(0, Math.min(50, Math.floor(opts.maxRetries)));
  const initial = Math.max(0, opts.initialDelay);
  const mult = Math.max(1, opts.multiplier);
  const cap = Math.max(0, opts.maxDelay);
  let cumulative = 0;
  let previous = initial;
  for (let i = 1; i <= retries; i++) {
    const base = Math.min(cap, initial * Math.pow(mult, i - 1));
    let delay: number;
    switch (opts.jitter) {
      case "full":
        delay = rand() * base;
        break;
      case "equal":
        delay = base / 2 + rand() * (base / 2);
        break;
      case "decorrelated":
        delay = Math.min(cap, initial + rand() * (previous * 3 - initial));
        previous = delay;
        break;
      default:
        delay = base;
    }
    delay = Math.round(delay);
    cumulative += delay;
    steps.push({ attempt: i, baseDelay: Math.round(base), delay, cumulative });
  }
  return steps;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 ? 2 : 0)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  if (m < 60) return s ? `${m}m ${s}s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
