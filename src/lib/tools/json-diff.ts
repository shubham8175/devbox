import type { JsonValue } from "@/lib/tools/json";

export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  kind: DiffKind;
  path: string;
  before?: JsonValue;
  after?: JsonValue;
}

function isObject(v: JsonValue): v is { [key: string]: JsonValue } {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  const safe = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `["${key}"]`;
  if (!base) return safe;
  return safe.startsWith("[") ? `${base}${safe}` : `${base}.${safe}`;
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Produce a flat list of leaf-level differences between two JSON values.
 * Objects and arrays are recursed; primitives (and type changes) are compared as leaves.
 */
export function diffJson(a: JsonValue, b: JsonValue, path = "", out: DiffEntry[] = []): DiffEntry[] {
  if (isObject(a) && isObject(b)) {
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
    for (const key of keys) {
      const p = joinPath(path, key);
      if (!Object.hasOwn(a, key)) out.push({ kind: "added", path: p, after: b[key] });
      else if (!Object.hasOwn(b, key)) out.push({ kind: "removed", path: p, before: a[key] });
      else diffJson(a[key], b[key], p, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const p = joinPath(path, i);
      if (i >= a.length) out.push({ kind: "added", path: p, after: b[i] });
      else if (i >= b.length) out.push({ kind: "removed", path: p, before: a[i] });
      else diffJson(a[i], b[i], p, out);
    }
    return out;
  }
  const p = path || "(root)";
  if (deepEqual(a, b)) out.push({ kind: "unchanged", path: p, before: a, after: b });
  else out.push({ kind: "changed", path: p, before: a, after: b });
  return out;
}

export function summarizeDiff(entries: DiffEntry[]): Record<DiffKind, number> {
  const summary: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const e of entries) summary[e.kind]++;
  return summary;
}

export function previewValue(v: JsonValue | undefined): string {
  if (v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
