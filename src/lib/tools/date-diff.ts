import { humanDuration, isValidDate, splitDuration } from "@/lib/tools/time";

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
