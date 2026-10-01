import { humanDuration, isValidDate, splitDuration } from "@/lib/tools/time";
import { parseEpochValue, type ParsedValue } from "@/lib/tools/time-compare";

/** Sample for the Timeline (multi-date) card; local date-times, like the two-date inputs above it. */
/**
 * Timeline values: like the epoch parser, except a bare date ("2024-01-15") is local midnight.
 * JS reads date-only ISO strings as UTC, which would put them hours away from local date-times in the same list.
 */
export function parseTimelineValue(raw: string): ParsedValue {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isValidDate(d) && d.getDate() === Number(m[3])) return { date: d };
    return { date: null, error: `${raw.trim()} is not a valid date.` };
  }
  return parseEpochValue(raw);
}

export const DATE_TIMELINE_SAMPLE = ["2024-01-15 09:00", "2024-03-01 17:30", "2024-12-31 23:59:59"];

export interface DateDiffResult {
  ok: true;
  ms: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  parts: ReturnType<typeof splitDuration>;
  human: string;
  direction: "future" | "past" | "same";
  calendar: { years: number; months: number; days: number };
}

export interface DateDiffError {
  ok: false;
  error: string;
}

/** Calendar-aware Y/M/D difference (like "2 years, 3 months, 4 days"). */
function calendarDiff(from: Date, to: Date): { years: number; months: number; days: number } {
  const [a, b] = from <= to ? [from, to] : [to, from];
  let years = b.getFullYear() - a.getFullYear();
  let months = b.getMonth() - a.getMonth();
  let days = b.getDate() - a.getDate();
  if (days < 0) {
    months--;
    const prevMonth = new Date(b.getFullYear(), b.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, days };
}

export function diffDates(aRaw: string, bRaw: string): DateDiffResult | DateDiffError {
  if (!aRaw || !bRaw) return { ok: false, error: "Enter both dates." };
  const a = new Date(aRaw);
  const b = new Date(bRaw);
  if (!isValidDate(a)) return { ok: false, error: "Date A is not a valid date." };
  if (!isValidDate(b)) return { ok: false, error: "Date B is not a valid date." };
  const ms = b.getTime() - a.getTime();
  return {
    ok: true,
    ms,
    totalDays: ms / 86_400_000,
    totalHours: ms / 3_600_000,
    totalMinutes: ms / 60_000,
    totalSeconds: ms / 1000,
    parts: splitDuration(ms),
    human: humanDuration(ms),
    direction: ms > 0 ? "future" : ms < 0 ? "past" : "same",
    calendar: calendarDiff(a, b),
  };
}
