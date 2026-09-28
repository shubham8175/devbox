import type { JsonValue } from "@/lib/tools/json";

/** Read a dotted/bracket path like user.id or items[0].sku from a value. */
export function getPath(value: JsonValue, path: string): JsonValue | undefined {
  if (!path.trim()) return value;
  const segs = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: JsonValue | undefined = value;
  for (const s of segs) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(s)] : (cur as Record<string, JsonValue>)[s];
  }
  return cur;
}

function stableKey(v: JsonValue | undefined): string {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return `${typeof v}:${String(v)}`;
  const sort = (x: JsonValue): JsonValue => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      const o: Record<string, JsonValue> = {};
      for (const k of Object.keys(x).sort()) o[k] = sort((x as Record<string, JsonValue>)[k]);
      return o;
    }
    return x;
  };
  return `obj:${JSON.stringify(sort(v))}`;
}

const keyOf = (item: JsonValue, path: string) => stableKey(path ? getPath(item, path) : item);

export function removeDuplicates(arr: JsonValue[], path = ""): JsonValue[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = keyOf(item, path);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function compare(a: JsonValue | undefined, b: JsonValue | undefined): number {
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  const na = Number(sa);
  const nb = Number(sb);
  if (sa.trim() !== "" && sb.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export function sortArray(arr: JsonValue[], path = "", direction: "asc" | "desc" = "asc"): JsonValue[] {
  const out = [...arr].sort((a, b) => compare(path ? getPath(a, path) : a, path ? getPath(b, path) : b));
  return direction === "desc" ? out.reverse() : out;
}

export function reverseArray(arr: JsonValue[]): JsonValue[] {
  return [...arr].reverse();
}

export function groupBy(arr: JsonValue[], path: string): Record<string, JsonValue[]> {
  const out: Record<string, JsonValue[]> = {};
  for (const item of arr) {
    const v = getPath(item, path);
    const k = v === undefined ? "(missing)" : v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v);
    (out[k] ??= []).push(item);
  }
  return out;
}

export function extractProperty(arr: JsonValue[], path: string): JsonValue[] {
  return arr.map((item) => {
    const v = getPath(item, path);
    return v === undefined ? null : v;
  });
}

export function isEmptyValue(v: JsonValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

export function filterEmpty(arr: JsonValue[], path = ""): JsonValue[] {
  return arr.filter((item) => !isEmptyValue(path ? getPath(item, path) : item));
}

export interface DuplicateCount {
  key: string;
  value: JsonValue | undefined;
  count: number;
  indexes: number[];
}

export function countDuplicates(arr: JsonValue[], path = ""): DuplicateCount[] {
  const map = new Map<string, DuplicateCount>();
  arr.forEach((item, i) => {
    const v = path ? getPath(item, path) : item;
    const k = stableKey(v);
    const e = map.get(k);
    if (e) {
      e.count++;
      e.indexes.push(i);
    } else map.set(k, { key: k, value: v, count: 1, indexes: [i] });
  });
  return Array.from(map.values())
    .filter((d) => d.count > 1)
    .sort((a, b) => b.count - a.count);
}

const ID_KEYS = ["id", "_id", "uuid", "key", "sku", "slug", "code"];

/** Auto-detect an id-like property on objects and report duplicates. */
export function findDuplicateIds(arr: JsonValue[], path = ""): { key: string | null; duplicates: DuplicateCount[] } {
  let key: string | null = path || null;
  if (!key) {
    const first = arr.find((x) => x && typeof x === "object" && !Array.isArray(x)) as Record<string, JsonValue> | undefined;
    if (first) key = ID_KEYS.find((k) => k in first) ?? null;
  }
  if (!key) return { key: null, duplicates: [] };
  return { key, duplicates: countDuplicates(arr, key) };
}

export function stats(arr: JsonValue[]) {
  const types = new Map<string, number>();
  for (const v of arr) {
    const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  return { length: arr.length, types: Array.from(types.entries()) };
}

export const ARRAY_SAMPLE = `[
  { "id": 1, "user": { "id": "u1", "name": "Ada" }, "amount": 120, "status": "paid" },
  { "id": 2, "user": { "id": "u2", "name": "Grace" }, "amount": 80, "status": "pending" },
  { "id": 3, "user": { "id": "u1", "name": "Ada" }, "amount": 45, "status": "paid" },
  { "id": 2, "user": { "id": "u3", "name": "Linus" }, "amount": 0, "status": "" },
  { "id": 5, "user": { "id": "u4", "name": "Margaret" }, "amount": 300, "status": "refunded" }
]`;
