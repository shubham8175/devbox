import { cronRuns } from "@/lib/tools/cron";

export const MAX_CRON_COMPARE = 10;
export const CRON_COMPARE_SAMPLE = ["0 * * * *", "*/15 * * * *", "0 9 * * 1-5"];
/** How far ahead collisions and run rates are counted. A week covers weekday/weekend patterns. */
export const CRON_WINDOW_DAYS = 7;

/** Cron fields are space-separated, so a pasted list only splits on newlines. */
export function splitCronPaste(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CronCompareEntry {
  /** 1-based field number. */
  line: number;
  input: string;
  description: string;
  /** Runs inside the window (capped at one per minute, so never more than the window's minutes). */
  runsInWindow: number;
}

export interface TimelineItem {
  date: Date;
  /** Field numbers of every expression firing at this minute. */
  lines: number[];
}

export interface CollisionGroup {
  /** Field numbers firing together, e.g. [1, 2]. */
  lines: number[];
  /** Minutes in the window where exactly this set fires together. */
  count: number;
  /** The first few of those minutes. */
  next: Date[];
}

export interface CronCompareResult {
  entries: CronCompareEntry[];
  errors: Array<{ line: number; input: string; error: string }>;
  /** The next `timelineSize` distinct minutes at which any expression fires. */
  timeline: TimelineItem[];
  collisions: CollisionGroup[];
  /** Minutes in the window where two or more expressions fire. */
  collisionMinutes: number;
}

/**
 * Merges the schedules of several cron expressions from `from` (local time): an upcoming-runs
 * timeline and the minutes where two or more fire at once, over the next CRON_WINDOW_DAYS.
 */
export function compareCron(values: string[], from: Date, timelineSize = 20): CronCompareResult {
  const until = new Date(from.getTime() + CRON_WINDOW_DAYS * 86_400_000);
  const windowMinutes = CRON_WINDOW_DAYS * 24 * 60;
  const entries: CronCompareEntry[] = [];
  const errors: CronCompareResult["errors"] = [];
  // Minute timestamp → field numbers firing then. Insertion order doesn't matter; sorted below.
  const byMinute = new Map<number, number[]>();

  values.forEach((raw, i) => {
    const input = raw.trim();
    if (!input) return;
    const line = i + 1;
    // At least `timelineSize` runs even when they fall past the window, so sparse schedules still show up.
    const inWindow = cronRuns(input, from, windowMinutes, until);
    if (inWindow.error !== undefined) {
      errors.push({ line, input, error: inWindow.error });
      return;
    }
    const extra = inWindow.runs.length < timelineSize ? cronRuns(input, from, timelineSize) : null;
    const runs = extra && extra.error === undefined ? extra.runs : inWindow.runs;
    entries.push({ line, input, description: inWindow.description, runsInWindow: inWindow.runs.length });
    for (const d of runs) {
      const t = d.getTime();
      const at = byMinute.get(t);
      if (at) at.push(line);
      else byMinute.set(t, [line]);
    }
  });

  const times = Array.from(byMinute.keys()).sort((a, b) => a - b);
  const timeline = times.slice(0, timelineSize).map((t) => ({ date: new Date(t), lines: byMinute.get(t)! }));

  const groups = new Map<string, CollisionGroup>();
  let collisionMinutes = 0;
  for (const t of times) {
    const lines = byMinute.get(t)!;
    if (lines.length < 2 || t > until.getTime()) continue;
    collisionMinutes++;
    const key = lines.join(",");
    const g = groups.get(key) ?? { lines, count: 0, next: [] };
    g.count++;
    if (g.next.length < 3) g.next.push(new Date(t));
    groups.set(key, g);
  }
  const collisions = Array.from(groups.values()).sort((a, b) => b.count - a.count || a.next[0].getTime() - b.next[0].getTime());

  return { entries, errors, timeline, collisions, collisionMinutes };
}

/** "24/day" when an expression fires at least daily on average, else "5/week". */
export function runRate(runsInWindow: number): string {
  const perDay = runsInWindow / CRON_WINDOW_DAYS;
  if (perDay >= 1) return `${Number.isInteger(perDay) ? perDay : perDay.toFixed(1)}/day`;
  return `${runsInWindow}/week`;
}
