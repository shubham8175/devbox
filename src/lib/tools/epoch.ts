import { formatISO, formatLocal, formatUTC, isValidDate, relativeTime } from "@/lib/tools/time";

export type EpochInputKind = "seconds" | "milliseconds" | "iso" | "empty" | "invalid";

export interface EpochResult {
  kind: EpochInputKind;
  date: Date | null;
  error?: string;
  outputs: {
    local: string;
    utc: string;
    iso: string;
    seconds: string;
    milliseconds: string;
    relative: string;
  } | null;
}

/** Timestamps at or above this are treated as milliseconds (≈ year 2286 in seconds). */
const MS_THRESHOLD = 1e11;

/**
 * Parse a user string as Unix seconds, Unix milliseconds or an ISO/date string.
 * Purely numeric input is auto-detected by magnitude.
 */
export function parseEpochInput(raw: string, now: Date = new Date()): EpochResult {
  const input = raw.trim();
  if (!input) return { kind: "empty", date: null, outputs: null };

  let date: Date | null = null;
  let kind: EpochInputKind = "invalid";

  if (/^-?\d+(\.\d+)?$/.test(input)) {
    const n = Number(input);
    if (!Number.isFinite(n)) {
      return { kind: "invalid", date: null, outputs: null, error: "Number is out of range." };
    }
    if (Math.abs(n) >= MS_THRESHOLD) {
      kind = "milliseconds";
      date = new Date(n);
    } else {
      kind = "seconds";
      date = new Date(n * 1000);
    }
  } else {
    const d = new Date(input);
    if (isValidDate(d)) {
      kind = "iso";
      date = d;
    }
  }

  if (!date || !isValidDate(date)) {
    return {
      kind: "invalid",
      date: null,
      outputs: null,
      error: "Enter a Unix timestamp (seconds or milliseconds) or a date like 2024-01-15T10:30:00Z.",
    };
  }

  return {
    kind,
    date,
    outputs: {
      local: formatLocal(date),
      utc: formatUTC(date),
      iso: formatISO(date),
      seconds: String(Math.floor(date.getTime() / 1000)),
      milliseconds: String(date.getTime()),
      relative: relativeTime(date, now),
    },
  };
}
