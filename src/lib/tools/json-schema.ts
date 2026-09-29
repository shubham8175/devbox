import { parseJson, type JsonValue } from "@/lib/tools/json";
import { compileSchema, type RawSchemaError } from "@/lib/tools/json-schema-engine";

/**
 * JSON Schema validation with friendly errors, on top of the interpreting
 * engine in json-schema-engine.ts. (Ajv was ruled out: it compiles schemas
 * with `new Function()`, which the app's Content Security Policy blocks.)
 */

export type SchemaDraft = "draft-07" | "2019-09" | "2020-12";

export const SCHEMA_DRAFTS: Array<{ id: SchemaDraft; label: string; uri: string }> = [
  { id: "2020-12", label: "Draft 2020-12", uri: "https://json-schema.org/draft/2020-12/schema" },
  { id: "2019-09", label: "Draft 2019-09", uri: "https://json-schema.org/draft/2019-09/schema" },
  { id: "draft-07", label: "Draft-07", uri: "http://json-schema.org/draft-07/schema#" },
];

export interface DraftDetection {
  /** Draft the validator will use. */
  draft: SchemaDraft;
  /** "declared" when `$schema` named it, "default" when absent or unrecognised. */
  source: "declared" | "default";
  /** Human note about the choice (e.g. draft-04 unsupported, default applied). */
  note: string;
}

export interface SchemaValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  /** Human-friendly message without the path. */
  message: string;
  /** `path: message`, for copying a plain-text error list. */
  formatted: string;
  /** The failing keyword's parameters, stringified. */
  params: string;
  /** 1-based line in the data text where the offending value starts. */
  line?: number;
  suggestion?: string;
}

export interface SchemaStats {
  /** Distinct validation keywords found in the schema. */
  keywords: string[];
  /** Total number of property names listed in `required` arrays. */
  requiredCount: number;
  /** Total number of declared `properties`. */
  propertyCount: number;
}

export interface SchemaValidationOk {
  ok: true;
  valid: boolean;
  errors: SchemaValidationError[];
  /** Compile-time problems with the schema itself. */
  schemaErrors?: string[];
  stats: SchemaStats;
  draft: DraftDetection;
}

export interface SchemaValidationFailure {
  ok: false;
  error: string;
  /** Which input could not be parsed. */
  side: "schema" | "data";
}

export type SchemaValidationResult = SchemaValidationOk | SchemaValidationFailure;

/** At most this many errors are listed; the rest are not collected. */
export const MAX_REPORTED_ERRORS = 500;

// ---------------------------------------------------------------------------
// Draft detection
// ---------------------------------------------------------------------------

export function detectDraft(schema: unknown): DraftDetection {
  const declared = schema && typeof schema === "object" && !Array.isArray(schema) ? (schema as { $schema?: unknown }).$schema : undefined;
  if (typeof declared !== "string" || !declared.trim()) {
    return { draft: "2020-12", source: "default", note: "No $schema keyword; validating as draft 2020-12." };
  }
  const uri = declared.trim().toLowerCase();
  if (uri.includes("2020-12")) return { draft: "2020-12", source: "declared", note: "Declared draft 2020-12." };
  if (uri.includes("2019-09")) return { draft: "2019-09", source: "declared", note: "Declared draft 2019-09." };
  if (uri.includes("draft-07")) return { draft: "draft-07", source: "declared", note: "Declared draft-07." };
  if (uri.includes("draft-06")) return { draft: "draft-07", source: "declared", note: "Draft-06 schemas are validated with the draft-07 vocabulary (a compatible superset)." };
  if (uri.includes("draft-04") || uri.includes("draft-03")) {
    return { draft: "draft-07", source: "declared", note: "Draft-04 and older are not supported by this validator; using draft-07 instead. Note that draft-04 boolean exclusiveMinimum/exclusiveMaximum and id differ." };
  }
  return { draft: "2020-12", source: "default", note: `Unrecognised $schema "${declared}"; validating as draft 2020-12.` };
}

// ---------------------------------------------------------------------------
// JSON Pointer → line resolver
// ---------------------------------------------------------------------------

function unescapePointer(pointer: string): string[] | null {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return null;
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * Find the 1-based line where the value addressed by a JSON Pointer starts in
 * `text`. Works on any valid JSON text (whitespace-agnostic), so the line
 * matches whatever the user typed. Returns undefined when the path is absent
 * or the text is not valid JSON.
 */
export function locateJsonPointer(text: string, pointer: string): number | undefined {
  const target = unescapePointer(pointer);
  if (!target) return undefined;
  const n = text.length;
  let pos = 0;
  let found = -1;

  const skipWs = () => {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++;
      else break;
    }
  };
  const readString = (): string | null => {
    // pos is at the opening quote
    let out = "";
    pos++;
    while (pos < n) {
      const ch = text[pos];
      if (ch === '"') {
        pos++;
        return out;
      }
      if (ch === "\\") {
        const next = text[pos + 1];
        if (next === "u") {
          const hex = text.slice(pos + 2, pos + 6);
          out += String.fromCharCode(parseInt(hex, 16) || 0);
          pos += 6;
        } else {
          const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
          out += map[next] ?? next;
          pos += 2;
        }
        continue;
      }
      out += ch;
      pos++;
    }
    return null;
  };
  const skipScalar = () => {
    while (pos < n && !',}]'.includes(text[pos]) && !/\s/.test(text[pos])) pos++;
  };

  // depth = how many leading target segments the current path matches.
  const walk = (depth: number): boolean => {
    skipWs();
    if (depth === target.length && found === -1) {
      found = pos;
      return true;
    }
    const ch = text[pos];
    if (ch === "{") {
      pos++;
      for (;;) {
        skipWs();
        if (text[pos] === "}") {
          pos++;
          return false;
        }
        if (text[pos] !== '"') return false;
        const key = readString();
        if (key === null) return false;
        skipWs();
        if (text[pos] !== ":") return false;
        pos++;
        const matches = depth < target.length && key === target[depth];
        if (matches ? walk(depth + 1) : skipValue()) return true;
        skipWs();
        if (text[pos] === ",") pos++;
        else if (text[pos] === "}") {
          pos++;
          return false;
        } else return false;
      }
    }
    if (ch === "[") {
      pos++;
      let index = 0;
      for (;;) {
        skipWs();
        if (text[pos] === "]") {
          pos++;
          return false;
        }
        const matches = depth < target.length && String(index) === target[depth];
        if (matches ? walk(depth + 1) : skipValue()) return true;
        index++;
        skipWs();
        if (text[pos] === ",") pos++;
        else if (text[pos] === "]") {
          pos++;
          return false;
        } else return false;
      }
    }
    if (ch === '"') {
      readString();
      return false;
    }
    skipScalar();
    return false;
  };
  // Skip a value without matching (depth that can never match).
  const skipValue = (): boolean => walk(Number.POSITIVE_INFINITY);

  try {
    walk(0);
  } catch {
    return undefined;
  }
  if (found === -1) return undefined;
  let line = 1;
  for (let i = 0; i < found; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// ---------------------------------------------------------------------------
// Friendly messages
// ---------------------------------------------------------------------------

function describeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function readPointer(data: JsonValue, pointer: string): unknown {
  const segs = unescapePointer(pointer);
  if (!segs) return undefined;
  let cur: unknown = data;
  for (const s of segs) {
    if (Array.isArray(cur)) cur = cur[Number(s)];
    else if (cur && typeof cur === "object" && Object.hasOwn(cur, s)) cur = (cur as Record<string, unknown>)[s];
    else return undefined;
  }
  return cur;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function friendly(err: RawSchemaError, actual: unknown): { message: string; suggestion?: string } {
  const p = err.params;
  switch (err.keyword) {
    case "required":
      return { message: `Missing required property "${str(p.missingProperty)}".`, suggestion: `Add "${str(p.missingProperty)}" to this object.` };
    case "additionalProperties":
      return { message: `Unexpected property "${str(p.additionalProperty)}".`, suggestion: `Remove "${str(p.additionalProperty)}" or declare it under "properties".` };
    case "unevaluatedProperties":
      return { message: `Property "${str(p.unevaluatedProperty)}" is not covered by the schema.` };
    case "type": {
      const expected = Array.isArray(p.type) ? (p.type as string[]).join(" or ") : str(p.type);
      return { message: `Expected ${expected}, got ${describeType(actual)}.`, suggestion: `Change the value to ${/^[aeiou]/.test(expected) ? "an" : "a"} ${expected}.` };
    }
    case "enum": {
      const allowed = Array.isArray(p.allowedValues) ? (p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ") : "";
      return { message: `Value ${JSON.stringify(actual)} is not one of the allowed values.`, suggestion: allowed ? `Use one of: ${allowed}.` : undefined };
    }
    case "const":
      return { message: `Value must be exactly ${JSON.stringify(p.allowedValue)}.` };
    case "format":
      return { message: `"${str(actual)}" is not a valid ${str(p.format)}.`, suggestion: `Use a value in the "${str(p.format)}" format.` };
    case "pattern":
      return { message: `"${str(actual)}" does not match the pattern ${str(p.pattern)}.` };
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
      return { message: `Value ${JSON.stringify(actual)} must be ${str(p.comparison)} ${str(p.limit)}.` };
    case "multipleOf":
      return { message: `Value ${JSON.stringify(actual)} must be a multiple of ${str(p.multipleOf)}.` };
    case "minLength":
      return { message: `String must be at least ${str(p.limit)} character${p.limit === 1 ? "" : "s"} long (got ${typeof actual === "string" ? actual.length : "?"}).` };
    case "maxLength":
      return { message: `String must be at most ${str(p.limit)} character${p.limit === 1 ? "" : "s"} long (got ${typeof actual === "string" ? actual.length : "?"}).` };
    case "minItems":
      return { message: `Array must have at least ${str(p.limit)} item${p.limit === 1 ? "" : "s"}.` };
    case "maxItems":
      return { message: `Array must have at most ${str(p.limit)} item${p.limit === 1 ? "" : "s"}.` };
    case "minProperties":
      return { message: `Object must have at least ${str(p.limit)} propert${p.limit === 1 ? "y" : "ies"}.` };
    case "maxProperties":
      return { message: `Object must have at most ${str(p.limit)} propert${p.limit === 1 ? "y" : "ies"}.` };
    case "uniqueItems":
      return { message: `Array items must be unique (items ${str(p.j)} and ${str(p.i)} are identical).` };
    case "anyOf":
      return { message: "Value does not match any of the allowed schemas (anyOf).", suggestion: "Check the nested errors above for each alternative." };
    case "oneOf":
      return { message: typeof p.passingSchemas !== "undefined" && p.passingSchemas !== null ? "Value matches more than one alternative; exactly one must match (oneOf)." : "Value matches none of the alternatives; exactly one must match (oneOf)." };
    case "not":
      return { message: "Value must not match the excluded schema (not)." };
    case "dependentRequired":
    case "dependencies":
      return { message: `Property "${str(p.property)}" requires "${str(p.missingProperty)}" to be present.` };
    case "propertyNames":
      return { message: `Property name "${str(p.propertyName)}" is not allowed.` };
    case "contains":
      return { message: "Array must contain at least one matching item (contains)." };
    case "if":
      return { message: `Value must match the "${str(p.failingKeyword)}" branch of the conditional.` };
    default: {
      const base = err.message ? err.message.charAt(0).toUpperCase() + err.message.slice(1) : `Failed "${err.keyword}".`;
      return { message: base.endsWith(".") ? base : `${base}.` };
    }
  }
}

// ---------------------------------------------------------------------------
// Schema stats
// ---------------------------------------------------------------------------

const VALIDATION_KEYWORDS = new Set([
  "type", "enum", "const", "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum", "maxLength", "minLength", "pattern",
  "items", "prefixItems", "additionalItems", "maxItems", "minItems", "uniqueItems", "contains", "minContains", "maxContains",
  "maxProperties", "minProperties", "required", "properties", "patternProperties", "additionalProperties", "dependentRequired",
  "dependentSchemas", "dependencies", "propertyNames", "unevaluatedItems", "unevaluatedProperties", "if", "then", "else",
  "allOf", "anyOf", "oneOf", "not", "format", "contentEncoding", "contentMediaType", "$ref", "$dynamicRef",
]);
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "patternProperties", "definitions", "$defs", "dependentSchemas"]);
const SCHEMA_KEYWORDS = new Set(["items", "additionalItems", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedItems", "unevaluatedProperties"]);
const SCHEMA_LIST_KEYWORDS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const MAX_STATS_NODES = 50_000;

export function schemaStats(schema: JsonValue): SchemaStats {
  const keywords = new Set<string>();
  let requiredCount = 0;
  let propertyCount = 0;
  let visited = 0;
  const walk = (node: JsonValue) => {
    if (++visited > MAX_STATS_NODES) return;
    if (typeof node === "boolean") return;
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (VALIDATION_KEYWORDS.has(key)) keywords.add(key);
      if (key === "required" && Array.isArray(value)) requiredCount += value.length;
      if (SCHEMA_MAP_KEYWORDS.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
        const entries = Object.values(value);
        if (key === "properties") propertyCount += entries.length;
        for (const sub of entries) walk(sub);
      } else if (SCHEMA_KEYWORDS.has(key) || (key === "items" && Array.isArray(value))) {
        if (Array.isArray(value)) for (const sub of value) walk(sub);
        else walk(value);
      } else if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value)) {
        for (const sub of value) walk(sub);
      }
    }
  };
  walk(schema);
  return { keywords: Array.from(keywords).sort(), requiredCount, propertyCount };
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** Force a draft instead of auto-detecting from `$schema`. */
  draft?: SchemaDraft | "auto";
}

/** Validate `dataText` against `schemaText`. */
export function validateJsonSchema(schemaText: string, dataText: string, options: ValidateOptions = {}): SchemaValidationResult {
  const schemaParsed = parseJson(schemaText);
  if (!schemaParsed.ok) return { ok: false, side: "schema", error: `Schema: ${schemaParsed.error}${schemaParsed.line ? ` (line ${schemaParsed.line})` : ""}` };
  const schema = schemaParsed.value;
  if (typeof schema !== "boolean" && (!schema || typeof schema !== "object" || Array.isArray(schema))) {
    return { ok: false, side: "schema", error: "Schema must be a JSON object (or a boolean)." };
  }
  const dataParsed = parseJson(dataText);
  if (!dataParsed.ok) return { ok: false, side: "data", error: `Data: ${dataParsed.error}${dataParsed.line ? ` (line ${dataParsed.line})` : ""}` };
  const data = dataParsed.value;

  const detected = detectDraft(schema);
  const draft: DraftDetection =
    options.draft && options.draft !== "auto" && options.draft !== detected.draft
      ? { draft: options.draft, source: "declared", note: `Validating as ${options.draft} (selected manually; ${detected.note.charAt(0).toLowerCase()}${detected.note.slice(1)})` }
      : detected;
  const stats = schemaStats(schema);

  const compiled = compileSchema(schema, { maxErrors: MAX_REPORTED_ERRORS });
  if (!compiled.ok) return { ok: true, valid: false, errors: [], schemaErrors: compiled.errors, stats, draft };

  let raw: RawSchemaError[];
  try {
    raw = compiled.validate(data);
  } catch (e) {
    return { ok: false, side: "schema", error: e instanceof Error ? e.message : "Validation threw an error." };
  }
  const valid = raw.length === 0;

  const errors: SchemaValidationError[] = raw.map((err) => {
    const actual = readPointer(data, err.instancePath);
    const { message, suggestion } = friendly(err, actual);
    const pathLabel = err.instancePath || "(root)";
    return {
      instancePath: err.instancePath,
      schemaPath: err.schemaPath,
      keyword: err.keyword,
      message,
      formatted: `${pathLabel}: ${message}`,
      params: JSON.stringify(err.params),
      line: locateJsonPointer(dataText, err.instancePath),
      suggestion,
    };
  });
  return { ok: true, valid, errors, stats, draft };
}

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------

type SchemaObject = { [key: string]: JsonValue };

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:?\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const URI_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i;
const MAX_INFER_NODES = 100_000;

function detectFormat(s: string): string | undefined {
  if (DATE_TIME_RE.test(s)) return "date-time";
  if (DATE_RE.test(s)) return "date";
  if (UUID_RE.test(s)) return "uuid";
  if (EMAIL_RE.test(s)) return "email";
  if (URI_RE.test(s)) return "uri";
  return undefined;
}

function typeList(v: JsonValue | undefined): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

/** Merge two inferred schemas (used to combine array elements). */
function mergeSchemas(a: SchemaObject, b: SchemaObject): SchemaObject {
  const ta = typeList(a.type);
  const tb = typeList(b.type);
  const same = ta.length === 1 && tb.length === 1 && ta[0] === tb[0];
  if (same && ta[0] === "object") {
    const pa = (a.properties ?? {}) as SchemaObject;
    const pb = (b.properties ?? {}) as SchemaObject;
    const properties: SchemaObject = {};
    for (const key of Object.keys(pa)) properties[key] = Object.hasOwn(pb, key) ? mergeSchemas(pa[key] as SchemaObject, pb[key] as SchemaObject) : pa[key];
    for (const key of Object.keys(pb)) if (!Object.hasOwn(pa, key)) properties[key] = pb[key];
    const ra = new Set(typeList(a.required));
    const required = typeList(b.required).filter((k) => ra.has(k));
    const out: SchemaObject = { type: "object", properties };
    if (required.length) out.required = required;
    return out;
  }
  if (same && ta[0] === "array") {
    const out: SchemaObject = { type: "array" };
    if (a.items && b.items) out.items = mergeSchemas(a.items as SchemaObject, b.items as SchemaObject);
    else if (a.items || b.items) out.items = a.items ?? b.items;
    return out;
  }
  if (same) {
    const out: SchemaObject = { type: ta[0] };
    if (a.format && a.format === b.format) out.format = a.format;
    return out;
  }
  // integer ⊂ number
  const types = Array.from(new Set([...ta, ...tb]));
  const merged = types.includes("number") ? types.filter((t) => t !== "integer") : types;
  return { type: merged.length === 1 ? merged[0] : merged };
}

/** Infer a draft 2020-12 schema from a JSON value: types, required keys, merged array items and string formats. */
export function generateSchemaFromJson(data: JsonValue): JsonValue {
  let nodes = 0;
  const infer = (v: JsonValue): SchemaObject => {
    if (++nodes > MAX_INFER_NODES) return {};
    if (v === null) return { type: "null" };
    if (typeof v === "boolean") return { type: "boolean" };
    if (typeof v === "number") return { type: Number.isInteger(v) ? "integer" : "number" };
    if (typeof v === "string") {
      const format = detectFormat(v);
      return format ? { type: "string", format } : { type: "string" };
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return { type: "array" };
      let items = infer(v[0]);
      for (let i = 1; i < v.length && nodes <= MAX_INFER_NODES; i++) items = mergeSchemas(items, infer(v[i]));
      return { type: "array", items };
    }
    const properties: SchemaObject = {};
    const keys = Object.keys(v);
    for (const key of keys) properties[key] = infer(v[key]);
    const out: SchemaObject = { type: "object", properties };
    if (keys.length) out.required = keys;
    return out;
  };
  const inferred = infer(data);
  return { $schema: "https://json-schema.org/draft/2020-12/schema", ...inferred };
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const JSON_SCHEMA_SAMPLE = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Product",
  "type": "object",
  "required": ["id", "name", "price", "status"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "price": { "type": "number", "minimum": 0 },
    "status": { "type": "string", "enum": ["draft", "active", "archived"] },
    "tags": { "type": "array", "items": { "type": "string" }, "uniqueItems": true },
    "createdAt": { "type": "string", "format": "date-time" },
    "warehouse": {
      "type": "object",
      "required": ["city", "country"],
      "properties": {
        "city": { "type": "string" },
        "country": { "type": "string", "pattern": "^[A-Z]{2}$" },
        "postcode": { "type": "string" }
      },
      "additionalProperties": false
    },
    "variants": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["sku", "stock"],
        "properties": {
          "sku": { "type": "string" },
          "stock": { "type": "integer", "minimum": 0 }
        }
      }
    }
  },
  "additionalProperties": false
}`;

/** Two deliberate errors: "status" is not in the enum and variants[1] is missing "stock". */
export const JSON_SCHEMA_DATA_SAMPLE = `{
  "id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "name": "Mechanical keyboard",
  "price": 129,
  "status": "published",
  "tags": ["hardware", "keyboard"],
  "createdAt": "2026-03-01T09:30:00Z",
  "warehouse": {
    "city": "Pune",
    "country": "IN",
    "postcode": "411001"
  },
  "variants": [
    { "sku": "KB-42-BLK", "stock": 12 },
    { "sku": "KB-42-WHT" }
  ]
}`;
