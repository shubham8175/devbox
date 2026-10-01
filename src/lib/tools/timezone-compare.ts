import { allTimezones } from "@/data/timezones";
import { offsetMinutes, zoneAbbreviation } from "@/lib/tools/timezone";

export const MAX_WORLD_CLOCK_ZONES = 20;
export const WORLD_CLOCK_SAMPLE = ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York"];

/** Working hours used for the meeting-time hints, in minutes after local midnight. */
export const WORK_START = 9 * 60;
export const WORK_END = 18 * 60;

/**
 * Common abbreviations and nicknames. Abbreviations are ambiguous worldwide, so
 * each maps to the zone a developer most likely means (IST → India, not Israel).
 */
const ALIASES: Record<string, string> = {
  utc: "UTC",
  gmt: "UTC",
  z: "UTC",
  zulu: "UTC",
  ist: "Asia/Kolkata",
  india: "Asia/Kolkata",
  pkt: "Asia/Karachi",
  gst: "Asia/Dubai",
  uae: "Asia/Dubai",
  ast: "Asia/Riyadh",
  sgt: "Asia/Singapore",
  hkt: "Asia/Hong_Kong",
  jst: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  kst: "Asia/Seoul",
  wib: "Asia/Jakarta",
  aest: "Australia/Sydney",
  aedt: "Australia/Sydney",
  nzst: "Pacific/Auckland",
  nzdt: "Pacific/Auckland",
  bst: "Europe/London",
  uk: "Europe/London",
  wet: "Europe/Lisbon",
  cet: "Europe/Berlin",
  cest: "Europe/Berlin",
  eet: "Europe/Athens",
  eest: "Europe/Athens",
  msk: "Europe/Moscow",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  eastern: "America/New_York",
  nyc: "America/New_York",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  ct: "America/Chicago",
  central: "America/Chicago",
  mst: "America/Denver",
  mdt: "America/Denver",
  mt: "America/Denver",
  mountain: "America/Denver",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  sf: "America/Los_Angeles",
  brt: "America/Sao_Paulo",
};

/** Lowercased IANA id, and lowercased city ("new york" for America/New_York) → canonical id. Built lazily. */
let lookup: Map<string, string> | null = null;
function zoneLookup(): Map<string, string> {
  if (lookup) return lookup;
  lookup = new Map();
  for (const id of allTimezones()) {
    lookup.set(id.toLowerCase(), id);
    const city = id.split("/").pop()!.replace(/_/g, " ").toLowerCase();
    // First zone wins, so "Asia/Kolkata" (featured, listed first) beats any later duplicate city.
    if (id.includes("/") && !lookup.has(city)) lookup.set(city, id);
  }
  return lookup;
}

function isValidZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type ResolvedZone = { zone: string; error?: undefined } | { zone?: undefined; error: string };

/** Accepts an IANA id (any case), a city ("new york"), a common abbreviation (IST) or a fixed offset (UTC+5:30). */
export function resolveZone(raw: string): ResolvedZone {
  const text = raw.trim();
  if (!text) return { error: "Empty." };
  const key = text.toLowerCase().replace(/\s+/g, " ");
  const alias = ALIASES[key];
  if (alias) return { zone: alias };
  const known = zoneLookup().get(key) ?? zoneLookup().get(key.replace(/ /g, "_"));
  if (known) return { zone: known };

  const offset = /^(?:utc|gmt)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(text);
  if (offset) {
    const [, sign, h, m = "00"] = offset;
    if (Number(h) > 14 || Number(m) > 59) return { error: `"${text}" is not a valid UTC offset.` };
    const id = `${sign}${h.padStart(2, "0")}:${m}`;
    if (isValidZone(id)) return { zone: id };
    // Older runtimes only know whole-hour Etc zones, whose sign is inverted by POSIX convention.
    if (m === "00") return { zone: `Etc/GMT${sign === "+" ? "-" : "+"}${Number(h)}` };
    return { error: "This browser doesn't support fractional UTC offsets; use a zone name." };
  }

  if (isValidZone(text)) return { zone: new Intl.DateTimeFormat("en-US", { timeZone: text }).resolvedOptions().timeZone };
  return { error: `Unknown timezone "${text}". Try an IANA name like Europe/Paris, a city, or IST.` };
}

/** Pasted lists split on newlines, commas and semicolons; not spaces, since "new york" is one zone. */
export function splitZonePaste(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  // Shifting by the offset and reading UTC fields gives the zone's wall clock without another formatter.
  const shifted = new Date(date.getTime() + offsetMinutes(date, timeZone) * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The instant as a datetime-local value ("YYYY-MM-DDTHH:mm:ss") on `timeZone`'s wall clock. */
export function toZonedInputValue(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** "+5h 30m", "-4h", "+45m", or "same" for a minute difference. */
export function formatMinutesDiff(minutes: number): string {
  if (minutes === 0) return "same";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${minutes < 0 ? "-" : "+"}${[h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ")}`;
}

export type WorkStatus = "working" | "outside" | "weekend";

function workStatus(p: LocalParts): WorkStatus {
  if (p.weekday === 0 || p.weekday === 6) return "weekend";
  const mins = p.hour * 60 + p.minute;
  return mins >= WORK_START && mins < WORK_END ? "working" : "outside";
}

export interface WorldClockRow {
  /** 1-based field number. */
  line: number;
  input: string;
  zone: string;
  abbreviation: string;
  /** Minutes east of UTC at the instant. */
  offset: number;
  /** "Thu, Oct 1, 2026" and "14:30:00" on the zone's wall clock. */
  date: string;
  time: string;
  /** Offset minus the first zone's offset. */
  diffFromFirst: number;
  /** Local calendar day minus the first zone's local calendar day (-1 = previous day). */
  dayShift: number;
  work: WorkStatus;
}

export interface WorldClockResult {
  rows: WorldClockRow[];
  errors: Array<{ line: number; input: string; error: string }>;
}

const dateFmt = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** One row per valid zone (field numbers kept, empty fields skipped), compared against the first valid one. */
export function worldClock(instant: Date, values: string[]): WorldClockResult {
  const rows: WorldClockRow[] = [];
  const errors: WorldClockResult["errors"] = [];
  let first: { offset: number; dayIndex: number } | null = null;

  values.forEach((raw, i) => {
    const input = raw.trim();
    if (!input) return;
    const r = resolveZone(input);
    if (r.error !== undefined) {
      errors.push({ line: i + 1, input, error: r.error });
      return;
    }
    const zone = r.zone;
    const offset = offsetMinutes(instant, zone);
    const p = localParts(instant, zone);
    const dayIndex = Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
    first ??= { offset, dayIndex };
    rows.push({
      line: i + 1,
      input,
      zone,
      abbreviation: zoneAbbreviation(instant, zone),
      offset,
      date: dateFmt(zone).format(instant),
      time: `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`,
      diffFromFirst: offset - first.offset,
      dayShift: dayIndex - first.dayIndex,
      work: workStatus(p),
    });
  });

  return { rows, errors };
}

export function dayShiftLabel(shift: number): string {
  if (shift === 0) return "same day";
  if (shift === 1) return "next day";
  if (shift === -1) return "previous day";
  return `${shift > 0 ? "+" : ""}${shift} days`;
}

export interface MeetingSlot {
  start: Date;
  /** Field numbers of the zones in working hours (weekday, 09:00–18:00) for the whole hour. */
  working: number[];
}

/**
 * The 24 one-hour slots of `instant`'s calendar day on `baseZone`'s clock, each with the zones
 * that are in working hours for the full hour. Slots every zone shares are meeting candidates.
 */
export function meetingSlots(instant: Date, baseZone: string, rows: Pick<WorldClockRow, "line" | "zone">[]): MeetingSlot[] {
  const p = localParts(instant, baseZone);
  const midnight = Date.UTC(p.year, p.month - 1, p.day) - offsetMinutes(instant, baseZone) * 60_000;
  return Array.from({ length: 24 }, (_, h) => {
    const start = new Date(midnight + h * 3_600_000);
    const end = new Date(start.getTime() + 3_600_000 - 60_000);
    const working = rows
      .filter((r) => workStatus(localParts(start, r.zone)) === "working" && workStatus(localParts(end, r.zone)) === "working")
      .map((r) => r.line);
    return { start, working };
  });
}
