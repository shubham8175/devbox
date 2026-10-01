/**
 * Small, dependency-free cron explainer for standard 5-field expressions
 * (minute hour day-of-month month day-of-week). Supports *, lists, ranges,
 * steps, and month/day names.
 */

export interface CronField {
  name: string;
  raw: string;
  description: string;
  valid: boolean;
  error?: string;
}

export interface CronResult {
  ok: boolean;
  error?: string;
  fields: CronField[];
  description: string;
  nextRuns: Date[];
}

const FIELD_DEFS = [
  { name: "Minute", min: 0, max: 59 },
  { name: "Hour", min: 0, max: 23 },
  { name: "Day of month", min: 1, max: 31 },
  { name: "Month", min: 1, max: 12 },
  { name: "Day of week", min: 0, max: 7 },
] as const;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PRESETS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

interface ParsedField {
  values: Set<number>;
  any: boolean;
  parts: Array<{ kind: "any" | "value" | "range" | "step"; start?: number; end?: number; step?: number }>;
}

function nameToNumber(token: string, fieldIndex: number): number | null {
  const lower = token.toLowerCase();
  if (fieldIndex === 3) {
    const i = MONTHS.indexOf(lower);
    return i >= 0 ? i + 1 : null;
  }
  if (fieldIndex === 4) {
    const i = DAYS.indexOf(lower);
    return i >= 0 ? i : null;
  }
  return null;
}

function parseNumber(token: string, fieldIndex: number): number | null {
  if (/^\d+$/.test(token)) return Number(token);
  return nameToNumber(token, fieldIndex);
}

function parseField(raw: string, fieldIndex: number): { parsed?: ParsedField; error?: string } {
  const def = FIELD_DEFS[fieldIndex];
  const values = new Set<number>();
  const parts: ParsedField["parts"] = [];
  let any = false;

  for (const piece of raw.split(",")) {
    if (!piece) return { error: "Empty list item." };
    const [rangePart, stepPart, extra] = piece.split("/");
    if (extra !== undefined) return { error: `Too many "/" in "${piece}".` };
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) return { error: `Invalid step "${stepPart}".` };
      step = Number(stepPart);
    }

    let start: number;
    let end: number;
    if (rangePart === "*" || rangePart === "?") {
      start = def.min;
      end = def.max === 7 ? 6 : def.max;
      if (stepPart === undefined) any = true;
    } else if (rangePart.includes("-")) {
      const [a, b, more] = rangePart.split("-");
      if (more !== undefined) return { error: `Invalid range "${rangePart}".` };
      const na = parseNumber(a, fieldIndex);
      const nb = parseNumber(b, fieldIndex);
      if (na === null || nb === null) return { error: `Invalid range "${rangePart}".` };
      start = na;
      end = nb;
      if (start > end) return { error: `Range "${rangePart}" is reversed.` };
    } else {
      const n = parseNumber(rangePart, fieldIndex);
      if (n === null) return { error: `"${rangePart}" is not a valid value.` };
      start = n;
      end = stepPart !== undefined ? (def.max === 7 ? 6 : def.max) : n;
    }

    if (start < def.min || end > def.max) {
      return { error: `Value out of range (${def.min}-${def.max}).` };
    }

    for (let v = start; v <= end; v += step) values.add(fieldIndex === 4 && v === 7 ? 0 : v);
    if (rangePart === "*" && stepPart === undefined) parts.push({ kind: "any" });
    else if (stepPart !== undefined) parts.push({ kind: "step", start, end, step });
    else if (start !== end) parts.push({ kind: "range", start, end });
    else parts.push({ kind: "value", start });
  }

  return { parsed: { values, any, parts } };
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function labelFor(v: number, fieldIndex: number): string {
  if (fieldIndex === 3) return MONTH_NAMES[v - 1];
  if (fieldIndex === 4) return DAY_NAMES[v % 7];
  if (fieldIndex === 2) return `the ${ordinal(v)}`;
  return String(v);
}

function describeField(p: ParsedField, fieldIndex: number): string {
  const def = FIELD_DEFS[fieldIndex];
  if (p.any) return `every ${def.name.toLowerCase()}`;
  const descs = p.parts.map((part) => {
    switch (part.kind) {
      case "any":
        return `every ${def.name.toLowerCase()}`;
      case "value":
        return labelFor(part.start!, fieldIndex);
      case "range":
        return `${labelFor(part.start!, fieldIndex)} through ${labelFor(part.end!, fieldIndex)}`;
      case "step": {
        const unit = def.name.toLowerCase();
        const from = part.start === def.min ? "" : ` starting at ${labelFor(part.start!, fieldIndex)}`;
        return `every ${part.step === 1 ? "" : `${ordinal(part.step!)} `}${unit}${from}`;
      }
    }
  });
  return list(descs);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function humanize(fields: ParsedField[]): string {
  const [min, hour, dom, mon, dow] = fields;
  const clauses: string[] = [];

  // Time part
  if (!min.any && !hour.any && min.parts.every((p) => p.kind === "value") && hour.parts.every((p) => p.kind === "value")) {
    const times: string[] = [];
    for (const h of hour.values) for (const m of min.values) times.push(`${pad(h)}:${pad(m)}`);
    times.sort();
    clauses.push(`At ${list(times)}`);
  } else if (min.any && hour.any) {
    clauses.push("Every minute");
  } else if (min.parts.length === 1 && min.parts[0].kind === "step" && hour.any) {
    const s = min.parts[0].step!;
    clauses.push(s === 1 ? "Every minute" : `Every ${s} minutes`);
  } else if (!min.any && min.parts.every((p) => p.kind === "value") && hour.parts.length === 1 && hour.parts[0].kind === "step") {
    const s = hour.parts[0].step!;
    const minutes = Array.from(min.values).map((m) => `minute ${m}`);
    clauses.push(`At ${list(minutes)} past every ${s === 1 ? "hour" : `${s} hours`}`);
  } else if (!min.any && hour.any) {
    clauses.push(`At ${describeField(min, 0)} past every hour`);
  } else {
    clauses.push(`At ${describeField(min, 0)} past ${describeField(hour, 1)}`);
  }

  if (!dom.any) clauses.push(`on ${describeField(dom, 2)} of the month`);
  if (!dow.any) clauses.push(`${dom.any ? "on" : "and"} ${describeField(dow, 4)}`);
  if (!mon.any) clauses.push(`in ${describeField(mon, 3)}`);

  return clauses.join(" ") + ".";
}

function computeNextRuns(fields: ParsedField[], count: number, from: Date, until?: Date): Date[] {
  const [min, hour, dom, mon, dow] = fields;
  const runs: Date[] = [];
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  // Standard cron semantics: if both DOM and DOW are restricted, either matching counts.
  const domRestricted = !dom.any;
  const dowRestricted = !dow.any;
  const limit = 366 * 24 * 60 * 5; // hard stop (5 years of minutes)
  for (let i = 0; i < limit && runs.length < count; i++) {
    if (until && d > until) break;
    if (!mon.values.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    const domOk = dom.values.has(d.getDate());
    const dowOk = dow.values.has(d.getDay());
    const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (!dayOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hour.values.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!min.values.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    runs.push(new Date(d));
    d.setMinutes(d.getMinutes() + 1);
  }
  return runs;
}

type ParsedCron = { ok: true; fields: CronField[]; parsed: ParsedField[] } | { ok: false; error: string; fields: CronField[] };

function parseCron(raw: string): ParsedCron {
  let expr = raw.trim().replace(/\s+/g, " ");
  if (!expr) return { ok: false, error: "Enter a cron expression.", fields: [] };
  if (expr.startsWith("@")) {
    const preset = PRESETS[expr.toLowerCase()];
    if (!preset) return { ok: false, error: `Unknown preset "${expr}".`, fields: [] };
    expr = preset;
  }
  const tokens = expr.split(" ");
  if (tokens.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 fields (minute hour day-of-month month day-of-week), got ${tokens.length}.`,
      fields: tokens.map((raw, i) => ({ name: FIELD_DEFS[i]?.name ?? `Field ${i + 1}`, raw, description: "", valid: false })),
    };
  }

  const parsed: ParsedField[] = [];
  const fields: CronField[] = [];
  let ok = true;
  tokens.forEach((raw, i) => {
    const r = parseField(raw, i);
    if (r.error || !r.parsed) {
      ok = false;
      fields.push({ name: FIELD_DEFS[i].name, raw, description: "", valid: false, error: r.error });
      parsed.push({ values: new Set(), any: true, parts: [] });
    } else {
      parsed.push(r.parsed);
      fields.push({ name: FIELD_DEFS[i].name, raw, description: describeField(r.parsed, i), valid: true });
    }
  });

  if (!ok) {
    const first = fields.find((f) => !f.valid);
    return { ok: false, error: `${first?.name}: ${first?.error}`, fields };
  }
  return { ok: true, fields, parsed };
}

export function explainCron(raw: string, now: Date = new Date()): CronResult {
  const p = parseCron(raw);
  if (!p.ok) return { ok: false, error: p.error, fields: p.fields, description: "", nextRuns: [] };
  return { ok: true, fields: p.fields, description: humanize(p.parsed), nextRuns: computeNextRuns(p.parsed, 5, now) };
}

/** Just the human description of an expression, or why it doesn't parse. */
export function describeCron(raw: string): { description: string; error?: undefined } | { error: string } {
  const p = parseCron(raw);
  return p.ok ? { description: humanize(p.parsed) } : { error: p.error };
}

/**
 * Runs strictly after `from` (local time), up to `count` of them and none later than `until`.
 * Returns the parse error instead when the expression is invalid.
 */
export function cronRuns(raw: string, from: Date, count: number, until?: Date): { runs: Date[]; description: string; error?: undefined } | { error: string } {
  const p = parseCron(raw);
  if (!p.ok) return { error: p.error };
  return { runs: computeNextRuns(p.parsed, count, from, until), description: humanize(p.parsed) };
}

export const CRON_EXAMPLES: Array<{ expr: string; label: string }> = [
  { expr: "* * * * *", label: "Every minute" },
  { expr: "*/15 * * * *", label: "Every 15 minutes" },
  { expr: "0 */2 * * *", label: "Every 2 hours" },
  { expr: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { expr: "30 2 1 * *", label: "Monthly on the 1st at 02:30" },
  { expr: "0 0 * * 0", label: "Sundays at midnight" },
];
