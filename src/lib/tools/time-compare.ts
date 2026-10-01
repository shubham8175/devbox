import { decodeObjectId } from "@/lib/tools/objectid";
import { parseEpochInput } from "@/lib/tools/epoch";
import { humanDuration } from "@/lib/tools/time";

/** One input line after parsing: either a usable date or an error to show on that line. */
export type CompareEntry =
  | { line: number; input: string; date: Date; error?: undefined }
  | { line: number; input: string; date: null; error: string };

export interface CompareRow {
  line: number;
  input: string;
  date: Date;
  /** Signed ms from the previous valid entry (null for the first). */
  fromPrevious: number | null;
  /** Signed ms from the first valid entry (null for the first). */
  fromFirst: number | null;
}

export interface CompareResult {
  rows: CompareRow[];
  errors: Array<{ line: number; input: string; error: string }>;
  summary: {
    earliest: CompareRow;
    latest: CompareRow;
    /** latest − earliest, always ≥ 0. */
    span: number;
    /** True when every entry is at or after the one before it. */
    ascending: boolean;
  } | null;
}

/** Upper bound on compared values, so a huge paste can't render thousands of rows. */
export const MAX_COMPARE_ENTRIES = 50;

export const EPOCH_COMPARE_SAMPLE = ["1700000000", "1700003600000", "2023-11-15T08:30:00Z"];
export const OBJECTID_COMPARE_SAMPLE = [
  "65539c80a1b2c3d4e5000001",
  'ObjectId("6553aa90a1b2c3d4e5000002")',
  "6554f550a1b2c3d4e5000003",
];

export type ParsedValue = { date: Date; error?: undefined } | { date: null; error: string };

/** Each compare field is parsed on its own; empty fields are skipped, and `line` is the field number. */
export function toEntries(values: string[], parse: (raw: string) => ParsedValue): CompareEntry[] {
  const entries: CompareEntry[] = [];
  values.forEach((raw, i) => {
    const input = raw.trim();
    if (!input) return;
    const r = parse(input);
    entries.push(r.date ? { line: i + 1, input, date: r.date } : { line: i + 1, input, date: null, error: r.error });
  });
  return entries;
}

export function parseEpochValue(raw: string): ParsedValue {
  const r = parseEpochInput(raw);
  return r.date ? { date: r.date } : { date: null, error: r.error ?? "Invalid timestamp." };
}

/** Accepts a bare id or one copied from mongosh / Compass: quoted, ObjectId("…") or {"$oid": "…"}. */
export function parseObjectIdValue(raw: string): ParsedValue {
  const ids = splitObjectIdPaste(raw);
  const r = decodeObjectId(ids.length === 1 ? ids[0] : raw);
  return r.valid ? { date: r.date } : { date: null, error: r.error };
}

/** Pasting several epoch values into one field: one per line, since date strings like "Jan 15, 2024" contain spaces and commas. */
export function splitEpochPaste(raw: string): string[] {
  return splitValues(raw, /\n/);
}

/** Pasting several ObjectIds into one field: separated by newlines, commas or spaces, wrappers stripped. */
export function splitObjectIdPaste(raw: string): string[] {
  const unwrapped = raw
    .replace(/ObjectId\(\s*["']?([^"')\s]*)["']?\s*\)/g, " $1 ")
    .replace(/\{\s*"?\$oid"?\s*:\s*["']?([^"'}\s]*)["']?\s*\}/g, " $1 ")
    .replace(/["'[\]]/g, " ");
  return splitValues(unwrapped, /[\s,]+/);
}

function splitValues(raw: string, sep: RegExp): string[] {
  return raw
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE_ENTRIES);
}

export function compareEntries(entries: CompareEntry[]): CompareResult {
  const rows: CompareRow[] = [];
  const errors: CompareResult["errors"] = [];
  for (const e of entries) {
    if (!e.date) {
      errors.push({ line: e.line, input: e.input, error: e.error });
      continue;
    }
    const t = e.date.getTime();
    const prev = rows[rows.length - 1];
    rows.push({
      line: e.line,
      input: e.input,
      date: e.date,
      fromPrevious: prev ? t - prev.date.getTime() : null,
      fromFirst: rows.length ? t - rows[0].date.getTime() : null,
    });
  }

  if (!rows.length) return { rows, errors, summary: null };

  let earliest = rows[0];
  let latest = rows[0];
  for (const r of rows) {
    if (r.date < earliest.date) earliest = r;
    if (r.date > latest.date) latest = r;
  }
  return {
    rows,
    errors,
    summary: {
      earliest,
      latest,
      span: latest.date.getTime() - earliest.date.getTime(),
      ascending: rows.every((r) => r.fromPrevious === null || r.fromPrevious >= 0),
    },
  };
}

/** "+2 hours, 5 minutes" / "−3 days" / "same time" */
export function signedDuration(ms: number): string {
  if (ms === 0) return "same time";
  return `${ms > 0 ? "+" : "−"}${humanDuration(ms)}`;
}
