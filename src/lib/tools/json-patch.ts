import { parseJson, type JsonValue } from "@/lib/tools/json";

/**
 * RFC 6902 (JSON Patch) and RFC 7386 (JSON Merge Patch), dependency-free.
 *
 * Every function here treats its inputs as immutable: documents are deep-cloned
 * before anything is applied, so a failed patch never leaves a half-applied
 * result behind (RFC 6902 §5 requires atomicity).
 */

export type JsonObject = { [key: string]: JsonValue };

export type JsonPatchOp =
  | { op: "add"; path: string; value: JsonValue }
  | { op: "replace"; path: string; value: JsonValue }
  | { op: "test"; path: string; value: JsonValue }
  | { op: "remove"; path: string }
  | { op: "move"; path: string; from: string }
  | { op: "copy"; path: string; from: string };

export interface PatchApplyOk {
  ok: true;
  result: JsonValue;
  applied: number;
}

export interface PatchApplyError {
  ok: false;
  error: string;
  /** Index of the operation that failed (0-based). */
  failedIndex: number;
}

export type PatchApplyResult = PatchApplyOk | PatchApplyError;

export type ParsePatchResult = { ok: true; ops: JsonPatchOp[] } | { ok: false; error: string };

/** Object keys that would reach the prototype chain when used as pointer segments. */
const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Guards against pathological patches (e.g. 1M "add" operations) hanging the tab. */
export const MAX_PATCH_OPS = 100_000;
/** Above this many elements, array diffs fall back to index-wise comparison instead of an O(n·m) LCS. */
export const MAX_LCS_ELEMENTS = 2000;

const OPS = new Set(["add", "remove", "replace", "move", "copy", "test"]);

function isObject(v: JsonValue | undefined): v is JsonObject {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Deep clone via JSON round-trip. JSON.parse creates own properties with
 * CreateDataProperty, so a key literally named "__proto__" becomes a harmless
 * own property instead of rewiring the prototype.
 */
export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// JSON Pointer (RFC 6901)
// ---------------------------------------------------------------------------

export type PointerParseResult = { ok: true; segments: string[] } | { ok: false; error: string };

/** Split a JSON Pointer into unescaped segments. Rejects segments that would touch the prototype chain. */
export function parsePointer(pointer: string): PointerParseResult {
  if (pointer === "") return { ok: true, segments: [] };
  if (!pointer.startsWith("/")) return { ok: false, error: `Pointer "${pointer}" must start with "/" (or be empty for the root).` };
  const segments = pointer
    .slice(1)
    .split("/")
    // Order matters: "~1" → "/" first, then "~0" → "~" (RFC 6901 §4).
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  for (const s of segments) {
    if (UNSAFE_SEGMENTS.has(s)) return { ok: false, error: `Pointer segment "${s}" is not allowed (it would modify the object prototype).` };
  }
  return { ok: true, segments };
}

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function joinPointer(base: string, key: string | number): string {
  return `${base}/${typeof key === "number" ? key : escapePointerSegment(key)}`;
}

/** Array index per RFC 6901: "0" or digits without a leading zero. */
function parseIndex(segment: string, length: number, allowEnd: boolean): number | null {
  if (segment === "-") return allowEnd ? length : null;
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  const n = Number(segment);
  if (n > length || (n === length && !allowEnd)) return null;
  return n;
}

/** Read a value by pointer; undefined when the path does not exist. */
export function getByPointer(doc: JsonValue, pointer: string): JsonValue | undefined {
  const parsed = parsePointer(pointer);
  if (!parsed.ok) return undefined;
  let cur: JsonValue | undefined = doc;
  for (const seg of parsed.segments) {
    if (Array.isArray(cur)) {
      const idx = parseIndex(seg, cur.length, false);
      if (idx === null) return undefined;
      cur = cur[idx];
    } else if (isObject(cur)) {
      if (!Object.hasOwn(cur, seg)) return undefined;
      cur = cur[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Walk to the parent of the pointer target. Returns the container and the last
 * segment, or an error when an intermediate location is missing.
 */
function resolveParent(doc: JsonValue, segments: string[]): { ok: true; parent: JsonValue; key: string } | { ok: false; error: string } {
  let cur: JsonValue = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const sofar = `/${segments.slice(0, i + 1).map(escapePointerSegment).join("/")}`;
    if (Array.isArray(cur)) {
      const idx = parseIndex(seg, cur.length, false);
      if (idx === null) return { ok: false, error: `"${sofar}" does not exist (array index out of range or not a number).` };
      cur = cur[idx];
    } else if (isObject(cur)) {
      if (!Object.hasOwn(cur, seg)) return { ok: false, error: `"${sofar}" does not exist.` };
      cur = cur[seg];
    } else {
      return { ok: false, error: `"${sofar}" is a ${cur === null ? "null" : typeof cur}, not a container.` };
    }
  }
  return { ok: true, parent: cur, key: segments[segments.length - 1] };
}

type Located = { ok: true; doc: JsonValue } | { ok: false; error: string };

/** Insert (add) a value at a pointer, RFC 6902 §4.1 semantics. Returns the (possibly new) root. */
function addAt(doc: JsonValue, segments: string[], value: JsonValue): Located {
  if (segments.length === 0) return { ok: true, doc: value };
  const r = resolveParent(doc, segments);
  if (!r.ok) return r;
  const { parent, key } = r;
  if (Array.isArray(parent)) {
    const idx = parseIndex(key, parent.length, true);
    if (idx === null) return { ok: false, error: `Array index "${key}" is out of range (length ${parent.length}) or not a valid index.` };
    parent.splice(idx, 0, value);
  } else if (isObject(parent)) {
    parent[key] = value;
  } else {
    return { ok: false, error: `Cannot add to a ${parent === null ? "null" : typeof parent}.` };
  }
  return { ok: true, doc };
}

function removeAt(doc: JsonValue, segments: string[]): { ok: true; doc: JsonValue; removed: JsonValue } | { ok: false; error: string } {
  if (segments.length === 0) return { ok: false, error: "The root document cannot be removed." };
  const r = resolveParent(doc, segments);
  if (!r.ok) return r;
  const { parent, key } = r;
  if (Array.isArray(parent)) {
    const idx = parseIndex(key, parent.length, false);
    if (idx === null) return { ok: false, error: `Array index "${key}" does not exist (length ${parent.length}).` };
    const [removed] = parent.splice(idx, 1);
    return { ok: true, doc, removed };
  }
  if (isObject(parent)) {
    if (!Object.hasOwn(parent, key)) return { ok: false, error: `Property "${key}" does not exist.` };
    const removed = parent[key];
    delete parent[key];
    return { ok: true, doc, removed };
  }
  return { ok: false, error: `Cannot remove from a ${parent === null ? "null" : typeof parent}.` };
}

function replaceAt(doc: JsonValue, segments: string[], value: JsonValue): Located {
  if (segments.length === 0) return { ok: true, doc: value };
  const r = resolveParent(doc, segments);
  if (!r.ok) return r;
  const { parent, key } = r;
  if (Array.isArray(parent)) {
    const idx = parseIndex(key, parent.length, false);
    if (idx === null) return { ok: false, error: `Array index "${key}" does not exist (length ${parent.length}).` };
    parent[idx] = value;
  } else if (isObject(parent)) {
    if (!Object.hasOwn(parent, key)) return { ok: false, error: `Property "${key}" does not exist; use "add" to create it.` };
    parent[key] = value;
  } else {
    return { ok: false, error: `Cannot replace inside a ${parent === null ? "null" : typeof parent}.` };
  }
  return { ok: true, doc };
}

function isPrefix(prefix: string[], path: string[]): boolean {
  return prefix.length < path.length && prefix.every((s, i) => s === path[i]);
}

// ---------------------------------------------------------------------------
// RFC 6902 apply / parse
// ---------------------------------------------------------------------------

/** Apply a JSON Patch atomically. The input document is never mutated. */
export function applyJsonPatch(doc: JsonValue, patch: JsonPatchOp[]): PatchApplyResult {
  if (patch.length > MAX_PATCH_OPS) {
    return { ok: false, error: `Patch has ${patch.length.toLocaleString()} operations; the limit is ${MAX_PATCH_OPS.toLocaleString()}.`, failedIndex: MAX_PATCH_OPS };
  }
  let work: JsonValue = cloneJson(doc);
  for (let i = 0; i < patch.length; i++) {
    const op = patch[i];
    const fail = (error: string): PatchApplyError => ({ ok: false, error: `Operation ${i} (${op.op} ${op.path || '""'}): ${error}`, failedIndex: i });
    const path = parsePointer(op.path);
    if (!path.ok) return fail(path.error);
    switch (op.op) {
      case "add": {
        const r = addAt(work, path.segments, cloneJson(op.value));
        if (!r.ok) return fail(r.error);
        work = r.doc;
        break;
      }
      case "remove": {
        const r = removeAt(work, path.segments);
        if (!r.ok) return fail(r.error);
        work = r.doc;
        break;
      }
      case "replace": {
        const r = replaceAt(work, path.segments, cloneJson(op.value));
        if (!r.ok) return fail(r.error);
        work = r.doc;
        break;
      }
      case "test": {
        const actual = getByPointer(work, op.path);
        if (actual === undefined) return fail("location does not exist.");
        if (!deepEqual(actual, op.value)) return fail(`value is ${JSON.stringify(actual)}, expected ${JSON.stringify(op.value)}.`);
        break;
      }
      case "move":
      case "copy": {
        const from = parsePointer(op.from);
        if (!from.ok) return fail(from.error);
        if (op.op === "move" && isPrefix(from.segments, path.segments)) return fail("a location cannot be moved into one of its own children.");
        const value = getByPointer(work, op.from);
        if (value === undefined) return fail(`"from" location "${op.from}" does not exist.`);
        if (op.op === "move") {
          if (op.from === op.path) break; // moving onto itself is a no-op
          const removed = removeAt(work, from.segments);
          if (!removed.ok) return fail(removed.error);
          work = removed.doc;
          const added = addAt(work, path.segments, removed.removed);
          if (!added.ok) return fail(added.error);
          work = added.doc;
        } else {
          const added = addAt(work, path.segments, cloneJson(value));
          if (!added.ok) return fail(added.error);
          work = added.doc;
        }
        break;
      }
      default:
        return fail(`unknown operation "${String((op as { op: unknown }).op)}".`);
    }
  }
  return { ok: true, result: work, applied: patch.length };
}

/** Validate the shape of a single operation object. */
function validateOp(raw: JsonValue, index: number): { ok: true; op: JsonPatchOp } | { ok: false; error: string } {
  if (!isObject(raw)) return { ok: false, error: `Operation ${index} must be an object.` };
  const op = raw.op;
  if (typeof op !== "string" || !OPS.has(op)) {
    return { ok: false, error: `Operation ${index} has an invalid "op" (${JSON.stringify(op ?? null)}); expected add, remove, replace, move, copy or test.` };
  }
  if (typeof raw.path !== "string") return { ok: false, error: `Operation ${index} (${op}) is missing a string "path".` };
  const path = raw.path;
  if (op === "add" || op === "replace" || op === "test") {
    if (!Object.hasOwn(raw, "value")) return { ok: false, error: `Operation ${index} (${op}) is missing "value".` };
    return { ok: true, op: { op, path, value: raw.value } };
  }
  if (op === "move" || op === "copy") {
    if (typeof raw.from !== "string") return { ok: false, error: `Operation ${index} (${op}) is missing a string "from".` };
    return { ok: true, op: { op, path, from: raw.from } };
  }
  return { ok: true, op: { op: "remove", path } };
}

/** Parse and validate JSON Patch text (an array of operations). */
export function parsePatch(text: string): ParsePatchResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (!Array.isArray(parsed.value)) return { ok: false, error: "A JSON Patch must be an array of operations." };
  if (parsed.value.length > MAX_PATCH_OPS) return { ok: false, error: `Patch has ${parsed.value.length.toLocaleString()} operations; the limit is ${MAX_PATCH_OPS.toLocaleString()}.` };
  const ops: JsonPatchOp[] = [];
  for (let i = 0; i < parsed.value.length; i++) {
    const v = validateOp(parsed.value[i], i);
    if (!v.ok) return v;
    ops.push(v.op);
  }
  return { ok: true, ops };
}

// ---------------------------------------------------------------------------
// RFC 6902 generate
// ---------------------------------------------------------------------------

/** Build an edit script for two arrays using LCS over serialised elements. */
function arrayEditScript(a: JsonValue[], b: JsonValue[]): Array<"keep" | "remove" | "add"> {
  const ka = a.map((v) => JSON.stringify(v));
  const kb = b.map((v) => JSON.stringify(v));
  const n = ka.length;
  const m = kb.length;
  // L[i][j] = LCS length of a[i..] and b[j..], stored flat.
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = ka[i] === kb[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const script: Array<"keep" | "remove" | "add"> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      script.push("keep");
      i++;
      j++;
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
      script.push("remove");
      i++;
    } else {
      script.push("add");
      j++;
    }
  }
  while (i++ < n) script.push("remove");
  while (j++ < m) script.push("add");
  return script;
}

function diffArrays(a: JsonValue[], b: JsonValue[], path: string, out: JsonPatchOp[]): void {
  if (a.length > MAX_LCS_ELEMENTS || b.length > MAX_LCS_ELEMENTS) {
    // Index-wise fallback for very large arrays.
    const common = Math.min(a.length, b.length);
    for (let i = 0; i < common; i++) diffInto(a[i], b[i], joinPointer(path, i), out);
    for (let i = a.length; i > b.length; i--) out.push({ op: "remove", path: joinPointer(path, b.length) });
    for (let i = a.length; i < b.length; i++) out.push({ op: "add", path: joinPointer(path, "-"), value: cloneJson(b[i]) });
    return;
  }
  const script = arrayEditScript(a, b);
  let ai = 0; // cursor into a
  let bi = 0; // cursor into b
  let cur = 0; // index in the array as it is being patched
  for (let s = 0; s < script.length; s++) {
    const step = script[s];
    if (step === "keep") {
      ai++;
      bi++;
      cur++;
    } else if (step === "remove") {
      if (script[s + 1] === "add") {
        // remove + add at the same slot → describe it as an in-place change.
        diffInto(a[ai], b[bi], joinPointer(path, cur), out);
        ai++;
        bi++;
        cur++;
        s++;
      } else {
        out.push({ op: "remove", path: joinPointer(path, cur) });
        ai++;
      }
    } else {
      out.push({ op: "add", path: joinPointer(path, cur), value: cloneJson(b[bi]) });
      bi++;
      cur++;
    }
  }
}

function diffInto(a: JsonValue, b: JsonValue, path: string, out: JsonPatchOp[]): void {
  if (deepEqual(a, b)) return;
  if (isObject(a) && isObject(b)) {
    for (const key of Object.keys(a)) {
      if (!Object.hasOwn(b, key)) out.push({ op: "remove", path: joinPointer(path, key) });
      else diffInto(a[key], b[key], joinPointer(path, key), out);
    }
    for (const key of Object.keys(b)) {
      if (!Object.hasOwn(a, key)) out.push({ op: "add", path: joinPointer(path, key), value: cloneJson(b[key]) });
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    diffArrays(a, b, path, out);
    return;
  }
  out.push({ op: "replace", path, value: cloneJson(b) });
}

/** Generate a JSON Patch that transforms `from` into `to`. `applyJsonPatch(from, patch)` yields `to`. */
export function generateJsonPatch(from: JsonValue, to: JsonValue): JsonPatchOp[] {
  const out: JsonPatchOp[] = [];
  diffInto(from, to, "", out);
  return out;
}

// ---------------------------------------------------------------------------
// RFC 7386 merge patch
// ---------------------------------------------------------------------------

export type MergePatchResult = { ok: true; result: JsonValue } | { ok: false; error: string };

function mergeInto(target: JsonValue, patch: JsonValue): JsonValue {
  if (!isObject(patch)) return cloneJson(patch);
  const base: JsonObject = isObject(target) ? target : {};
  for (const key of Object.keys(patch)) {
    if (UNSAFE_SEGMENTS.has(key)) throw new Error(`Key "${key}" is not allowed (it would modify the object prototype).`);
    const value = patch[key];
    if (value === null) delete base[key];
    else base[key] = mergeInto(Object.hasOwn(base, key) ? base[key] : null, value);
  }
  return base;
}

/** Apply an RFC 7386 merge patch. `null` values delete keys; arrays are replaced wholesale. */
export function applyMergePatch(doc: JsonValue, patch: JsonValue): MergePatchResult {
  try {
    return { ok: true, result: mergeInto(cloneJson(doc), patch) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the merge patch." };
  }
}

/**
 * Generate an RFC 7386 merge patch. Note the format's inherent limit: a value
 * that becomes `null` is expressed as a deletion, because `null` means "remove".
 */
export function generateMergePatch(from: JsonValue, to: JsonValue): JsonValue {
  if (!isObject(from) || !isObject(to)) return cloneJson(to);
  const patch: JsonObject = {};
  for (const key of Object.keys(from)) {
    if (!Object.hasOwn(to, key)) patch[key] = null;
  }
  for (const key of Object.keys(to)) {
    const next = to[key];
    if (!Object.hasOwn(from, key)) {
      patch[key] = cloneJson(next);
    } else if (!deepEqual(from[key], next)) {
      patch[key] = isObject(from[key]) && isObject(next) ? generateMergePatch(from[key], next) : cloneJson(next);
    }
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const JSON_PATCH_SAMPLE_FROM = `{
  "id": "prod_42",
  "name": "Mechanical keyboard",
  "price": 129,
  "tags": ["hardware", "keyboard", "wired"],
  "stock": { "warehouse": 12, "store": 3 },
  "discontinued": false
}`;

export const JSON_PATCH_SAMPLE_TO = `{
  "id": "prod_42",
  "name": "Mechanical keyboard (v2)",
  "price": 119,
  "tags": ["hardware", "keyboard", "wireless", "bluetooth"],
  "stock": { "warehouse": 12, "outlet": 5 },
  "releasedAt": "2026-03-01"
}`;
