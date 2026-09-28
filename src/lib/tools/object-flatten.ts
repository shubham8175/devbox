import type { JsonValue } from "@/lib/tools/json";

export interface FlattenOptions {
  separator: string;
  /** Use bracket notation for array indexes: a[0].b instead of a.0.b */
  brackets: boolean;
  /** Keep empty objects/arrays as leaves ({} / []) instead of dropping them */
  keepEmpty: boolean;
}

export const DEFAULT_FLATTEN: FlattenOptions = { separator: ".", brackets: false, keepEmpty: true };

function isPlainObject(v: JsonValue): v is Record<string, JsonValue> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function flatten(value: JsonValue, opts: FlattenOptions = DEFAULT_FLATTEN): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  const walk = (v: JsonValue, path: string) => {
    if (Array.isArray(v)) {
      if (!v.length) {
        if (opts.keepEmpty || !path) out[path] = [];
        return;
      }
      v.forEach((item, i) => walk(item, path === "" ? String(i) : opts.brackets ? `${path}[${i}]` : `${path}${opts.separator}${i}`));
      return;
    }
    if (isPlainObject(v)) {
      const keys = Object.keys(v);
      if (!keys.length) {
        if (opts.keepEmpty || !path) out[path] = {};
        return;
      }
      for (const k of keys) walk(v[k], path === "" ? k : `${path}${opts.separator}${k}`);
      return;
    }
    out[path] = v;
  };
  walk(value, "");
  return out;
}

/** Split a flattened key into path segments, honouring bracket indexes. */
export function splitPath(key: string, separator: string): string[] {
  const segs: string[] = [];
  const parts = separator ? key.split(separator) : [key];
  for (const part of parts) {
    // a[0][1] → a, 0, 1
    const m = /^([^[\]]*)((?:\[\d+\])+)$/.exec(part);
    if (m) {
      if (m[1]) segs.push(m[1]);
      for (const idx of m[2].matchAll(/\[(\d+)\]/g)) segs.push(idx[1]);
    } else segs.push(part);
  }
  return segs.filter((s, i) => s !== "" || i === 0);
}

/** Keys that would write to Object.prototype instead of a plain object. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
/** Largest numeric segment accepted for an array index (larger values create huge sparse arrays). */
const MAX_ARRAY_INDEX = 100_000;

export function unflatten(flat: Record<string, JsonValue>, opts: FlattenOptions = DEFAULT_FLATTEN): JsonValue {
  const keys = Object.keys(flat);
  if (keys.length === 1 && keys[0] === "") return flat[""];
  // Decide container types per node by looking at child segment shape (all numeric → array)
  type Node = { kind: "obj"; v: Record<string, JsonValue> } | { kind: "arr"; v: JsonValue[] };
  const root: Record<string, JsonValue> = {};
  const isIndex = (s: string) => /^\d+$/.test(s);
  const entries = keys.map((k) => ({ segs: splitPath(k, opts.separator), value: flat[k] }));

  // Determine whether a path prefix should be an array: every child key at that level is numeric.
  const childKeys = new Map<string, Set<string>>();
  for (const e of entries) {
    for (let i = 0; i < e.segs.length - 1; i++) {
      const prefix = e.segs.slice(0, i + 1).join("\u0000");
      if (!childKeys.has(prefix)) childKeys.set(prefix, new Set());
      childKeys.get(prefix)!.add(e.segs[i + 1]);
    }
  }
  const isArrayAt = (prefixSegs: string[]) => {
    const set = childKeys.get(prefixSegs.join("\u0000"));
    return !!set && set.size > 0 && Array.from(set).every(isIndex);
  };

  let rootIsArray = false;
  const topKeys = new Set(entries.map((e) => e.segs[0]));
  if (topKeys.size && Array.from(topKeys).every(isIndex)) rootIsArray = true;
  const rootArr: JsonValue[] = [];

  for (const e of entries) {
    for (const seg of e.segs) {
      if (UNSAFE_KEYS.has(seg)) throw new Error(`Key path "${e.segs.join(".")}" contains "${seg}", which cannot be used as an object key.`);
    }
    let container: Node = rootIsArray ? { kind: "arr", v: rootArr } : { kind: "obj", v: root };
    for (let i = 0; i < e.segs.length; i++) {
      const seg = e.segs[i];
      const last = i === e.segs.length - 1;
      if (container.kind === "arr" && Number(seg) > MAX_ARRAY_INDEX) throw new Error(`Array index ${seg} is too large (limit ${MAX_ARRAY_INDEX.toLocaleString()}).`);
      const getChild = (): JsonValue | undefined => (container.kind === "arr" ? container.v[Number(seg)] : container.v[seg]);
      const setChild = (val: JsonValue) => {
        if (container.kind === "arr") container.v[Number(seg)] = val;
        else container.v[seg] = val;
      };
      if (last) {
        setChild(e.value);
        break;
      }
      let next = getChild();
      if (next === undefined || next === null || typeof next !== "object") {
        next = isArrayAt(e.segs.slice(0, i + 1)) ? [] : {};
        setChild(next);
      }
      container = Array.isArray(next) ? { kind: "arr", v: next } : { kind: "obj", v: next as Record<string, JsonValue> };
    }
  }
  const result: JsonValue = rootIsArray ? rootArr : root;
  // Sparse arrays → fill holes with null so JSON output is valid
  const fill = (v: JsonValue): JsonValue => {
    if (Array.isArray(v)) return Array.from(v, (x) => (x === undefined ? null : fill(x)));
    if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(result);
}

export const FLATTEN_SAMPLE = `{
  "user": {
    "name": "John",
    "roles": ["admin", "dev"],
    "address": { "city": "Pune", "geo": { "lat": 18.52, "lng": 73.85 } }
  },
  "active": true,
  "meta": {}
}`;

export const UNFLATTEN_SAMPLE = `{
  "user.name": "John",
  "user.roles.0": "admin",
  "user.roles.1": "dev",
  "user.address.city": "Pune",
  "active": true
}`;
