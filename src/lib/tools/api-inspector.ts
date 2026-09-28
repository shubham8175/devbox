import type { JsonValue } from "@/lib/tools/json";

export interface TypeCounts {
  object: number;
  array: number;
  string: number;
  number: number;
  boolean: number;
  null: number;
}

export interface LargeArray {
  path: string;
  length: number;
}

export interface DuplicateId {
  path: string;
  key: string;
  value: string;
  count: number;
}

export interface InspectionReport {
  bytes: number;
  minifiedBytes: number;
  depth: number;
  keys: number;
  uniqueKeys: number;
  arrays: number;
  nulls: number;
  emptyStrings: number;
  emptyArrays: number;
  emptyObjects: number;
  types: TypeCounts;
  largeArrays: LargeArray[];
  duplicateIds: DuplicateId[];
  nullPaths: string[];
  emptyStringPaths: string[];
  rootType: string;
}

const ID_KEYS = ["id", "_id", "uuid", "key", "sku", "slug", "code"];
const LARGE = 100;

function join(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  const safe = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `["${key}"]`;
  if (!base) return safe;
  return safe.startsWith("[") ? `${base}${safe}` : `${base}.${safe}`;
}

export function inspectJson(value: JsonValue, raw: string): InspectionReport {
  const report: InspectionReport = {
    bytes: new TextEncoder().encode(raw).length,
    minifiedBytes: new TextEncoder().encode(JSON.stringify(value)).length,
    depth: 0,
    keys: 0,
    uniqueKeys: 0,
    arrays: 0,
    nulls: 0,
    emptyStrings: 0,
    emptyArrays: 0,
    emptyObjects: 0,
    types: { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 },
    largeArrays: [],
    duplicateIds: [],
    nullPaths: [],
    emptyStringPaths: [],
    rootType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
  };
  const keySet = new Set<string>();

  const walk = (v: JsonValue, path: string, depth: number) => {
    report.depth = Math.max(report.depth, depth);
    if (v === null) {
      report.types.null++;
      report.nulls++;
      if (report.nullPaths.length < 50) report.nullPaths.push(path || "(root)");
      return;
    }
    if (Array.isArray(v)) {
      report.types.array++;
      report.arrays++;
      if (v.length === 0) report.emptyArrays++;
      if (v.length >= LARGE) report.largeArrays.push({ path: path || "(root)", length: v.length });
      // Duplicate id detection within arrays of objects
      const seen = new Map<string, { key: string; count: number }>();
      for (const item of v) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          for (const k of ID_KEYS) {
            const idv = (item as Record<string, JsonValue>)[k];
            if (typeof idv === "string" || typeof idv === "number") {
              const sig = `${k}=${String(idv)}`;
              const entry = seen.get(sig);
              if (entry) entry.count++;
              else seen.set(sig, { key: k, count: 1 });
              break;
            }
          }
        }
      }
      for (const [sig, e] of seen) {
        if (e.count > 1) report.duplicateIds.push({ path: path || "(root)", key: e.key, value: sig.slice(e.key.length + 1), count: e.count });
      }
      v.forEach((item, i) => walk(item, join(path, i), depth + 1));
      return;
    }
    if (typeof v === "object") {
      report.types.object++;
      const ks = Object.keys(v);
      if (ks.length === 0) report.emptyObjects++;
      for (const k of ks) {
        report.keys++;
        keySet.add(k);
        walk(v[k], join(path, k), depth + 1);
      }
      return;
    }
    if (typeof v === "string") {
      report.types.string++;
      if (v === "") {
        report.emptyStrings++;
        if (report.emptyStringPaths.length < 50) report.emptyStringPaths.push(path || "(root)");
      }
      return;
    }
    if (typeof v === "number") report.types.number++;
    else if (typeof v === "boolean") report.types.boolean++;
  };

  walk(value, "", 0);
  report.uniqueKeys = keySet.size;
  report.largeArrays.sort((a, b) => b.length - a.length);
  return report;
}

export function typeOf(v: JsonValue): keyof TypeCounts {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as keyof TypeCounts;
}
