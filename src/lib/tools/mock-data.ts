/**
 * Local-only fake data. Word lists are small and deliberately generic;
 * nothing here references a real person, company or address.
 */

export type MockFieldType =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "username"
  | "uuid"
  | "phone"
  | "date"
  | "boolean"
  | "number"
  | "url"
  | "address"
  | "randomId"
  | "sentence"
  | "company"
  | "avatarUrl";

export interface MockField {
  id: number;
  name: string;
  type: MockFieldType;
  /** number: inclusive range */
  min?: number;
  max?: number;
  /** date: which direction from now */
  dateMode?: "past" | "future" | "recent";
}

export const FIELD_TYPES: Array<{ id: MockFieldType; label: string }> = [
  { id: "name", label: "Full name" },
  { id: "firstName", label: "First name" },
  { id: "lastName", label: "Last name" },
  { id: "email", label: "Email" },
  { id: "username", label: "Username" },
  { id: "uuid", label: "UUID" },
  { id: "phone", label: "Phone" },
  { id: "date", label: "Date (ISO)" },
  { id: "boolean", label: "Boolean" },
  { id: "number", label: "Number" },
  { id: "url", label: "URL" },
  { id: "address", label: "Address" },
  { id: "randomId", label: "Random ID" },
  { id: "sentence", label: "Sentence" },
  { id: "company", label: "Company" },
  { id: "avatarUrl", label: "Avatar URL (placeholder)" },
];

const FIRST = ["Ava", "Liam", "Mia", "Noah", "Zoe", "Ethan", "Isla", "Arjun", "Priya", "Kai", "Nora", "Leo", "Sara", "Omar", "Elena", "Rohan", "Lucas", "Maya", "Hana", "Felix", "Aisha", "Theo", "Ivy", "Mateo", "Lena", "Ravi", "Chloe", "Diego", "Anya", "Jonas"];
const LAST = ["Sharma", "Nguyen", "Patel", "Garcia", "Kim", "Okafor", "Silva", "Rossi", "Iyer", "Fischer", "Tanaka", "Mensah", "Novak", "Haddad", "Larsen", "Costa", "Khan", "Moreau", "Reyes", "Dubois", "Singh", "Park", "Weber", "Ali", "Brennan", "Sato", "Varga", "Rao", "Olsen", "Duarte"];
const DOMAINS = ["example.com", "example.org", "example.net", "mail.example", "test.example"];
const COMPANY_A = ["Northwind", "Lumen", "Vertex", "Harbor", "Quanta", "Orbit", "Pioneer", "Atlas", "Bluefin", "Summit", "Kestrel", "Meridian", "Nimbus", "Beacon", "Tandem"];
const COMPANY_B = ["Labs", "Systems", "Works", "Digital", "Logistics", "Studio", "Analytics", "Cloud", "Robotics", "Foods", "Health", "Energy", "Mobility", "Ventures", "Software"];
const STREETS = ["Maple Street", "Oak Avenue", "Pine Lane", "Cedar Road", "River Drive", "Hill Street", "Lake View", "Park Place", "Station Road", "Market Street"];
const CITIES = ["Springfield", "Riverton", "Lakeside", "Fairview", "Greenville", "Hillcrest", "Brookfield", "Ashford", "Newport", "Kingston"];
const COUNTRIES = ["India", "United States", "United Kingdom", "Germany", "Brazil", "Japan", "Canada", "Australia", "Spain", "Kenya"];
const WORDS = ["fast", "local", "simple", "cache", "queue", "signal", "render", "schema", "token", "branch", "deploy", "buffer", "stream", "index", "cluster", "metric", "socket", "vector", "pixel", "kernel", "layer", "module", "router", "worker"];

/**
 * Unbiased random integer in [0, n) for any safe integer n.
 * Draws 53 random bits per attempt so ranges above 2^32 (e.g. millisecond
 * offsets spanning years) work without the rejection loop running forever.
 */
export function randomInt(n: number): number {
  n = Math.floor(n);
  if (!Number.isFinite(n) || n <= 1) return 0;
  n = Math.min(n, Number.MAX_SAFE_INTEGER);
  const RANGE = 2 ** 53;
  const max = RANGE - (RANGE % n);
  const buf = new Uint32Array(2);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0] * 0x200000 + (buf[1] >>> 11); // 32 + 21 = 53 bits
  } while (v >= max);
  return v % n;
}

const pick = <T,>(arr: T[]): T => arr[randomInt(arr.length)];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function randomIdChars(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

function isoDate(mode: MockField["dateMode"], now: number): string {
  const day = 86_400_000;
  let offset: number;
  switch (mode) {
    case "future":
      offset = randomInt(365 * day);
      break;
    case "recent":
      offset = -randomInt(7 * day);
      break;
    default:
      offset = -randomInt(5 * 365 * day);
  }
  return new Date(now + offset).toISOString();
}

export type MockValue = string | number | boolean;

/** Generate a single value; `person` keeps name-derived fields consistent within a row. */
export function generateValue(field: MockField, ctx: { person: { first: string; last: string }; index: number; now: number }): MockValue {
  const { first, last } = ctx.person;
  switch (field.type) {
    case "name":
      return `${first} ${last}`;
    case "firstName":
      return first;
    case "lastName":
      return last;
    case "email":
      return `${slug(first)}.${slug(last)}${randomInt(100)}@${pick(DOMAINS)}`;
    case "username":
      return `${slug(first)}_${slug(last).slice(0, 4)}${randomInt(1000)}`;
    case "uuid":
      return crypto.randomUUID();
    case "phone":
      return `+1-555-${String(randomInt(900) + 100)}-${String(randomInt(10000)).padStart(4, "0")}`;
    case "date":
      return isoDate(field.dateMode, ctx.now);
    case "boolean":
      return randomInt(2) === 1;
    case "number": {
      const min = Number.isFinite(field.min) ? (field.min as number) : 0;
      const max = Number.isFinite(field.max) ? (field.max as number) : 1000;
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return lo + randomInt(hi - lo + 1);
    }
    case "url":
      return `https://${pick(DOMAINS)}/${pick(WORDS)}/${randomIdChars(6)}`;
    case "address":
      return `${randomInt(9000) + 100} ${pick(STREETS)}, ${pick(CITIES)}, ${pick(COUNTRIES)}`;
    case "randomId":
      return randomIdChars(12);
    case "sentence": {
      const n = 6 + randomInt(7);
      const words = Array.from({ length: n }, () => pick(WORDS));
      words[0] = words[0][0].toUpperCase() + words[0].slice(1);
      return `${words.join(" ")}.`;
    }
    case "company":
      return `${pick(COMPANY_A)} ${pick(COMPANY_B)}`;
    case "avatarUrl":
      return `https://example.com/avatar/${ctx.index + 1}.png`;
  }
}

export type MockRow = Record<string, MockValue>;

export function generateRows(fields: MockField[], count: number, now: number = Date.now()): MockRow[] {
  const rows: MockRow[] = [];
  const n = Math.max(0, Math.min(1000, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    const person = { first: pick(FIRST), last: pick(LAST) };
    const row: MockRow = {};
    for (const f of fields) {
      const key = f.name.trim() || f.type;
      row[key] = generateValue(f, { person, index: i, now });
    }
    rows.push(row);
  }
  return rows;
}

function csvCell(v: MockValue): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: MockRow[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const lines = [keys.map(csvCell).join(",")];
  for (const r of rows) lines.push(keys.map((k) => csvCell(r[k] ?? "")).join(","));
  return lines.join("\n");
}

export const DEFAULT_FIELDS: MockField[] = [
  { id: 1, name: "id", type: "uuid" },
  { id: 2, name: "name", type: "name" },
  { id: 3, name: "email", type: "email" },
  { id: 4, name: "active", type: "boolean" },
  { id: 5, name: "createdAt", type: "date", dateMode: "past" },
];
