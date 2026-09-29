import type { JsonValue } from "@/lib/tools/json";

/**
 * A small, dependency-free JSON Schema validator (draft-07, 2019-09 and
 * 2020-12 vocabularies, local $ref only). It interprets the schema instead of
 * compiling it to JavaScript, so it runs under the app's Content Security
 * Policy, which forbids `eval` and `new Function()`. Error objects mirror the
 * shape Ajv produces (keyword, instancePath, schemaPath, params) so the
 * friendly-message layer in json-schema.ts is engine-agnostic.
 */

export interface RawSchemaError {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  message?: string;
  params: Record<string, unknown>;
}

export interface CompiledSchema {
  ok: true;
  /** Validate a document. Returns every error found (bounded by `maxErrors`). */
  validate: (data: JsonValue) => RawSchemaError[];
}

export interface CompileFailure {
  ok: false;
  errors: string[];
}

export interface EngineOptions {
  /** Stop collecting after this many errors. */
  maxErrors?: number;
}

type SchemaNode = JsonValue;
type SchemaObj = { [key: string]: JsonValue };

const KNOWN_TYPES = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
/** Guard against `{"$ref": "#"}`-style schemas that would recurse forever on one value. */
const MAX_REF_DEPTH = 64;
/** Nodes visited while checking the schema itself. */
const MAX_SCHEMA_NODES = 100_000;

const isObj = (v: unknown): v is SchemaObj => !!v && typeof v === "object" && !Array.isArray(v);

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(b) || typeof a !== "object" || typeof b !== "object") return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

function jsonType(v: JsonValue): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;
}

function matchesType(v: JsonValue, t: string): boolean {
  const actual = jsonType(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

const escapePointer = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

// ---------------------------------------------------------------------------
// Formats (the common subset of ajv-formats; unknown formats are ignored)
// ---------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?(z|[+-]\d{2}:\d{2})$/i;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[t ](\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:\d{2}))$/i;

function validDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[mo - 1];
}
function validTime(s: string): boolean {
  const m = TIME.exec(s);
  if (!m) return false;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return h < 24 && mi < 60 && se < 61;
}

const FORMATS: Record<string, (s: string) => boolean> = {
  date: validDate,
  time: validTime,
  "date-time": (s) => {
    const m = DATE_TIME.exec(s);
    return !!m && validDate(m[1]) && validTime(m[2]);
  },
  duration: (s) => /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(s),
  email: (s) => /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(s),
  hostname: (s) => s.length <= 253 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(s),
  ipv4: (s) => /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(s),
  ipv6: (s) => /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(([0-9a-f]{1,4}:)*[0-9a-f]{1,4})?::(([0-9a-f]{1,4}:)*[0-9a-f]{1,4})?)(%[0-9a-z]+)?$/i.test(s) && s.split("::").length <= 2,
  uri: (s) => /^[a-z][a-z0-9+.-]*:[^\s]*$/i.test(s) && !/[<>"{}|\\^`]/.test(s),
  "uri-reference": (s) => !/[\s<>"{}|\\^`]/.test(s),
  "uri-template": (s) => /^(?:[^{}\s]|\{[^{}\s]*\})*$/.test(s),
  url: (s) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s),
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  "json-pointer": (s) => s === "" || /^(\/([^~/]|~0|~1)*)*$/.test(s),
  "relative-json-pointer": (s) => /^(0|[1-9]\d*)(#|(\/([^~/]|~0|~1)*)*)$/.test(s),
  regex: (s) => {
    try {
      new RegExp(s, "u");
      return true;
    } catch {
      return false;
    }
  },
  byte: (s) => /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s),
  int32: (s) => /^-?\d+$/.test(s) && Number(s) >= -2147483648 && Number(s) <= 2147483647,
  int64: (s) => /^-?\d+$/.test(s),
  float: (s) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s),
  double: (s) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s),
  password: () => true,
  binary: () => true,
};

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

interface RefIndex {
  root: SchemaNode;
  /** Absolute and relative `$id`s / `$anchor`s that appear anywhere in the schema. */
  ids: Map<string, SchemaNode>;
}

function collectIds(root: SchemaNode): Map<string, SchemaNode> {
  const ids = new Map<string, SchemaNode>();
  let visited = 0;
  const walk = (node: SchemaNode, base: string) => {
    if (++visited > MAX_SCHEMA_NODES || !isObj(node)) return;
    let current = base;
    const id = node.$id ?? node.id;
    if (typeof id === "string" && id && !id.startsWith("#")) {
      current = resolveAgainst(base, id);
      ids.set(current, node);
      ids.set(id, node);
    } else if (typeof id === "string" && id.startsWith("#") && id.length > 1) {
      ids.set(`${current}${id}`, node);
      ids.set(id, node);
    }
    if (typeof node.$anchor === "string") {
      ids.set(`${current}#${node.$anchor}`, node);
      ids.set(`#${node.$anchor}`, node);
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "enum" || k === "const" || k === "default" || k === "examples") continue;
      if (Array.isArray(v)) for (const item of v) walk(item, current);
      else if (isObj(v)) {
        if (k === "properties" || k === "patternProperties" || k === "$defs" || k === "definitions" || k === "dependentSchemas" || k === "dependencies") {
          for (const sub of Object.values(v)) walk(sub, current);
        } else walk(v, current);
      }
    }
  };
  walk(root, "");
  return ids;
}

function resolveAgainst(base: string, ref: string): string {
  if (!base) return ref;
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

function resolvePointer(root: SchemaNode, pointer: string): SchemaNode | undefined {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let node: JsonValue | undefined = root;
  for (const rawSeg of pointer.slice(1).split("/")) {
    const seg = decodeURIComponent(rawSeg).replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(node)) node = /^\d+$/.test(seg) ? node[Number(seg)] : undefined;
    else if (isObj(node) && Object.hasOwn(node, seg)) node = node[seg];
    else return undefined;
  }
  return node;
}

function resolveRef(index: RefIndex, ref: string): SchemaNode | undefined {
  if (ref === "#") return index.root;
  if (ref.startsWith("#/")) return resolvePointer(index.root, ref.slice(1));
  const direct = index.ids.get(ref);
  if (direct !== undefined) return direct;
  const hash = ref.indexOf("#");
  if (hash >= 0) {
    const base = ref.slice(0, hash);
    const frag = ref.slice(hash + 1);
    const target = base ? index.ids.get(base) : index.root;
    if (target !== undefined) return frag.startsWith("/") ? resolvePointer(target, frag) : frag ? index.ids.get(`${base}#${frag}`) : target;
  }
  // Relative ids such as "item.json" referenced from the root.
  for (const [id, node] of index.ids) if (id.endsWith(`/${ref}`) || id.endsWith(ref)) return node;
  return undefined;
}

// ---------------------------------------------------------------------------
// Schema checking (compile-time errors)
// ---------------------------------------------------------------------------

const NUMERIC_KEYWORDS = ["multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"];
const COUNT_KEYWORDS = ["maxLength", "minLength", "maxItems", "minItems", "maxProperties", "minProperties", "minContains", "maxContains"];
const SUBSCHEMA_KEYWORDS = ["items", "additionalItems", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedItems", "unevaluatedProperties"];
const SUBSCHEMA_MAP_KEYWORDS = ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"];
const SUBSCHEMA_LIST_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];

function checkSchema(root: SchemaNode, index: RefIndex): string[] {
  const errors: string[] = [];
  let visited = 0;
  const check = (node: SchemaNode, path: string) => {
    if (++visited > MAX_SCHEMA_NODES) return;
    if (typeof node === "boolean") return;
    if (!isObj(node)) {
      errors.push(`${path || "schema"} must be an object or boolean`);
      return;
    }
    const at = (k: string) => `${path}/${k}`;
    if (node.type !== undefined) {
      const types = Array.isArray(node.type) ? node.type : [node.type];
      for (const t of types) if (typeof t !== "string" || !KNOWN_TYPES.has(t)) errors.push(`${at("type")} must be equal to one of the allowed values (got ${JSON.stringify(t)})`);
    }
    if (node.enum !== undefined && (!Array.isArray(node.enum) || node.enum.length === 0)) errors.push(`${at("enum")} must be a non-empty array`);
    if (node.required !== undefined && (!Array.isArray(node.required) || node.required.some((r) => typeof r !== "string"))) errors.push(`${at("required")} must be an array of strings`);
    for (const k of NUMERIC_KEYWORDS) if (node[k] !== undefined && typeof node[k] !== "number") errors.push(`${at(k)} must be a number`);
    if (typeof node.multipleOf === "number" && node.multipleOf <= 0) errors.push(`${at("multipleOf")} must be greater than 0`);
    for (const k of COUNT_KEYWORDS) {
      const v = node[k];
      if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) errors.push(`${at(k)} must be a non-negative integer`);
    }
    if (node.pattern !== undefined) {
      if (typeof node.pattern !== "string") errors.push(`${at("pattern")} must be a string`);
      else if (!FORMATS.regex(node.pattern)) errors.push(`${at("pattern")} is not a valid regular expression`);
    }
    if (node.patternProperties !== undefined) {
      if (!isObj(node.patternProperties)) errors.push(`${at("patternProperties")} must be an object`);
      else for (const p of Object.keys(node.patternProperties)) if (!FORMATS.regex(p)) errors.push(`${at("patternProperties")}/${p} is not a valid regular expression`);
    }
    if (node.$ref !== undefined) {
      if (typeof node.$ref !== "string") errors.push(`${at("$ref")} must be a string`);
      else if (resolveRef(index, node.$ref) === undefined) errors.push(`can't resolve reference ${node.$ref} from ${path || "#"}`);
    }
    if (node.format !== undefined && typeof node.format !== "string") errors.push(`${at("format")} must be a string`);
    for (const k of SUBSCHEMA_KEYWORDS) {
      const v = node[k];
      if (v === undefined) continue;
      if (k === "items" && Array.isArray(v)) v.forEach((s, i) => check(s, `${at(k)}/${i}`));
      else check(v, at(k));
    }
    for (const k of SUBSCHEMA_MAP_KEYWORDS) {
      const v = node[k];
      if (v === undefined) continue;
      if (!isObj(v)) errors.push(`${at(k)} must be an object`);
      else for (const [name, s] of Object.entries(v)) check(s, `${at(k)}/${escapePointer(name)}`);
    }
    if (isObj(node.dependencies)) {
      for (const [name, s] of Object.entries(node.dependencies)) if (!Array.isArray(s)) check(s, `${at("dependencies")}/${escapePointer(name)}`);
    }
    for (const k of SUBSCHEMA_LIST_KEYWORDS) {
      const v = node[k];
      if (v === undefined) continue;
      if (!Array.isArray(v)) errors.push(`${at(k)} must be an array`);
      else v.forEach((s, i) => check(s, `${at(k)}/${i}`));
    }
  };
  check(root, "");
  return errors;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface Annotations {
  props: Set<string>;
  /** Highest array index evaluated (+1), or -1 for "all items". */
  items: number;
}

class Validator {
  private errors: RawSchemaError[] = [];
  private regexCache = new Map<string, RegExp>();
  constructor(
    private index: RefIndex,
    private maxErrors: number,
  ) {}

  run(data: JsonValue): RawSchemaError[] {
    this.errors = [];
    this.validate(this.index.root, data, "", "#", 0);
    return this.errors;
  }

  private regex(p: string): RegExp {
    let re = this.regexCache.get(p);
    if (!re) {
      try {
        re = new RegExp(p, "u");
      } catch {
        re = new RegExp(p);
      }
      this.regexCache.set(p, re);
    }
    return re;
  }

  private push(errors: RawSchemaError[] | null, err: RawSchemaError) {
    if (errors) errors.push(err);
    else if (this.errors.length < this.maxErrors) this.errors.push(err);
  }

  /**
   * Validate `data` against `schema`. When `sink` is given, errors go there
   * instead of the main list (used for anyOf/oneOf/not/if trials). Returns the
   * evaluated-property annotations when the schema passed.
   */
  private validate(schema: SchemaNode, data: JsonValue, instancePath: string, schemaPath: string, depth: number, sink: RawSchemaError[] | null = null): { valid: boolean; ann: Annotations } {
    const ann: Annotations = { props: new Set(), items: 0 };
    if (schema === true) return { valid: true, ann };
    if (schema === false) {
      this.push(sink, { keyword: "false schema", instancePath, schemaPath: `${schemaPath}/false schema`, params: {}, message: "boolean schema is false" });
      return { valid: false, ann };
    }
    if (!isObj(schema)) return { valid: true, ann };
    const before = sink ? sink.length : this.errors.length;
    const s = schema;
    const at = (k: string) => `${schemaPath}/${k}`;
    const fail = (keyword: string, params: Record<string, unknown>, message?: string, ip = instancePath, sp = at(keyword)) =>
      this.push(sink, { keyword, instancePath: ip, schemaPath: sp, params, message });

    // $ref (and the 2019-09 / 2020-12 recursive forms, which we resolve the same way)
    const ref = typeof s.$ref === "string" ? s.$ref : typeof s.$dynamicRef === "string" ? s.$dynamicRef : typeof s.$recursiveRef === "string" ? s.$recursiveRef : null;
    if (ref !== null) {
      if (depth < MAX_REF_DEPTH) {
        const target = resolveRef(this.index, ref);
        if (target !== undefined) {
          const r = this.validate(target, data, instancePath, `${at("$ref")}`, depth + 1, sink);
          this.merge(ann, r.ann, r.valid);
        }
      }
    }

    // type
    if (s.type !== undefined) {
      const types = (Array.isArray(s.type) ? s.type : [s.type]).filter((t): t is string => typeof t === "string");
      if (types.length && !types.some((t) => matchesType(data, t))) {
        fail("type", { type: types.length === 1 ? types[0] : types }, `must be ${types.join(",")}`);
      }
    }
    if (Array.isArray(s.enum) && !s.enum.some((v) => deepEqual(v, data))) fail("enum", { allowedValues: s.enum }, "must be equal to one of the allowed values");
    if (s.const !== undefined && !deepEqual(s.const, data)) fail("const", { allowedValue: s.const }, "must be equal to constant");

    // numbers
    if (typeof data === "number") {
      if (typeof s.minimum === "number" && data < s.minimum) fail("minimum", { comparison: ">=", limit: s.minimum });
      if (typeof s.maximum === "number" && data > s.maximum) fail("maximum", { comparison: "<=", limit: s.maximum });
      if (typeof s.exclusiveMinimum === "number" && data <= s.exclusiveMinimum) fail("exclusiveMinimum", { comparison: ">", limit: s.exclusiveMinimum });
      if (typeof s.exclusiveMaximum === "number" && data >= s.exclusiveMaximum) fail("exclusiveMaximum", { comparison: "<", limit: s.exclusiveMaximum });
      if (typeof s.multipleOf === "number" && s.multipleOf > 0) {
        const q = data / s.multipleOf;
        if (Math.abs(q - Math.round(q)) > 1e-9) fail("multipleOf", { multipleOf: s.multipleOf });
      }
    }

    // strings
    if (typeof data === "string") {
      const len = Array.from(data).length;
      if (typeof s.minLength === "number" && len < s.minLength) fail("minLength", { limit: s.minLength });
      if (typeof s.maxLength === "number" && len > s.maxLength) fail("maxLength", { limit: s.maxLength });
      if (typeof s.pattern === "string" && !this.regex(s.pattern).test(data)) fail("pattern", { pattern: s.pattern });
      if (typeof s.format === "string") {
        const check = FORMATS[s.format];
        if (check && !check(data)) fail("format", { format: s.format });
      }
    }

    // arrays
    if (Array.isArray(data)) {
      if (typeof s.minItems === "number" && data.length < s.minItems) fail("minItems", { limit: s.minItems });
      if (typeof s.maxItems === "number" && data.length > s.maxItems) fail("maxItems", { limit: s.maxItems });
      if (s.uniqueItems === true) {
        outer: for (let i = 1; i < data.length; i++) {
          for (let j = 0; j < i; j++) {
            if (deepEqual(data[i], data[j])) {
              fail("uniqueItems", { i, j });
              break outer;
            }
          }
        }
      }
      const prefix = Array.isArray(s.prefixItems) ? s.prefixItems : Array.isArray(s.items) ? s.items : null;
      let evaluatedUpTo = 0;
      if (prefix) {
        const key = Array.isArray(s.prefixItems) ? "prefixItems" : "items";
        for (let i = 0; i < Math.min(prefix.length, data.length); i++) this.validate(prefix[i], data[i], `${instancePath}/${i}`, `${at(key)}/${i}`, depth, sink);
        evaluatedUpTo = Math.min(prefix.length, data.length);
        const rest = Array.isArray(s.prefixItems) ? s.items : s.additionalItems;
        const restKey = Array.isArray(s.prefixItems) ? "items" : "additionalItems";
        if (rest !== undefined) {
          for (let i = prefix.length; i < data.length; i++) this.validate(rest, data[i], `${instancePath}/${i}`, at(restKey), depth, sink);
          evaluatedUpTo = data.length;
        }
      } else if (s.items !== undefined) {
        for (let i = 0; i < data.length; i++) this.validate(s.items, data[i], `${instancePath}/${i}`, at("items"), depth, sink);
        evaluatedUpTo = data.length;
      }
      ann.items = Math.max(ann.items, evaluatedUpTo);
      if (s.contains !== undefined) {
        let count = 0;
        for (let i = 0; i < data.length; i++) if (this.validate(s.contains, data[i], `${instancePath}/${i}`, at("contains"), depth, []).valid) count++;
        const min = typeof s.minContains === "number" ? s.minContains : 1;
        if (count < min) fail("contains", { minContains: min });
        if (typeof s.maxContains === "number" && count > s.maxContains) fail("maxContains", { maxContains: s.maxContains });
      }
    }

    // objects
    if (isObj(data)) {
      const keys = Object.keys(data);
      if (Array.isArray(s.required)) {
        for (const r of s.required) if (typeof r === "string" && !Object.hasOwn(data, r)) fail("required", { missingProperty: r }, `must have required property '${r}'`);
      }
      if (typeof s.minProperties === "number" && keys.length < s.minProperties) fail("minProperties", { limit: s.minProperties });
      if (typeof s.maxProperties === "number" && keys.length > s.maxProperties) fail("maxProperties", { limit: s.maxProperties });
      const props = isObj(s.properties) ? s.properties : null;
      const patterns = isObj(s.patternProperties) ? Object.entries(s.patternProperties) : [];
      for (const key of keys) {
        let covered = false;
        const childPath = `${instancePath}/${escapePointer(key)}`;
        if (props && Object.hasOwn(props, key)) {
          covered = true;
          this.validate(props[key], data[key], childPath, `${at("properties")}/${escapePointer(key)}`, depth, sink);
        }
        for (const [p, sub] of patterns) {
          if (this.regex(p).test(key)) {
            covered = true;
            this.validate(sub, data[key], childPath, `${at("patternProperties")}/${escapePointer(p)}`, depth, sink);
          }
        }
        if (covered) ann.props.add(key);
        else if (s.additionalProperties !== undefined) {
          if (s.additionalProperties === false) fail("additionalProperties", { additionalProperty: key }, "must NOT have additional properties");
          else this.validate(s.additionalProperties, data[key], childPath, at("additionalProperties"), depth, sink);
          ann.props.add(key);
        }
        if (s.propertyNames !== undefined) {
          const r = this.validate(s.propertyNames, key, instancePath, at("propertyNames"), depth, []);
          if (!r.valid) fail("propertyNames", { propertyName: key });
        }
      }
      const depRequired = isObj(s.dependentRequired) ? s.dependentRequired : null;
      const depSchemas = isObj(s.dependentSchemas) ? s.dependentSchemas : null;
      const legacy = isObj(s.dependencies) ? s.dependencies : null;
      const requiredDeps: Array<[string, JsonValue]> = [...(depRequired ? Object.entries(depRequired) : []), ...(legacy ? Object.entries(legacy).filter(([, v]) => Array.isArray(v)) : [])];
      const schemaDeps: Array<[string, JsonValue]> = [...(depSchemas ? Object.entries(depSchemas) : []), ...(legacy ? Object.entries(legacy).filter(([, v]) => !Array.isArray(v)) : [])];
      for (const [prop, list] of requiredDeps) {
        if (!Object.hasOwn(data, prop) || !Array.isArray(list)) continue;
        for (const need of list) if (typeof need === "string" && !Object.hasOwn(data, need)) fail(depRequired && Object.hasOwn(depRequired, prop) ? "dependentRequired" : "dependencies", { property: prop, missingProperty: need });
      }
      for (const [prop, sub] of schemaDeps) {
        if (!Object.hasOwn(data, prop)) continue;
        const key = depSchemas && Object.hasOwn(depSchemas, prop) ? "dependentSchemas" : "dependencies";
        const r = this.validate(sub, data, instancePath, `${at(key)}/${escapePointer(prop)}`, depth, sink);
        this.merge(ann, r.ann, r.valid);
      }
    }

    // combinators
    if (Array.isArray(s.allOf)) {
      s.allOf.forEach((sub, i) => {
        const r = this.validate(sub, data, instancePath, `${at("allOf")}/${i}`, depth, sink);
        this.merge(ann, r.ann, r.valid);
      });
    }
    if (Array.isArray(s.anyOf)) {
      const trials: RawSchemaError[][] = [];
      let any = false;
      s.anyOf.forEach((sub, i) => {
        const errs: RawSchemaError[] = [];
        const r = this.validate(sub, data, instancePath, `${at("anyOf")}/${i}`, depth, errs);
        if (r.valid) {
          any = true;
          this.merge(ann, r.ann, true);
        }
        trials.push(errs);
      });
      if (!any) {
        for (const errs of trials) for (const e of errs) this.push(sink, e);
        fail("anyOf", {}, "must match a schema in anyOf");
      }
    }
    if (Array.isArray(s.oneOf)) {
      const passing: number[] = [];
      const trials: RawSchemaError[][] = [];
      s.oneOf.forEach((sub, i) => {
        const errs: RawSchemaError[] = [];
        const r = this.validate(sub, data, instancePath, `${at("oneOf")}/${i}`, depth, errs);
        if (r.valid) {
          passing.push(i);
          this.merge(ann, r.ann, true);
        }
        trials.push(errs);
      });
      if (passing.length !== 1) {
        if (passing.length === 0) for (const errs of trials) for (const e of errs) this.push(sink, e);
        fail("oneOf", { passingSchemas: passing.length ? passing : null }, "must match exactly one schema in oneOf");
      }
    }
    if (s.not !== undefined) {
      const r = this.validate(s.not, data, instancePath, at("not"), depth, []);
      if (r.valid) fail("not", {}, "must NOT be valid");
    }
    if (s.if !== undefined) {
      const cond = this.validate(s.if, data, instancePath, at("if"), depth, []);
      const branch = cond.valid ? "then" : "else";
      if (cond.valid) this.merge(ann, cond.ann, true);
      if (s[branch] !== undefined) {
        const r = this.validate(s[branch], data, instancePath, at(branch), depth, sink);
        this.merge(ann, r.ann, r.valid);
        if (!r.valid) fail("if", { failingKeyword: branch }, `must match "${branch}" schema`);
      }
    }

    // unevaluated*
    if (isObj(data) && s.unevaluatedProperties !== undefined) {
      for (const key of Object.keys(data)) {
        if (ann.props.has(key)) continue;
        if (s.unevaluatedProperties === false) fail("unevaluatedProperties", { unevaluatedProperty: key }, "must NOT have unevaluated properties");
        else this.validate(s.unevaluatedProperties, data[key], `${instancePath}/${escapePointer(key)}`, at("unevaluatedProperties"), depth, sink);
        ann.props.add(key);
      }
    }
    if (Array.isArray(data) && s.unevaluatedItems !== undefined && ann.items >= 0 && ann.items < data.length) {
      for (let i = ann.items; i < data.length; i++) {
        if (s.unevaluatedItems === false) fail("unevaluatedItems", { unevaluatedItem: i }, "must NOT have unevaluated items", `${instancePath}/${i}`);
        else this.validate(s.unevaluatedItems, data[i], `${instancePath}/${i}`, at("unevaluatedItems"), depth, sink);
      }
      ann.items = data.length;
    }

    const after = sink ? sink.length : this.errors.length;
    return { valid: after === before, ann };
  }

  private merge(into: Annotations, from: Annotations, valid: boolean) {
    if (!valid) return;
    for (const p of from.props) into.props.add(p);
    into.items = Math.max(into.items, from.items);
  }
}

/** Check a schema and return a validator for it, or the list of schema problems. */
export function compileSchema(schema: JsonValue, options: EngineOptions = {}): CompiledSchema | CompileFailure {
  const index: RefIndex = { root: schema, ids: collectIds(schema) };
  const errors = checkSchema(schema, index);
  if (errors.length) return { ok: false, errors };
  const maxErrors = options.maxErrors ?? 500;
  return {
    ok: true,
    validate: (data) => new Validator(index, maxErrors).run(data),
  };
}

/** Formats this engine understands; others are accepted without checking. */
export const SUPPORTED_FORMATS = Object.keys(FORMATS);
