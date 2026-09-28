/** Shared date formatting helpers used by several time-related tools. */

export function formatLocal(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(date);
}

export function formatUTC(date: Date): string {
  return date.toUTCString();
}

export function formatISO(date: Date): string {
  return date.toISOString();
}

export function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
  ["second", 1000],
];

/** "3 hours ago" / "in 2 days" */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "now";
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

export function splitDuration(ms: number): DurationParts {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const milliseconds = abs % 1000;
  return { days, hours, minutes, seconds, milliseconds };
}

/** "2 days, 3 hours, 4 minutes" */
export function humanDuration(ms: number): string {
  const p = splitDuration(ms);
  const parts: string[] = [];
  if (p.days) parts.push(`${p.days} ${p.days === 1 ? "day" : "days"}`);
  if (p.hours) parts.push(`${p.hours} ${p.hours === 1 ? "hour" : "hours"}`);
  if (p.minutes) parts.push(`${p.minutes} ${p.minutes === 1 ? "minute" : "minutes"}`);
  if (p.seconds) parts.push(`${p.seconds} ${p.seconds === 1 ? "second" : "seconds"}`);
  if (!parts.length) {
    if (p.milliseconds) return `${p.milliseconds} ms`;
    return "0 seconds";
  }
  return parts.join(", ");
}

/** Convert a Date to the value format used by <input type="datetime-local"> (local time). */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
