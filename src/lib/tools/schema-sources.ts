/**
 * Parsers that turn other schema sources into the same normalized table model
 * as `parseDdl` / `parsePrismaSchema`, so the Schema Visualizer can draw them:
 *
 *   - JSON / MongoDB documents (sample docs, mongosh inserts, mongoexport lines)
 *   - Mongoose schemas
 *   - TypeScript interfaces and type aliases (incl. Kysely `Generated<>` tables)
 *   - Drizzle `pgTable` / `mysqlTable` / `sqliteTable` definitions
 *   - TypeORM entity classes
 *   - Sequelize `define` / `Model.init` calls and associations
 *
 * Everything is tolerant, regex-and-token based parsing of pasted text. Nothing
 * is evaluated, executed or sent anywhere.
 */

import { DDL_LIMITS, DDL_SAMPLE, PRISMA_SAMPLE, findTable, finalizeTable, newTable, normalizeType, parseDdl, parsePrismaSchema, type BaseType, type Column, type DdlParseResult, type Table } from "@/lib/tools/ddl";
import { camelCase, plural, singular } from "@/lib/tools/sql-to-orm";

export type SchemaSource = "sql" | "prisma" | "json" | "mongoose" | "typescript" | "drizzle" | "typeorm" | "sequelize";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function tooLarge(text: string): DdlParseResult | null {
  if (text.length > DDL_LIMITS.maxChars) return { ok: false, error: `Input is too large (${Math.round(text.length / 1000)} KB). The limit is ${DDL_LIMITS.maxChars / 1000} KB.` };
  return null;
}

function pushWarning(warnings: string[], msg: string) {
  if (warnings.length < DDL_LIMITS.maxWarnings && !warnings.includes(msg)) warnings.push(msg);
}

function makeColumn(name: string, type: string, baseType: BaseType, extra: Partial<Column> = {}): Column {
  return { name, type, baseType, nullable: true, autoIncrement: false, primaryKey: false, unique: false, ...extra };
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip a foreign-key style suffix (`user_id`, `userId`, `ownerIds`) and return the base word, or null. */
function fkBase(field: string): string | null {
  const m = /^(.+?)(?:_?[iI][dD][sS]?)$/.exec(field);
  if (!m) return null;
  const base = m[1].replace(/_+$/, "");
  return base.length ? base : null;
}

/**
 * Guess which table a field points at from its name (`author_id` → authors, `userId` → users / User).
 * With `loose`, a field named exactly like a table (`device` → devices) also counts.
 */
function guessRefTable(field: string, tableNames: string[], loose = false): string | undefined {
  const base = fkBase(field);
  const candidates = new Set<string>();
  const add = (s: string) => {
    if (!s) return;
    candidates.add(norm(s));
    candidates.add(norm(plural(s)));
    candidates.add(norm(singular(s)));
  };
  if (base) add(base);
  if (loose) add(field);
  if (!candidates.size) return undefined;
  return tableNames.find((t) => candidates.has(norm(t)));
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OID_RE = /^[0-9a-f]{24}$/i;

// ---------------------------------------------------------------------------
// Loose JavaScript / TypeScript tokenizer and value parser
// ---------------------------------------------------------------------------

type TokKind = "str" | "num" | "id" | "p";
interface Tok {
  t: TokKind;
  v: string;
  s: number;
  e: number;
}

const PUNCT3 = ["...", "===", "!==", "?.(", ">>>"];
const PUNCT2 = ["=>", "?.", "??", "||", "&&", "==", "!=", "<=", ">=", "+=", "-=", "**", "++", "--"];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? n : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      let out = "";
      while (j < n && src[j] !== ch) {
        if (src[j] === "\\" && j + 1 < n) {
          const e = src[j + 1];
          out += e === "n" ? "\n" : e === "t" ? "\t" : e;
          j += 2;
          continue;
        }
        if (ch === "`" && src[j] === "$" && src[j + 1] === "{") {
          // Skip template interpolation
          let depth = 1;
          j += 2;
          while (j < n && depth) {
            if (src[j] === "{") depth++;
            else if (src[j] === "}") depth--;
            j++;
          }
          out += "${}";
          continue;
        }
        out += src[j++];
      }
      toks.push({ t: "str", v: out, s: i, e: Math.min(n, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|[0-9][0-9_]*(\.[0-9_]*)?([eE][+-]?[0-9]+)?|\.[0-9_]+([eE][+-]?[0-9]+)?)n?/.exec(src.slice(i));
      const text = m ? m[0] : ch;
      toks.push({ t: "num", v: text.replace(/_/g, "").replace(/n$/, ""), s: i, e: i + text.length });
      i += text.length;
      continue;
    }
    if (/[A-Za-z_$#]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), s: i, e: j });
      i = j;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (PUNCT3.includes(three)) {
      toks.push({ t: "p", v: three, s: i, e: i + 3 });
      i += 3;
      continue;
    }
    if (PUNCT2.includes(two)) {
      toks.push({ t: "p", v: two, s: i, e: i + 2 });
      i += 2;
      continue;
    }
    toks.push({ t: "p", v: ch, s: i, e: i + 1 });
    i++;
  }
  return toks;
}

export type JsVal =
  | { k: "str"; v: string }
  | { k: "num"; v: number }
  | { k: "bool"; v: boolean }
  | { k: "null" }
  | { k: "obj"; props: Array<{ key: string; value: JsVal }> }
  | { k: "arr"; items: JsVal[] }
  /** Identifier, member chain and calls: `Schema.Types.ObjectId`, `serial("id").primaryKey()` */
  | { k: "ref"; chain: Array<{ name: string; args?: JsVal[] }> }
  | { k: "arrow"; params: string[]; body: JsVal }
  | { k: "raw"; text: string };

class Reader {
  i = 0;
  constructor(
    public toks: Tok[],
    public src: string,
  ) {}
  peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  next(): Tok | undefined {
    return this.toks[this.i++];
  }
  isP(v: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === "p" && t.v === v;
  }
  isId(v: string, o = 0): boolean {
    const t = this.peek(o);
    return !!t && t.t === "id" && t.v === v;
  }
  done(): boolean {
    return this.i >= this.toks.length;
  }
}

const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/** Skip a balanced bracket group starting at the current opening token. */
function skipBalanced(r: Reader): void {
  const open = r.next();
  if (!open || !(open.v in OPEN)) return;
  let depth = 1;
  while (!r.done() && depth) {
    const t = r.next()!;
    if (t.t === "p") {
      if (t.v in OPEN) depth++;
      else if (t.v === ")" || t.v === "]" || t.v === "}") depth--;
    }
  }
}

/** Skip a `<...>` generic argument list when it immediately follows the previous token. */
function skipGenerics(r: Reader): void {
  if (!r.isP("<")) return;
  let depth = 0;
  while (!r.done()) {
    const t = r.next()!;
    if (t.t === "p" && t.v === "<") depth++;
    else if (t.t === "p" && (t.v === ">" || t.v === ">>" || t.v === ">>>")) {
      depth -= t.v.length;
      if (depth <= 0) return;
    } else if (t.t === "p" && t.v === ">=") depth--;
    if (t.t === "p" && (t.v === ";" || t.v === "{")) return;
  }
}

function skipToSeparator(r: Reader): void {
  let depth = 0;
  while (!r.done()) {
    const t = r.peek()!;
    if (t.t === "p") {
      if (t.v in OPEN) depth++;
      else if (t.v === ")" || t.v === "]" || t.v === "}") {
        if (depth === 0) return;
        depth--;
      } else if ((t.v === "," || t.v === ";") && depth === 0) return;
    }
    r.next();
  }
}

function parseArgs(r: Reader): JsVal[] {
  const args: JsVal[] = [];
  if (!r.isP("(")) return args;
  r.next();
  while (!r.done() && !r.isP(")")) {
    if (r.isP("...")) r.next();
    args.push(parseValue(r));
    if (r.isP(",")) r.next();
    else if (!r.isP(")")) {
      skipToSeparator(r);
      if (r.isP(",")) r.next();
    }
  }
  if (r.isP(")")) r.next();
  return args;
}

const BINARY_OPS = new Set(["||", "??", "&&", "+", "-", "*", "/", "%", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "|", "&"]);

/** Parse one loose JS value at the reader position. Never throws; unknown syntax becomes `raw`. */
export function parseValue(r: Reader): JsVal {
  const value = parsePrimary(r);
  return parseTail(r, value);
}

function parseTail(r: Reader, value: JsVal): JsVal {
  for (;;) {
    const t = r.peek();
    if (!t || t.t !== "p" && !(t.t === "id" && (t.v === "as" || t.v === "satisfies"))) return value;
    if (t.t === "id") {
      // `as const`, `as Foo<Bar>`
      r.next();
      if (r.peek()?.t === "id") {
        r.next();
        while (r.isP(".") && r.peek(1)?.t === "id") {
          r.next();
          r.next();
        }
        skipGenerics(r);
      }
      continue;
    }
    if (t.v === "?" && !r.isP(":", 1)) {
      r.next();
      parseValue(r);
      if (r.isP(":")) {
        r.next();
        parseValue(r);
      }
      continue;
    }
    if (BINARY_OPS.has(t.v)) {
      r.next();
      parseValue(r);
      continue;
    }
    return value;
  }
}

function parsePrimary(r: Reader): JsVal {
  const t = r.peek();
  if (!t) return { k: "raw", text: "" };
  if (t.t === "str") return r.next(), { k: "str", v: t.v };
  if (t.t === "num") return r.next(), { k: "num", v: Number(t.v) };
  if (t.t === "p") {
    if (t.v === "-" && r.peek(1)?.t === "num") {
      r.next();
      const v = r.next()!;
      return { k: "num", v: -Number(v.v) };
    }
    if (t.v === "!" || t.v === "+" || t.v === "~") return r.next(), parsePrimary(r);
    if (t.v === "{") return parseObject(r);
    if (t.v === "[") return parseArray(r);
    if (t.v === "(") {
      // Arrow function `(a, b) => body` or parenthesised expression.
      let j = r.i + 1;
      let depth = 1;
      while (j < r.toks.length && depth) {
        const x = r.toks[j];
        if (x.t === "p" && x.v === "(") depth++;
        else if (x.t === "p" && x.v === ")") depth--;
        j++;
      }
      const after = r.toks[j];
      if (after && after.t === "p" && after.v === "=>") {
        const params = r.toks
          .slice(r.i + 1, j - 1)
          .filter((x) => x.t === "id")
          .map((x) => x.v);
        r.i = j + 1;
        return { k: "arrow", params, body: parseArrowBody(r) };
      }
      r.next();
      const inner = parseValue(r);
      while (!r.done() && !r.isP(")")) r.next();
      if (r.isP(")")) r.next();
      return inner;
    }
    if (t.v === "@") {
      // Decorator inside an expression; skip it.
      r.next();
      return parsePrimary(r);
    }
    r.next();
    return { k: "raw", text: t.v };
  }
  // identifiers
  if (t.v === "true" || t.v === "false") return r.next(), { k: "bool", v: t.v === "true" };
  if (t.v === "null" || t.v === "undefined") return r.next(), { k: "null" };
  if (t.v === "new" || t.v === "await" || t.v === "typeof" || t.v === "void") return r.next(), parsePrimary(r);
  if (t.v === "async" && (r.isId("function", 1) || r.isP("(", 1) || (r.peek(1)?.t === "id" && r.isP("=>", 2)))) return r.next(), parsePrimary(r);
  if (t.v === "function") {
    const start = t.s;
    r.next();
    if (r.peek()?.t === "id") r.next();
    if (r.isP("(")) skipBalanced(r);
    if (r.isP(":")) {
      r.next();
      while (!r.done() && !r.isP("{")) r.next();
    }
    if (r.isP("{")) skipBalanced(r);
    const end = r.toks[r.i - 1]?.e ?? start;
    return { k: "raw", text: r.src.slice(start, end) };
  }
  if (r.isP("=>", 1)) {
    r.next();
    r.next();
    return { k: "arrow", params: [t.v], body: parseArrowBody(r) };
  }
  // Member / call chain
  r.next();
  const chain: Array<{ name: string; args?: JsVal[] }> = [{ name: t.v }];
  for (;;) {
    const p = r.peek();
    if (!p || p.t !== "p") break;
    if (p.v === "<" && p.s === r.toks[r.i - 1].e) {
      skipGenerics(r);
      continue;
    }
    if (p.v === "(") {
      chain[chain.length - 1].args = parseArgs(r);
      continue;
    }
    if ((p.v === "." || p.v === "?.") && r.peek(1)?.t === "id") {
      r.next();
      chain.push({ name: r.next()!.v });
      continue;
    }
    if (p.v === "[" ) {
      skipBalanced(r);
      chain.push({ name: "[]" });
      continue;
    }
    if (p.v === "!" && (r.isP(".", 1) || r.isP("(", 1))) {
      r.next();
      continue;
    }
    break;
  }
  return { k: "ref", chain };
}

function parseArrowBody(r: Reader): JsVal {
  if (r.isP("{")) {
    // Block body: keep it opaque.
    const start = r.peek()!.s;
    skipBalanced(r);
    return { k: "raw", text: r.src.slice(start, r.toks[r.i - 1]?.e ?? start) };
  }
  return parseValue(r);
}

function parseObject(r: Reader): JsVal {
  const props: Array<{ key: string; value: JsVal }> = [];
  r.next(); // {
  while (!r.done() && !r.isP("}")) {
    const t = r.peek()!;
    if (t.t === "p" && t.v === ",") {
      r.next();
      continue;
    }
    if (t.t === "p" && t.v === "...") {
      r.next();
      parseValue(r);
      continue;
    }
    let key: string | null = null;
    if (t.t === "id" || t.t === "str" || t.t === "num") {
      key = t.v;
      r.next();
    } else if (t.t === "p" && t.v === "[") {
      skipBalanced(r);
      key = "[computed]";
    } else {
      skipToSeparator(r);
      continue;
    }
    // async / get / set method modifiers before the real key
    if ((key === "async" || key === "get" || key === "set" || key === "readonly") && (r.peek()?.t === "id" || r.peek()?.t === "str")) {
      key = r.next()!.v;
    }
    if (r.isP("?")) r.next();
    if (r.isP(":")) {
      r.next();
      props.push({ key, value: parseValue(r) });
    } else if (r.isP("(")) {
      // Method shorthand
      const start = t.s;
      skipBalanced(r);
      if (r.isP("{")) skipBalanced(r);
      props.push({ key, value: { k: "raw", text: r.src.slice(start, r.toks[r.i - 1]?.e ?? start) } });
    } else {
      props.push({ key, value: { k: "ref", chain: [{ name: key }] } });
    }
    if (r.isP(",")) r.next();
    else if (!r.isP("}")) skipToSeparator(r);
  }
  if (r.isP("}")) r.next();
  return { k: "obj", props };
}

function parseArray(r: Reader): JsVal {
  const items: JsVal[] = [];
  r.next(); // [
  while (!r.done() && !r.isP("]")) {
    if (r.isP(",")) {
      r.next();
      continue;
    }
    if (r.isP("...")) r.next();
    items.push(parseValue(r));
    if (r.isP(",")) r.next();
    else if (!r.isP("]")) skipToSeparator(r);
  }
  if (r.isP("]")) r.next();
  return { k: "arr", items };
}

// Value helpers
function prop(v: JsVal | undefined, key: string): JsVal | undefined {
  if (!v || v.k !== "obj") return undefined;
  return v.props.find((p) => p.key === key)?.value;
}
function strOf(v: JsVal | undefined): string | undefined {
  if (!v) return undefined;
  if (v.k === "str") return v.v;
  if (v.k === "num") return String(v.v);
  if (v.k === "ref") return chainText(v);
  return undefined;
}
function boolOf(v: JsVal | undefined): boolean | undefined {
  if (!v) return undefined;
  if (v.k === "bool") return v.v;
  if (v.k === "null") return false;
  if (v.k === "arr") return v.items.length ? boolOf(v.items[0]) : false;
  if (v.k === "str") return v.v.length > 0;
  if (v.k === "num") return v.v !== 0;
  return true;
}
function numOf(v: JsVal | undefined): number | undefined {
  return v && v.k === "num" ? v.v : undefined;
}
function chainText(v: JsVal): string {
  return v.k === "ref" ? v.chain.map((c) => c.name).join(".") : "";
}
function lastSeg(v: JsVal): { name: string; args?: JsVal[] } | undefined {
  return v.k === "ref" ? v.chain[v.chain.length - 1] : undefined;
}
function strList(v: JsVal | undefined): string[] {
  if (!v) return [];
  if (v.k === "arr") return v.items.map(strOf).filter((s): s is string => !!s);
  const s = strOf(v);
  return s ? [s] : [];
}
/** Render a value back to something readable for a default expression. */
function defaultText(v: JsVal | undefined): string | undefined {
  if (!v) return undefined;
  switch (v.k) {
    case "str":
      return `'${v.v}'`;
    case "num":
      return String(v.v);
    case "bool":
      return String(v.v);
    case "null":
      return "NULL";
    case "ref":
      return chainText(v) + (lastSeg(v)?.args ? "()" : "");
    case "arrow":
      return defaultText(v.body);
    case "arr":
      return `[${v.items.map(defaultText).filter(Boolean).join(", ")}]`;
    case "obj":
      return "{…}";
    default:
      return v.text || undefined;
  }
}

/** Index of the `(` that opens a call at token `i`, skipping a `<generic>` list; -1 when `i` is not called. */
function callParen(toks: Tok[], i: number): number {
  let j = i + 1;
  if (toks[j]?.t === "p" && toks[j].v === "<") {
    let depth = 0;
    for (; j < toks.length; j++) {
      const v = toks[j].v;
      if (toks[j].t !== "p") continue;
      if (v === "<") depth++;
      else if (v === ">") depth--;
      else if (v === ">>") depth -= 2;
      else if (v === ";" || v === "{") return -1;
      if (depth <= 0) {
        j++;
        break;
      }
    }
  }
  return toks[j]?.t === "p" && toks[j].v === "(" ? j : -1;
}

/** Position of the identifier token that directly precedes `= <anchor>` (a `const name =`). */
function assignedName(r: Reader, idx: number): string | undefined {
  const eq = r.toks[idx - 1];
  const nm = r.toks[idx - 2];
  if (eq && eq.t === "p" && eq.v === "=" && nm && nm.t === "id") return nm.v;
  return undefined;
}

// ---------------------------------------------------------------------------
// 1. JSON / MongoDB documents
// ---------------------------------------------------------------------------

type Plain = null | boolean | number | string | Plain[] | { [k: string]: Plain } | Special;
type Special = { $type: "ObjectId" | "Date" | "Long" | "Decimal" | "Binary" | "UUID" | "Regex"; v: string };

function isSpecial(v: Plain): v is Special {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "$type" in v && typeof (v as Special).$type === "string" && "v" in v;
}

const SHELL_CTORS: Record<string, Special["$type"]> = {
  ObjectId: "ObjectId",
  ObjectID: "ObjectId",
  ISODate: "Date",
  Date: "Date",
  NumberLong: "Long",
  Long: "Long",
  NumberInt: "Long",
  NumberDecimal: "Decimal",
  Decimal128: "Decimal",
  BinData: "Binary",
  Binary: "Binary",
  UUID: "UUID",
  Timestamp: "Date",
  RegExp: "Regex",
};

/** Convert a parsed loose value into plain data, folding Extended JSON and shell constructors. */
function toPlain(v: JsVal): Plain {
  switch (v.k) {
    case "str":
      return v.v;
    case "num":
      return v.v;
    case "bool":
      return v.v;
    case "null":
      return null;
    case "arr":
      return v.items.map(toPlain);
    case "obj": {
      const o: { [k: string]: Plain } = {};
      for (const p of v.props) o[p.key] = toPlain(p.value);
      const keys = Object.keys(o);
      if (keys.length === 1) {
        const k = keys[0];
        const val = o[k];
        if (k === "$oid") return { $type: "ObjectId", v: String(val) };
        if (k === "$date") return { $type: "Date", v: typeof val === "object" && val && "$numberLong" in val ? String((val as { [k: string]: Plain }).$numberLong) : String(val) };
        if (k === "$numberLong" || k === "$numberInt") return { $type: "Long", v: String(val) };
        if (k === "$numberDecimal") return { $type: "Decimal", v: String(val) };
        if (k === "$numberDouble") return Number(val);
        if (k === "$binary") return { $type: "Binary", v: "" };
        if (k === "$uuid") return { $type: "UUID", v: String(val) };
        if (k === "$regularExpression") return { $type: "Regex", v: "" };
        if (k === "$timestamp") return { $type: "Date", v: "" };
      }
      return o;
    }
    case "ref": {
      const seg = v.chain[v.chain.length - 1];
      const ctor = SHELL_CTORS[seg.name];
      if (ctor) return { $type: ctor, v: strOf(seg.args?.[0]) ?? "" };
      if (seg.name === "NaN" || seg.name === "Infinity") return 0;
      return chainText(v);
    }
    case "arrow":
      return toPlain(v.body);
    default:
      return null;
  }
}

interface FieldStat {
  present: number;
  nulls: number;
  types: Set<string>;
  base: BaseType;
  objectId: boolean;
  array: boolean;
  enumValues: Set<string>;
  bigint: boolean;
}

interface DocTypeInfo {
  label: string;
  base: BaseType;
  objectId?: boolean;
  bigint?: boolean;
}

function docValueType(v: Plain): DocTypeInfo {
  if (v === null) return { label: "null", base: "other" };
  if (typeof v === "boolean") return { label: "boolean", base: "boolean" };
  if (typeof v === "number") return Number.isInteger(v) ? { label: "int", base: "int" } : { label: "double", base: "float" };
  if (typeof v === "string") {
    if (OID_RE.test(v)) return { label: "ObjectId", base: "other", objectId: true };
    if (UUID_RE.test(v)) return { label: "uuid", base: "uuid" };
    if (isIsoDate(v)) return { label: v.length > 10 ? "datetime" : "date", base: v.length > 10 ? "datetime" : "date" };
    return { label: "string", base: "string" };
  }
  if (Array.isArray(v)) return { label: "array", base: "json" };
  if (isSpecial(v)) {
    switch (v.$type) {
      case "ObjectId":
        return { label: "ObjectId", base: "other", objectId: true };
      case "Date":
        return { label: "Date", base: "datetime" };
      case "Long":
        return { label: "long", base: "bigint", bigint: true };
      case "Decimal":
        return { label: "Decimal128", base: "decimal" };
      case "Binary":
        return { label: "binary", base: "bytes" };
      case "UUID":
        return { label: "uuid", base: "uuid" };
      default:
        return { label: "regex", base: "other" };
    }
  }
  return { label: "object", base: "json" };
}

const MAX_DOC_DEPTH = 2;
const MAX_FIELDS = 200;

function collectFields(docs: Array<{ [k: string]: Plain }>, warnings: string[], collection: string): Map<string, FieldStat> {
  const stats = new Map<string, FieldStat>();
  const get = (path: string): FieldStat => {
    let s = stats.get(path);
    if (!s) {
      s = { present: 0, nulls: 0, types: new Set(), base: "other", objectId: false, array: false, enumValues: new Set(), bigint: false };
      stats.set(path, s);
    }
    return s;
  };
  const record = (s: FieldStat, v: Plain, inArray: boolean) => {
    if (v === null) {
      s.nulls++;
      return;
    }
    const info = docValueType(v);
    if (info.objectId) s.objectId = true;
    if (info.bigint) s.bigint = true;
    s.types.add(inArray ? `${info.label}[]` : info.label);
    if (s.base === "other" || info.base === "string") s.base = info.base;
    if (typeof v === "string" && v.length <= 40 && !info.objectId && info.base === "string") s.enumValues.add(v);
    else s.enumValues.add("\u0000"); // marks "not an enum"
  };
  const walk = (doc: { [k: string]: Plain }, prefix: string, depth: number) => {
    for (const [key, v] of Object.entries(doc)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (stats.size >= MAX_FIELDS && !stats.has(path)) {
        pushWarning(warnings, `${collection}: only the first ${MAX_FIELDS} fields are shown.`);
        continue;
      }
      const s = get(path);
      s.present++;
      if (Array.isArray(v)) {
        s.array = true;
        if (!v.length) s.types.add("array");
        for (const item of v.slice(0, 50)) {
          if (item && typeof item === "object" && !Array.isArray(item) && !isSpecial(item) && depth < MAX_DOC_DEPTH) {
            s.types.add("object[]");
            walk(item, path + "[]", depth + 1);
          } else record(s, item, true);
        }
        continue;
      }
      if (v && typeof v === "object" && !isSpecial(v) && depth < MAX_DOC_DEPTH) {
        s.types.add("object");
        s.base = "json";
        walk(v, path, depth + 1);
        continue;
      }
      record(s, v, false);
    }
  };
  for (const d of docs) walk(d, "", 0);
  return stats;
}

function tablesFromCollections(collections: Map<string, Array<{ [k: string]: Plain }>>, warnings: string[]): Table[] {
  const tables: Table[] = [];
  const names = [...collections.keys()];
  for (const [name, docs] of collections) {
    if (tables.length >= DDL_LIMITS.maxTables) {
      pushWarning(warnings, `Only the first ${DDL_LIMITS.maxTables} collections were parsed.`);
      break;
    }
    const table = newTable(name);
    const stats = collectFields(docs, warnings, name);
    const total = docs.length;
    for (const [path, s] of stats) {
      const types = [...s.types].filter((x) => x !== "array" || s.types.size === 1);
      const label = types.length ? types.sort().join(" | ") : "null";
      const isPk = path === "_id";
      const enumOk = !s.enumValues.has("\u0000") && s.enumValues.size >= 2 && s.enumValues.size <= 8 && total >= 6 && s.enumValues.size < total;
      const col = makeColumn(path, label, s.base, {
        nullable: !isPk && (s.present < total || s.nulls > 0),
        primaryKey: isPk,
        unique: isPk,
        array: s.array || undefined,
      });
      if (enumOk) {
        col.baseType = "enum";
        col.enumValues = [...s.enumValues].sort();
      }
      if (col.baseType === "other" && !s.objectId && label !== "null" && label !== "regex") col.baseType = "json";
      table.columns.push(col);
      // Relation guess: ObjectId-typed field named like another collection, or a *_id / *Id field.
      if (isPk || path.includes("[]") && !path.endsWith("[]")) continue;
      const leaf = path.replace(/\[\]$/, "");
      if (leaf.includes(".")) continue;
      const target = guessRefTable(leaf, names, s.objectId);
      if (target) table.foreignKeys.push({ columns: [path], refTable: target, refColumns: ["_id"] });
    }
    if (!table.columns.length) pushWarning(warnings, `${name}: documents have no fields.`);
    finalizeTable(table);
    tables.push(table);
  }
  return tables;
}

/**
 * Parse sample documents. Accepted shapes:
 *  - `{ "users": [ {...}, {...} ], "posts": [ ... ] }` — one key per collection
 *  - `db.users.insertMany([ ... ])` / `db.users.insertOne({ ... })` mongosh statements
 *  - a JSON array or newline-delimited documents (mongoexport) of a single collection
 * Extended JSON (`{"$oid": ...}`) and shell constructors (`ObjectId("...")`) are understood.
 */
export function parseJsonDocuments(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste sample documents, a mongosh insert, or a JSON object keyed by collection name." };
  const warnings: string[] = [];
  const collections = new Map<string, Array<{ [k: string]: Plain }>>();
  const addDocs = (name: string, v: Plain) => {
    const list = collections.get(name) ?? [];
    const items = Array.isArray(v) ? v : [v];
    for (const d of items) if (d && typeof d === "object" && !Array.isArray(d) && !isSpecial(d)) list.push(d);
    collections.set(name, list);
  };

  const toks = tokenize(text);
  const r = new Reader(toks, text);
  // mongosh statements: db.<name>.insert*(...)  or db.getCollection("name").insert*(...)
  let sawShell = false;
  const loose: Plain[] = [];
  while (!r.done()) {
    const t = r.peek()!;
    if (t.t === "id" && t.v === "db" && r.isP(".", 1)) {
      const v = parseValue(r);
      if (v.k === "ref") {
        let name: string | undefined;
        let payload: JsVal | undefined;
        for (const seg of v.chain) {
          if (seg.name === "getCollection" || seg.name === "collection") name = strOf(seg.args?.[0]);
          else if (/^insert(One|Many)?$/.test(seg.name)) payload = seg.args?.[0];
          else if (seg.name !== "db" && !seg.args) name = seg.name;
        }
        if (name && payload) {
          sawShell = true;
          addDocs(name, toPlain(payload));
          if (r.isP(";")) r.next();
          continue;
        }
      }
      if (r.isP(";")) r.next();
      continue;
    }
    if (t.t === "p" && (t.v === ";" || t.v === ",")) {
      r.next();
      continue;
    }
    if (t.t === "id" && (t.v === "const" || t.v === "let" || t.v === "var" || t.v === "export")) {
      // `const docs = [...]` — take the assigned value
      r.next();
      if (r.isId("const") || r.isId("default")) r.next();
      if (r.peek()?.t === "id") r.next();
      if (r.isP(":")) {
        r.next();
        while (!r.done() && !r.isP("=")) r.next();
      }
      if (r.isP("=")) r.next();
      continue;
    }
    const before = r.i;
    const v = parseValue(r);
    if (r.i === before) r.next();
    if (v.k === "obj" || v.k === "arr") loose.push(toPlain(v));
  }
  if (!sawShell) {
    if (!loose.length) return { ok: false, error: "No JSON documents found. Paste an object, an array of documents, or mongosh insert statements." };
    const single = loose.length === 1 ? loose[0] : null;
    const isDoc = (x: Plain) => x && typeof x === "object" && !Array.isArray(x) && !isSpecial(x);
    if (single && isDoc(single) && Object.values(single as { [k: string]: Plain }).length && Object.values(single as { [k: string]: Plain }).every((x) => Array.isArray(x) && x.every(isDoc))) {
      for (const [k, v] of Object.entries(single as { [k: string]: Plain })) addDocs(k, v);
    } else {
      for (const v of loose) addDocs("documents", v);
      pushWarning(warnings, 'Single collection shown as "documents". Wrap documents as { "users": [ … ], "posts": [ … ] } to name collections and detect relations.');
    }
  }
  for (const [k, v] of collections) if (!v.length) collections.delete(k);
  if (!collections.size) return { ok: false, error: "No documents found in the input." };
  const tables = tablesFromCollections(collections, warnings);
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// 2. Mongoose
// ---------------------------------------------------------------------------

const MONGOOSE_TYPES: Record<string, { base: BaseType; label: string }> = {
  string: { base: "string", label: "String" },
  number: { base: "float", label: "Number" },
  date: { base: "datetime", label: "Date" },
  boolean: { base: "boolean", label: "Boolean" },
  buffer: { base: "bytes", label: "Buffer" },
  objectid: { base: "other", label: "ObjectId" },
  mixed: { base: "json", label: "Mixed" },
  map: { base: "json", label: "Map" },
  object: { base: "json", label: "Object" },
  array: { base: "json", label: "Array" },
  decimal128: { base: "decimal", label: "Decimal128" },
  bigint: { base: "bigint", label: "BigInt" },
  uuid: { base: "uuid", label: "UUID" },
  double: { base: "float", label: "Double" },
  int32: { base: "int", label: "Int32" },
};

interface MongooseCtx {
  warnings: string[];
  /** schema const name -> table */
  schemaConsts: Map<string, Table>;
  /** schema const name -> nested subdocument definitions, so `[addressSchema]` can expand */
  subSchemas: Map<string, JsVal>;
}

function mongooseTypeOf(v: JsVal, ctx: MongooseCtx): { label: string; base: BaseType; ref?: string; array?: boolean; sub?: JsVal; enumValues?: string[] } {
  if (v.k === "arr") {
    const inner = v.items.length ? mongooseTypeOf(v.items[0], ctx) : { label: "Mixed", base: "json" as BaseType };
    return { ...inner, array: true };
  }
  if (v.k === "ref") {
    const name = lastSeg(v)!.name;
    const known = MONGOOSE_TYPES[name.toLowerCase()];
    if (known) return known;
    if (ctx.subSchemas.has(name)) return { label: `{${name}}`, base: "json", sub: ctx.subSchemas.get(name) };
    return { label: name, base: "other" };
  }
  if (v.k === "obj") {
    const t = prop(v, "type");
    if (t) {
      const inner = mongooseTypeOf(t, ctx);
      const ref = strOf(prop(v, "ref"));
      const en = prop(v, "enum");
      const enumValues = en ? (en.k === "obj" ? strList(prop(en, "values")) : strList(en)) : undefined;
      return { ...inner, ref: ref ?? inner.ref, enumValues: enumValues?.length ? enumValues : inner.enumValues };
    }
    return { label: "object", base: "json", sub: v };
  }
  if (v.k === "str") {
    const known = MONGOOSE_TYPES[v.v.toLowerCase()];
    return known ?? { label: v.v, base: "other" };
  }
  return { label: "Mixed", base: "json" };
}

function addMongooseFields(table: Table, def: JsVal, prefix: string, depth: number, ctx: MongooseCtx) {
  if (def.k !== "obj") return;
  for (const { key, value } of def.props) {
    const name = prefix ? `${prefix}.${key}` : key;
    const info = mongooseTypeOf(value, ctx);
    const opts = value.k === "obj" && prop(value, "type") ? value : undefined;
    const col = makeColumn(name, `${info.label}${info.array ? "[]" : ""}`, info.base, {
      nullable: !boolOf(prop(opts, "required")),
      unique: !!boolOf(prop(opts, "unique")),
      array: info.array || undefined,
      defaultValue: defaultText(prop(opts, "default")),
    });
    if (info.enumValues?.length) {
      col.baseType = "enum";
      col.enumValues = info.enumValues;
    }
    const maxlength = numOf(prop(opts, "maxlength") ?? prop(opts, "maxLength"));
    if (maxlength) col.length = maxlength;
    if (key === "_id") {
      if (value.k === "bool" && !value.v) continue;
      col.primaryKey = true;
      col.nullable = false;
    }
    table.columns.push(col);
    if (info.ref) table.foreignKeys.push({ columns: [name], refTable: info.ref, refColumns: ["_id"] });
    if (info.sub && depth < MAX_DOC_DEPTH) addMongooseFields(table, info.sub, info.array ? `${name}[]` : name, depth + 1, ctx);
  }
}

/** Parse `new Schema({...}, options)` definitions plus `model("Name", schema)` registrations. Never throws. */
export function parseMongooseSchema(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste Mongoose schema definitions (new Schema({ … })) and model() calls." };
  const toks = tokenize(text);
  const r = new Reader(toks, text);
  const ctx: MongooseCtx = { warnings: [], schemaConsts: new Map(), subSchemas: new Map() };
  const schemas: Array<{ constName?: string; def: JsVal; opts?: JsVal }> = [];
  const models: Array<{ name: string; schemaConst?: string }> = [];
  const modelConsts = new Map<string, string>(); // const User = model("User") -> "User"

  // First pass: find `new Schema(` / `new mongoose.Schema(` and `model(`
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== "id") continue;
    const paren = callParen(toks, i);
    if (t.v === "Schema" && paren > 0 && (toks[i - 1]?.v === "new" || (toks[i - 1]?.v === "." && toks[i - 3]?.v === "new"))) {
      const newIdx = toks[i - 1]?.v === "new" ? i - 1 : i - 3;
      const constName = assignedName(r, newIdx);
      r.i = paren;
      const args = parseArgs(r);
      if (!args.length || args[0].k !== "obj") continue;
      schemas.push({ constName, def: args[0], opts: args[1] });
      if (constName) ctx.subSchemas.set(constName, args[0]);
      i = r.i - 1;
      continue;
    }
    if (t.v === "model" && paren > 0 && (toks[i - 1]?.v !== "." || toks[i - 2]?.t === "id")) {
      const assigned = assignedName(r, toks[i - 1]?.v === "." ? i - 2 : i);
      r.i = paren;
      const args = parseArgs(r);
      const name = strOf(args[0]);
      if (name) {
        let schemaConst: string | undefined;
        const inline = args[1]?.k === "ref" ? lastSeg(args[1]) : undefined;
        if (inline?.name === "Schema" && inline.args?.[0]?.k === "obj") {
          // model("User", new Schema({ ... }, opts))
          schemas.push({ constName: `__inline_${name}`, def: inline.args[0], opts: inline.args[1] });
          schemaConst = `__inline_${name}`;
        } else if (args[1]?.k === "ref") schemaConst = chainText(args[1]);
        else if (args[1]?.k === "obj") {
          // inline: model("User", new Schema({...})) was already captured; model("User", {...}) is a raw def
          schemas.push({ constName: `__inline_${name}`, def: args[1] });
          schemaConst = `__inline_${name}`;
        }
        models.push({ name, schemaConst });
        if (assigned) modelConsts.set(assigned, name);
      }
      i = r.i - 1;
    }
  }
  if (!schemas.length) return { ok: false, error: "No `new Schema({ … })` definitions found." };

  const modelBySchema = new Map<string, string>();
  for (const m of models) if (m.schemaConst) modelBySchema.set(m.schemaConst, m.name);
  // Sub-schemas are those never registered as a model but referenced by another schema.
  const registered = new Set(modelBySchema.keys());
  const referencedAsSub = new Set<string>();
  const scanRefs = (v: JsVal) => {
    if (v.k === "ref" && ctx.subSchemas.has(v.chain[0].name)) referencedAsSub.add(v.chain[0].name);
    else if (v.k === "arr") v.items.forEach(scanRefs);
    else if (v.k === "obj") v.props.forEach((p) => scanRefs(p.value));
  };
  for (const s of schemas) scanRefs(s.def);

  const tables: Table[] = [];
  for (const s of schemas) {
    if (s.constName && !registered.has(s.constName) && referencedAsSub.has(s.constName)) continue; // embedded only
    if (tables.length >= DDL_LIMITS.maxTables) {
      pushWarning(ctx.warnings, `Only the first ${DDL_LIMITS.maxTables} schemas were parsed.`);
      break;
    }
    const modelName = (s.constName && modelBySchema.get(s.constName)) ?? (s.constName ? s.constName.replace(/Schema$/i, "") || s.constName : `schema_${tables.length + 1}`);
    const collection = strOf(prop(s.opts, "collection"));
    const table = newTable(collection ?? modelName);
    const idOpt = prop(s.opts, "_id");
    const hasId = s.def.k === "obj" && s.def.props.some((p) => p.key === "_id");
    if (!hasId && !(idOpt?.k === "bool" && !idOpt.v)) table.columns.push(makeColumn("_id", "ObjectId", "other", { nullable: false, primaryKey: true, unique: true }));
    addMongooseFields(table, s.def, "", 0, ctx);
    const ts = prop(s.opts, "timestamps");
    if (ts && boolOf(ts)) {
      const created = ts.k === "obj" ? prop(ts, "createdAt") : undefined;
      const updated = ts.k === "obj" ? prop(ts, "updatedAt") : undefined;
      const ca = created?.k === "str" ? created.v : created?.k === "bool" && !created.v ? null : "createdAt";
      const ua = updated?.k === "str" ? updated.v : updated?.k === "bool" && !updated.v ? null : "updatedAt";
      if (ca && !table.columns.some((c) => c.name === ca)) table.columns.push(makeColumn(ca, "Date", "datetime", { nullable: false, defaultValue: "now" }));
      if (ua && !table.columns.some((c) => c.name === ua)) table.columns.push(makeColumn(ua, "Date", "datetime", { nullable: false, defaultValue: "now" }));
    }
    finalizeTable(table);
    tables.push(table);
    if (s.constName) ctx.schemaConsts.set(s.constName, table);
    (table as Table & { __model?: string }).__model = modelName;
  }
  if (!tables.length) return { ok: false, error: "No schemas were registered with model(); nothing to draw." };

  // Resolve refs: model name (or model const) -> table name; also `schema.index(...)` calls.
  const tableByModel = new Map<string, Table>();
  for (const t of tables) {
    const m = (t as Table & { __model?: string }).__model;
    if (m) tableByModel.set(m, t);
    tableByModel.set(t.name, t);
  }
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      const viaConst = modelConsts.get(fk.refTable);
      const target = tableByModel.get(fk.refTable) ?? (viaConst ? tableByModel.get(viaConst) : undefined) ?? findTable(tables, fk.refTable);
      if (target) fk.refTable = target.name;
      else pushWarning(ctx.warnings, `${t.name}.${fk.columns[0]}: ref "${fk.refTable}" is not a model in the input.`);
    }
    delete (t as Table & { __model?: string }).__model;
  }
  const indexRe = /(\w+)\s*\.\s*index\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = indexRe.exec(text))) {
    const table = ctx.schemaConsts.get(m[1]);
    if (!table) continue;
    r.i = toks.findIndex((t) => t.s === m!.index + m![0].length - 1);
    if (r.i < 0) continue;
    const args = parseArgs(r);
    const cols = args[0]?.k === "obj" ? args[0].props.map((p) => p.key) : [];
    if (!cols.length) continue;
    const unique = !!boolOf(prop(args[1], "unique"));
    if (unique) table.uniques.push(cols);
    else table.indexes.push({ columns: cols, unique: false });
    finalizeTable(table);
  }
  return { ok: true, tables, warnings: ctx.warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// 3. TypeScript interfaces / type aliases
// ---------------------------------------------------------------------------

const TS_SCALARS: Record<string, BaseType> = {
  string: "string",
  number: "float",
  boolean: "boolean",
  bigint: "bigint",
  date: "datetime",
  buffer: "bytes",
  uint8array: "bytes",
  objectid: "other",
  any: "json",
  unknown: "json",
  object: "json",
  record: "json",
  jsonvalue: "json",
  json: "json",
  symbol: "other",
  never: "other",
  void: "other",
  decimal: "decimal",
  decimal128: "decimal",
  bson: "other",
};

interface TsMember {
  name: string;
  optional: boolean;
  type: string;
  comment: string;
}

/** Split an interface body into members, respecting nested braces/brackets/generics. */
function splitTsMembers(body: string): TsMember[] {
  const members: TsMember[] = [];
  let depth = 0;
  let cur = "";
  let comment = "";
  // True right after a member ended on the current line, so a trailing `// note` belongs to it.
  let justFlushed = false;
  const flush = () => {
    const text = cur.trim();
    cur = "";
    const c = comment.trim();
    comment = "";
    if (!text) return;
    const m = /^(?:readonly\s+)?(?:(?:public|private|protected|declare|static|override)\s+)*(["'`]?)([\w$.-]+)\1\s*([?!])?\s*:\s*([\s\S]+?)\s*$/.exec(text);
    if (!m) return;
    members.push({ name: m[2], optional: m[3] === "?", type: m[4].replace(/\s+/g, " "), comment: c });
    justFlushed = true;
  };
  const addComment = (text: string) => {
    if (justFlushed && !cur.trim() && members.length) members[members.length - 1].comment = `${members[members.length - 1].comment} ${text}`.trim();
    else comment += " " + text;
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "/" && body[i + 1] === "/") {
      const nl = body.indexOf("\n", i);
      const end = nl < 0 ? body.length : nl;
      addComment(body.slice(i + 2, end));
      i = end - 1;
      continue;
    }
    if (ch === "/" && body[i + 1] === "*") {
      const end = body.indexOf("*/", i + 2);
      const stop = end < 0 ? body.length : end + 2;
      addComment(body.slice(i + 2, end < 0 ? body.length : end).replace(/^\s*\*+/gm, ""));
      i = stop - 1;
      continue;
    }
    if (ch === "\n") justFlushed = false;
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    if (depth === 0 && (ch === ";" || ch === "," || ch === "\n")) {
      if (ch === "\n") {
        // Only a newline ends a member if the accumulated text looks complete.
        const trimmed = cur.trim();
        if (!trimmed || !/:\s*\S/.test(trimmed) || /[|&=]\s*$/.test(trimmed)) {
          cur += ch;
          continue;
        }
        // If the next non-blank line starts with `|` or `&`, the union continues.
        const rest = body.slice(i + 1);
        if (/^\s*[|&]/.test(rest)) {
          cur += ch;
          continue;
        }
      }
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return members;
}

function stripOuter(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")") depth--;
      if (depth === 0 && i < t.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** Split a type on a top-level `|`. */
function splitUnion(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{" || ch === "(" || ch === "[" || ch === "<") depth++;
    else if (ch === "}" || ch === ")" || ch === "]" || ch === ">") depth--;
    if (ch === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

interface TsTypeInfo {
  label: string;
  base: BaseType;
  nullable: boolean;
  array: boolean;
  enumValues?: string[];
  enumName?: string;
  /** Referenced interface/type name when the type is another declared type */
  refType?: string;
  /** Nested object literal to flatten */
  nested?: string;
  generated?: boolean;
}

function analyzeTsType(raw: string, decl: Map<string, string>, enums: Map<string, string[]>): TsTypeInfo {
  let t = stripOuter(raw);
  let generated = false;
  let m: RegExpExecArray | null;
  // Kysely wrappers
  if ((m = /^Generated<([\s\S]+)>$/.exec(t))) {
    generated = true;
    t = m[1].trim();
  } else if ((m = /^(?:ColumnType|GeneratedAlways)<([^,>]+)[\s\S]*>$/.exec(t))) {
    generated = /^GeneratedAlways/.test(t);
    t = m[1].trim();
  }
  // Common wrappers that don't change the shape
  while ((m = /^(?:Readonly|Partial|Required|NonNullable|Promise|Awaited|Types\.DocumentArray)<([\s\S]+)>$/.exec(t))) t = m[1].trim();

  const parts = splitUnion(t);
  const nullable = parts.some((p) => p === "null" || p === "undefined");
  const rest = parts.filter((p) => p !== "null" && p !== "undefined");
  if (!rest.length) return { label: "null", base: "other", nullable: true, array: false, generated };
  // String literal union → enum
  if (rest.every((p) => /^["'`].*["'`]$/.test(p))) {
    const values = rest.map((p) => p.slice(1, -1));
    return { label: values.length > 3 ? `enum(${values.length})` : values.map((v) => `'${v}'`).join(" | "), base: "enum", nullable, array: false, enumValues: values, generated };
  }
  if (rest.length > 1) {
    const infos = rest.map((p) => analyzeTsType(p, decl, enums));
    const label = infos.map((i) => i.label).join(" | ");
    const base = infos.find((i) => i.base !== "other")?.base ?? "other";
    return { label, base, nullable: nullable || infos.some((i) => i.nullable), array: infos.every((i) => i.array), generated };
  }
  let single = stripOuter(rest[0]);
  let array = false;
  if ((m = /^(?:readonly\s+)?([\s\S]+)\[\]$/.exec(single)) && !/^\(.*\)$/.test(single)) {
    array = true;
    single = m[1].trim();
  } else if ((m = /^(?:Array|ReadonlyArray|Set)<([\s\S]+)>$/.exec(single))) {
    array = true;
    single = m[1].trim();
  }
  single = stripOuter(single);
  if (array && single.includes("|")) {
    const inner = analyzeTsType(single, decl, enums);
    return { ...inner, label: `(${inner.label})[]`, array: true, nullable: nullable || inner.nullable, generated };
  }
  if (single.startsWith("{")) return { label: array ? "object[]" : "object", base: "json", nullable, array, nested: single, generated };
  if (/^(Record|Map)</.test(single)) return { label: `${single.length > 18 ? single.slice(0, 15) + "…" : single}${array ? "[]" : ""}`, base: "json", nullable, array, generated };
  const bare = single.replace(/<[\s\S]*>$/, "").replace(/^(mongoose|mongodb|Types|Schema\.Types|Prisma|bson)\./, "");
  const lower = bare.toLowerCase();
  if (enums.has(bare)) return { label: `${bare}${array ? "[]" : ""}`, base: "enum", nullable, array, enumValues: enums.get(bare), enumName: bare, generated };
  if (lower in TS_SCALARS) return { label: `${bare}${array ? "[]" : ""}`, base: TS_SCALARS[lower], nullable, array, generated };
  if (/^\d+(\.\d+)?$/.test(bare)) return { label: "number", base: Number.isInteger(Number(bare)) ? "int" : "float", nullable, array, generated };
  if (bare === "true" || bare === "false") return { label: "boolean", base: "boolean", nullable, array, generated };
  if (decl.has(bare)) return { label: `${bare}${array ? "[]" : ""}`, base: "json", nullable, array, refType: bare, generated };
  return { label: `${bare}${array ? "[]" : ""}`, base: "other", nullable, array, generated };
}

/** Parse `interface` / `type X = {}` / `enum` declarations into tables. Never throws. */
export function parseTypeScriptTypes(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste TypeScript interfaces or type aliases." };
  const warnings: string[] = [];
  const decls = new Map<string, string>(); // name -> body
  const docComments = new Map<string, string>();
  const enums = new Map<string, string[]>();
  const order: string[] = [];

  // Enums: `enum X { A = "a" }` and `type X = "a" | "b"`
  const enumRe = /\b(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(text))) {
    const values = m[2]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const eq = /^([\w$]+)\s*=\s*(["'`]?)(.*?)\2\s*$/.exec(x);
        return eq ? eq[3] : x;
      });
    enums.set(m[1], values);
  }
  const aliasRe = /\btype\s+([A-Za-z_$][\w$]*)(?:<[^=]*>)?\s*=\s*([^;{]+?)\s*(?:;|\n\s*\n|$)/g;
  while ((m = aliasRe.exec(text))) {
    const parts = splitUnion(m[2]);
    if (parts.length > 1 && parts.every((p) => /^["'`].*["'`]$/.test(p.trim()))) enums.set(m[1], parts.map((p) => p.trim().slice(1, -1)));
  }

  // Interfaces and object type aliases (brace matched)
  const declRe = /(\/\*\*[\s\S]*?\*\/\s*)?\b(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)(?:<[^{=]*>)?\s*(?:extends\s+[^{]+)?(?:=\s*)?\{/g;
  while ((m = declRe.exec(text))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
        i = j;
      } else if (ch === "/" && text[i + 1] === "/") {
        const nl = text.indexOf("\n", i);
        i = nl < 0 ? text.length : nl;
      }
      i++;
    }
    const body = text.slice(start, i - 1);
    const name = m[3];
    if (decls.has(name)) continue;
    decls.set(name, body);
    order.push(name);
    if (m[1]) docComments.set(name, m[1]);
    declRe.lastIndex = i;
  }
  if (!decls.size) return { ok: false, error: "No `interface` or object `type` declarations found." };

  // A Kysely-style registry (`interface DB { users: UsersTable }`) names the tables.
  const registry = new Map<string, string>(); // type name -> table name
  const registries = new Set<string>();
  for (const [name, body] of decls) {
    const members = splitTsMembers(body);
    if (!members.length) continue;
    const all = members.every((mm) => decls.has(mm.type.trim()) && !enums.has(mm.type.trim()));
    if (all && (members.length > 1 || /^(DB|Database|Schema|Tables|Models)$/i.test(name))) {
      registries.add(name);
      for (const mm of members) if (!registry.has(mm.type.trim())) registry.set(mm.type.trim(), mm.name);
    }
  }

  const tables: Table[] = [];
  const tableForType = new Map<string, Table>();
  const pendingFks: Array<{ table: Table; col: string; targetType?: string; targetTable?: string; targetCol?: string }> = [];
  const embeddedOnly = new Set<string>();
  // Types used only as a nested value of another (and never registered) are embedded, not tables.
  for (const [, body] of decls) for (const mm of splitTsMembers(body)) {
    const info = analyzeTsType(mm.type, decls, enums);
    if (info.refType && !info.array && registry.size && !registry.has(info.refType)) embeddedOnly.add(info.refType);
  }

  const addMembers = (table: Table, body: string, prefix: string, depth: number, typeName: string) => {
    for (const mm of splitTsMembers(body)) {
      const name = prefix ? `${prefix}.${mm.name}` : mm.name;
      const info = analyzeTsType(mm.type, decls, enums);
      const note = mm.comment;
      const col = makeColumn(name, info.label, info.base, {
        nullable: mm.optional || info.nullable,
        array: info.array || undefined,
        autoIncrement: !!info.generated,
        primaryKey: /\bPK\b|primary key/i.test(note) || (!prefix && (mm.name === "id" || mm.name === "_id")),
        unique: /\bunique\b|\bUK\b/i.test(note),
      });
      if (info.enumValues) {
        col.enumValues = info.enumValues;
        col.enumName = info.enumName;
      }
      if (col.primaryKey) col.nullable = false;
      if (info.base === "other" && !/objectid|decimal/i.test(info.label) && !info.refType) pushWarning(warnings, `${typeName}.${mm.name}: unknown type ${info.label}.`);
      table.columns.push(col);
      const fkNote = /\bFK\b\s*(?:→|->|to|references)?\s*([\w$.]+)?/i.exec(note) ?? /\breferences\s+([\w$.]+)/i.exec(note);
      if (fkNote) {
        const [tt, tc] = (fkNote[1] ?? "").split(".");
        pendingFks.push({ table, col: name, targetTable: tt || undefined, targetCol: tc });
      } else if (info.refType && !info.array && depth === 0) {
        pendingFks.push({ table, col: name, targetType: info.refType });
      } else if (!prefix && !col.primaryKey && (info.base === "string" || info.base === "int" || info.base === "float" || info.base === "uuid" || info.base === "bigint" || /objectid/i.test(info.label))) {
        pendingFks.push({ table, col: name });
      }
      if (info.nested && depth < MAX_DOC_DEPTH) addMembers(table, info.nested.slice(1, -1), info.array ? `${name}[]` : name, depth + 1, typeName);
      else if (info.refType && info.nested === undefined && depth < MAX_DOC_DEPTH && embeddedOnly.has(info.refType) && !info.array) addMembers(table, decls.get(info.refType)!, name, depth + 1, typeName);
    }
  };

  for (const name of order) {
    if (registries.has(name) || embeddedOnly.has(name)) continue;
    if (tables.length >= DDL_LIMITS.maxTables) {
      pushWarning(warnings, `Only the first ${DDL_LIMITS.maxTables} types were parsed.`);
      break;
    }
    const doc = docComments.get(name) ?? "";
    const fromDoc = /Table:\s*([\w$.]+)/i.exec(doc)?.[1];
    const table = newTable(registry.get(name) ?? fromDoc ?? name);
    addMembers(table, decls.get(name)!, "", 0, name);
    finalizeTable(table);
    tables.push(table);
    tableForType.set(name, table);
  }
  if (!tables.length) return { ok: false, error: "No object types to draw." };
  const names = tables.map((t) => t.name);
  const typeNames = [...tableForType.keys()];
  for (const p of pendingFks) {
    let target: Table | undefined;
    if (p.targetType) target = tableForType.get(p.targetType);
    else if (p.targetTable) target = findTable(tables, p.targetTable) ?? tableForType.get(p.targetTable);
    else {
      const byTable = guessRefTable(p.col, names);
      const byType = byTable ? undefined : guessRefTable(p.col, typeNames);
      target = byTable ? findTable(tables, byTable) : byType ? tableForType.get(byType) : undefined;
      if (target === p.table && !/parent|manager|owner|reply|reports/i.test(p.col)) target = undefined;
    }
    if (!target) continue;
    if (p.table.foreignKeys.some((fk) => fk.columns[0] === p.col)) continue;
    p.table.foreignKeys.push({ columns: [p.col], refTable: target.name, refColumns: [p.targetCol ?? target.primaryKey[0] ?? "id"] });
  }
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// 4. Drizzle
// ---------------------------------------------------------------------------

const DRIZZLE_TYPES: Record<string, BaseType> = {
  serial: "int",
  smallserial: "int",
  integer: "int",
  int: "int",
  smallint: "int",
  tinyint: "int",
  mediumint: "int",
  bigint: "bigint",
  bigserial: "bigint",
  varchar: "string",
  char: "string",
  text: "text",
  citext: "text",
  tinytext: "text",
  mediumtext: "text",
  longtext: "text",
  real: "float",
  float: "float",
  double: "float",
  doubleprecision: "float",
  numeric: "decimal",
  decimal: "decimal",
  boolean: "boolean",
  date: "date",
  time: "other",
  timestamp: "timestamp",
  datetime: "datetime",
  json: "json",
  jsonb: "json",
  uuid: "uuid",
  bytea: "bytes",
  binary: "bytes",
  varbinary: "bytes",
  blob: "bytes",
  mysqlenum: "enum",
  pgenum: "enum",
  inet: "other",
  cidr: "other",
  macaddr: "other",
  interval: "other",
  point: "other",
  geometry: "other",
  vector: "other",
  year: "int",
};

/** Parse Drizzle `pgTable` / `mysqlTable` / `sqliteTable` definitions and `pgEnum`s. Never throws. */
export function parseDrizzleSchema(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste Drizzle table definitions (pgTable, mysqlTable or sqliteTable)." };
  const toks = tokenize(text);
  const r = new Reader(toks, text);
  const warnings: string[] = [];
  const enums = new Map<string, string[]>(); // const name -> values
  const defs: Array<{ constName?: string; name: string; cols: JsVal; extras?: JsVal; dialect: string }> = [];

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== "id" || toks[i + 1]?.v !== "(") continue;
    if (t.v === "pgEnum" || t.v === "mysqlEnum" && toks[i - 1]?.v === "=") {
      const constName = assignedName(r, i);
      r.i = i + 1;
      const args = parseArgs(r);
      const values = strList(args[1] ?? args[0]);
      if (constName) enums.set(constName, values);
      i = r.i - 1;
      continue;
    }
    if (/^(pgTable|mysqlTable|sqliteTable|singlestoreTable|pgMaterializedView|pgView)$/.test(t.v) || (t.v === "table" && toks[i - 1]?.v === ".")) {
      const constName = assignedName(r, t.v === "table" ? i - 2 : i);
      r.i = i + 1;
      const args = parseArgs(r);
      const name = strOf(args[0]);
      const cols = args[1];
      if (name && cols?.k === "obj") {
        if (defs.length >= DDL_LIMITS.maxTables) pushWarning(warnings, `Only the first ${DDL_LIMITS.maxTables} tables were parsed.`);
        else defs.push({ constName, name, cols, extras: args[2], dialect: t.v });
      }
      i = r.i - 1;
    }
  }
  if (!defs.length) return { ok: false, error: "No pgTable / mysqlTable / sqliteTable definitions found." };

  const tables: Table[] = [];
  const byConst = new Map<string, Table>();
  const keyToCol = new Map<Table, Map<string, string>>();
  const pendingRefs: Array<{ table: Table; col: string; targetConst: string; targetKey: string; onDelete?: string; onUpdate?: string }> = [];
  const pendingFks: Array<{ table: Table; cols: string[]; targetConst: string; keys: string[] }> = [];

  for (const d of defs) {
    const table = newTable(d.name.includes(".") ? d.name.slice(d.name.lastIndexOf(".") + 1) : d.name, d.name.includes(".") ? d.name.slice(0, d.name.lastIndexOf(".")) : undefined);
    const keyMap = new Map<string, string>();
    for (const { key, value } of (d.cols as { k: "obj"; props: Array<{ key: string; value: JsVal }> }).props) {
      if (value.k !== "ref") continue;
      const chain = value.chain;
      // Column builders may be namespaced (t.varchar, p.varchar) — find the first segment with args.
      const firstIdx = chain.findIndex((c) => c.args);
      if (firstIdx < 0) continue;
      const first = chain[firstIdx];
      const fnName = first.name;
      const colName = strOf(first.args?.[0]) ?? key;
      const optsArg = first.args?.find((a) => a.k === "obj");
      const lower = fnName.replace(/_/g, "").toLowerCase();
      let base: BaseType = DRIZZLE_TYPES[lower] ?? "other";
      let type = fnName;
      const col = makeColumn(colName, type, base);
      if (enums.has(fnName) || fnName.endsWith("Enum")) {
        base = "enum";
        col.enumValues = enums.get(fnName);
        col.enumName = fnName;
        type = fnName.replace(/Enum$/, "");
      }
      if (lower === "mysqlenum") {
        col.enumValues = strList(first.args?.[1]);
      }
      if (/serial$/.test(lower)) col.autoIncrement = true;
      const len = numOf(prop(optsArg, "length"));
      if (len) {
        col.length = len;
        type += `(${len})`;
      }
      const precision = numOf(prop(optsArg, "precision"));
      if (precision) {
        col.precision = precision;
        col.scale = numOf(prop(optsArg, "scale"));
        type += `(${precision}${col.scale != null ? `,${col.scale}` : ""})`;
      }
      if (boolOf(prop(optsArg, "withTimezone"))) type += "tz";
      const mode = strOf(prop(optsArg, "mode"));
      if (lower === "integer" && mode === "boolean") base = "boolean";
      if (lower === "integer" && mode === "timestamp") base = "timestamp";
      if (lower === "text" && prop(optsArg, "enum")) {
        base = "enum";
        col.enumValues = strList(prop(optsArg, "enum"));
      }
      let pk = false;
      let notNull = false;
      for (const seg of chain.slice(firstIdx + 1)) {
        switch (seg.name) {
          case "primaryKey":
            pk = true;
            if (boolOf(prop(seg.args?.[0], "autoIncrement"))) col.autoIncrement = true;
            break;
          case "notNull":
            notNull = true;
            break;
          case "unique":
            col.unique = true;
            break;
          case "array":
            col.array = true;
            type += "[]";
            break;
          case "autoincrement":
          case "generatedAlwaysAsIdentity":
          case "generatedByDefaultAsIdentity":
            col.autoIncrement = true;
            break;
          case "defaultNow":
            col.defaultValue = "now()";
            break;
          case "defaultRandom":
            col.defaultValue = "gen_random_uuid()";
            break;
          case "default":
          case "$default":
          case "$defaultFn":
            col.defaultValue = defaultText(seg.args?.[0]);
            break;
          case "references": {
            const target = seg.args?.[0];
            const body = target?.k === "arrow" ? target.body : target;
            if (body?.k === "ref" && body.chain.length >= 2) {
              const od = strOf(prop(seg.args?.[1], "onDelete"));
              const ou = strOf(prop(seg.args?.[1], "onUpdate"));
              pendingRefs.push({ table, col: colName, targetConst: body.chain[0].name, targetKey: body.chain[body.chain.length - 1].name, onDelete: od?.toUpperCase(), onUpdate: ou?.toUpperCase() });
            }
            break;
          }
          default:
            break;
        }
      }
      col.type = type;
      col.baseType = base;
      col.primaryKey = pk;
      col.nullable = !pk && !notNull;
      table.columns.push(col);
      keyMap.set(key, colName);
    }
    // Extras: (t) => [ primaryKey({ columns: [t.a, t.b] }), unique().on(t.a), index("x").on(t.b), foreignKey({...}) ]
    const extras = d.extras?.k === "arrow" ? d.extras.body : d.extras;
    const extraItems: JsVal[] = extras?.k === "arr" ? extras.items : extras?.k === "obj" ? extras.props.map((p) => p.value) : [];
    const refCols = (v: JsVal | undefined): string[] => strList(v).map((s) => keyMap.get(s.replace(/^\w+\./, "")) ?? s.replace(/^\w+\./, ""));
    const colsFromChain = (v: JsVal): string[] => (v.k === "ref" ? v.chain.filter((c) => c.name === "on").flatMap((c) => refCols({ k: "arr", items: c.args ?? [] })) : []);
    for (const item of extraItems) {
      if (item.k !== "ref") continue;
      const head = item.chain[0];
      switch (head.name) {
        case "primaryKey":
          table.primaryKey = refCols(prop(head.args?.[0], "columns") ?? { k: "arr", items: head.args ?? [] });
          break;
        case "unique":
        case "uniqueIndex":
          table.uniques.push(colsFromChain(item));
          break;
        case "index":
          table.indexes.push({ name: strOf(head.args?.[0]), columns: colsFromChain(item), unique: false });
          break;
        case "foreignKey": {
          const cols = refCols(prop(head.args?.[0], "columns"));
          const foreign = strList(prop(head.args?.[0], "foreignColumns"));
          if (cols.length && foreign.length) pendingFks.push({ table, cols, targetConst: foreign[0].split(".")[0], keys: foreign.map((f) => f.split(".").pop()!) });
          break;
        }
        default:
          break;
      }
    }
    finalizeTable(table);
    tables.push(table);
    keyToCol.set(table, keyMap);
    if (d.constName) byConst.set(d.constName, table);
  }
  for (const p of pendingRefs) {
    const target = byConst.get(p.targetConst);
    const refTable = target?.name ?? p.targetConst;
    const refCol = target ? (keyToCol.get(target)?.get(p.targetKey) ?? p.targetKey) : p.targetKey;
    p.table.foreignKeys.push({ columns: [p.col], refTable, refColumns: [refCol], onDelete: p.onDelete, onUpdate: p.onUpdate });
  }
  for (const p of pendingFks) {
    const target = byConst.get(p.targetConst);
    p.table.foreignKeys.push({ columns: p.cols, refTable: target?.name ?? p.targetConst, refColumns: p.keys.map((k) => (target ? (keyToCol.get(target)?.get(k) ?? k) : k)) });
  }
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// 5. TypeORM
// ---------------------------------------------------------------------------

const TYPEORM_TS: Record<string, BaseType> = { string: "string", number: "int", boolean: "boolean", date: "timestamp", bigint: "bigint", buffer: "bytes" };

/** Parse TypeORM entity classes with column and relation decorators. Never throws. */
export function parseTypeormEntities(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste TypeORM entity classes with @Entity and @Column decorators." };
  const toks = tokenize(text);
  const r = new Reader(toks, text);
  const warnings: string[] = [];
  interface Deco {
    name: string;
    args: JsVal[];
  }
  interface Member {
    name: string;
    optional: boolean;
    type: string;
    decos: Deco[];
  }
  interface Entity {
    className: string;
    decos: Deco[];
    members: Member[];
  }
  const entities: Entity[] = [];
  let pending: Deco[] = [];
  let current: Entity | null = null;
  let classDepth = 0;
  let depth = 0;

  while (!r.done()) {
    const t = r.next()!;
    if (t.t === "p") {
      if (t.v === "{") depth++;
      else if (t.v === "}") {
        depth--;
        if (current && depth < classDepth) current = null;
      } else if (t.v === "@" && r.peek()?.t === "id") {
        const name = r.next()!.v;
        while (r.isP(".") && r.peek(1)?.t === "id") {
          r.next();
          r.next();
        }
        const args = r.isP("(") ? parseArgs(r) : [];
        pending.push({ name, args });
      }
      continue;
    }
    if (t.t === "id" && t.v === "class" && r.peek()?.t === "id") {
      const className = r.next()!.v;
      const ent: Entity = { className, decos: pending, members: [] };
      pending = [];
      if (ent.decos.some((d) => /^(Entity|ViewEntity|ChildEntity)$/.test(d.name))) {
        entities.push(ent);
        current = ent;
      } else current = null;
      while (!r.done() && !r.isP("{")) r.next();
      if (r.isP("{")) {
        r.next();
        depth++;
      }
      classDepth = depth;
      continue;
    }
    if (current && depth === classDepth && t.t === "id" && pending.length) {
      // member: [modifiers] name [?|!] : type [= default] ;
      let name = t.v;
      while (/^(public|private|protected|readonly|declare|static|override)$/.test(name) && r.peek()?.t === "id") name = r.next()!.v;
      if (r.isP("(")) {
        // method with decorators (e.g. @BeforeInsert) — skip
        skipBalanced(r);
        if (r.isP(":")) {
          r.next();
          while (!r.done() && !r.isP("{")) r.next();
        }
        if (r.isP("{")) {
          skipBalanced(r);
        }
        pending = [];
        continue;
      }
      let optional = false;
      if (r.isP("?")) {
        optional = true;
        r.next();
      } else if (r.isP("!")) r.next();
      let type = "";
      if (r.isP(":")) {
        r.next();
        const start = r.peek()?.s ?? 0;
        let d = 0;
        let end = start;
        while (!r.done()) {
          const x = r.peek()!;
          if (x.t === "p") {
            if (x.v === "{" || x.v === "(" || x.v === "[" || x.v === "<") d++;
            else if (x.v === "}" || x.v === ")" || x.v === "]" || x.v === ">") {
              if (d === 0) break;
              d--;
            } else if ((x.v === ";" || x.v === "=") && d === 0) break;
          }
          end = x.e;
          r.next();
        }
        type = text.slice(start, end).trim();
      }
      if (r.isP("=")) {
        r.next();
        parseValue(r);
      }
      if (r.isP(";")) r.next();
      current.members.push({ name, optional, type, decos: pending });
      pending = [];
    } else if (t.t === "id" && pending.length && depth === 0 && !/^(export|default|abstract|declare)$/.test(t.v)) {
      pending = [];
    }
  }
  if (!entities.length) return { ok: false, error: "No classes decorated with @Entity found." };

  const tables: Table[] = [];
  const byClass = new Map<string, Table>();
  const pendingRels: Array<{ table: Table; member: Member; targetClass: string; joins: Array<{ name?: string; ref?: string }>; onDelete?: string; nullable: boolean }> = [];
  for (const ent of entities.slice(0, DDL_LIMITS.maxTables)) {
    const entityDeco = ent.decos.find((d) => /^(Entity|ViewEntity|ChildEntity)$/.test(d.name))!;
    const nameArg = entityDeco.args[0];
    const tableName = (nameArg?.k === "str" ? nameArg.v : strOf(prop(nameArg, "name"))) ?? ent.className;
    const schema = strOf(prop(nameArg?.k === "obj" ? nameArg : entityDeco.args[1], "schema"));
    const table = newTable(tableName, schema);
    for (const d of ent.decos) {
      if (d.name === "Unique") table.uniques.push(strList(d.args.find((a) => a.k === "arr") ?? d.args[0]));
      if (d.name === "Index" && d.args.some((a) => a.k === "arr")) {
        const cols = strList(d.args.find((a) => a.k === "arr"));
        const unique = !!boolOf(prop(d.args.find((a) => a.k === "obj"), "unique"));
        if (unique) table.uniques.push(cols);
        else table.indexes.push({ name: strOf(d.args.find((a) => a.k === "str")), columns: cols, unique: false });
      }
    }
    for (const m of ent.members) {
      const colDeco = m.decos.find((d) => /Column$/.test(d.name) || d.name === "ObjectIdColumn");
      const rel = m.decos.find((d) => /^(ManyToOne|OneToOne)$/.test(d.name));
      const inverse = m.decos.find((d) => /^(OneToMany|ManyToMany)$/.test(d.name));
      if (inverse) {
        if (inverse.name === "ManyToMany" && m.decos.some((d) => d.name === "JoinTable")) pushWarning(warnings, `${ent.className}.${m.name}: many-to-many join table is not drawn.`);
        continue;
      }
      if (rel) {
        const targetArg = rel.args[0];
        const targetClass = targetArg?.k === "arrow" ? chainText(targetArg.body) : targetArg?.k === "ref" ? chainText(targetArg) : strOf(targetArg) ?? "";
        const opts = rel.args.find((a) => a.k === "obj");
        const join = m.decos.find((d) => d.name === "JoinColumn");
        const joinArg = join?.args[0];
        const joins: Array<{ name?: string; ref?: string }> = joinArg?.k === "arr" ? joinArg.items.map((j) => ({ name: strOf(prop(j, "name")), ref: strOf(prop(j, "referencedColumnName")) })) : [{ name: strOf(prop(joinArg, "name")), ref: strOf(prop(joinArg, "referencedColumnName")) }];
        const isOwner = !!join || rel.name === "ManyToOne";
        if (!isOwner) continue;
        const nullable = boolOf(prop(opts, "nullable")) ?? !!(m.optional || /\|\s*null/.test(m.type));
        pendingRels.push({ table, member: m, targetClass: targetClass.replace(/^.*\./, ""), joins, onDelete: strOf(prop(opts, "onDelete"))?.toUpperCase(), nullable });
        continue;
      }
      if (!colDeco) continue;
      const opts = colDeco.args.find((a) => a.k === "obj");
      const typeArg = colDeco.args.find((a) => a.k === "str");
      const rawType = strOf(prop(opts, "type")) ?? typeArg?.v;
      const tsBase = TYPEORM_TS[m.type.replace(/\s*\|\s*null/g, "").trim().toLowerCase()];
      let base: BaseType;
      let typeText: string;
      if (rawType) {
        const info = normalizeType(rawType, new Map());
        base = info.baseType;
        typeText = rawType;
      } else if (colDeco.name === "ObjectIdColumn") {
        base = "other";
        typeText = "ObjectId";
      } else if (/DateColumn$/.test(colDeco.name)) {
        base = "timestamp";
        typeText = "timestamp";
      } else if (colDeco.name === "PrimaryGeneratedColumn") {
        base = "int";
        typeText = "integer";
      } else {
        base = tsBase ?? "other";
        typeText = m.type.replace(/\s*\|\s*null/g, "").trim() || "unknown";
      }
      const col = makeColumn(strOf(prop(opts, "name")) ?? m.name, typeText, base, {
        nullable: boolOf(prop(opts, "nullable")) ?? false,
        unique: !!boolOf(prop(opts, "unique")),
        array: boolOf(prop(opts, "array")) || /\[\]$/.test(m.type) ? true : undefined,
        length: numOf(prop(opts, "length")),
        precision: numOf(prop(opts, "precision")),
        scale: numOf(prop(opts, "scale")),
        defaultValue: defaultText(prop(opts, "default")),
      });
      if (colDeco.name === "PrimaryGeneratedColumn" || colDeco.name === "PrimaryColumn" || colDeco.name === "ObjectIdColumn" || boolOf(prop(opts, "primary"))) {
        col.primaryKey = true;
        col.nullable = false;
      }
      if (colDeco.name === "PrimaryGeneratedColumn") {
        col.autoIncrement = typeArg?.v !== "uuid";
        if (typeArg?.v === "uuid") {
          col.baseType = "uuid";
          col.type = "uuid";
          col.defaultValue = "gen_random_uuid()";
        } else if (strOf(prop(opts, "type")) === "bigint") {
          col.baseType = "bigint";
          col.type = "bigint";
        }
      }
      if (/DateColumn$/.test(colDeco.name)) col.defaultValue = col.defaultValue ?? "now()";
      const enumVals = prop(opts, "enum");
      if (enumVals) {
        col.baseType = "enum";
        col.enumValues = enumVals.k === "arr" ? strList(enumVals) : enumVals.k === "obj" ? enumVals.props.map((p) => strOf(p.value) ?? p.key) : undefined;
        col.enumName = enumVals.k === "ref" ? chainText(enumVals) : undefined;
        if (!col.enumValues?.length) col.enumValues = undefined;
      }
      if (col.length) col.type = `${col.type}(${col.length})`;
      else if (col.precision) col.type = `${col.type}(${col.precision}${col.scale != null ? `,${col.scale}` : ""})`;
      table.columns.push(col);
    }
    finalizeTable(table);
    tables.push(table);
    byClass.set(ent.className, table);
  }
  if (entities.length > DDL_LIMITS.maxTables) pushWarning(warnings, `Only the first ${DDL_LIMITS.maxTables} entities were parsed.`);
  for (const rel of pendingRels) {
    const target = byClass.get(rel.targetClass);
    if (!target) {
      pushWarning(warnings, `${rel.table.name}.${rel.member.name}: relation to ${rel.targetClass}, which is not in the input.`);
      continue;
    }
    const cols: string[] = [];
    const refs: string[] = [];
    rel.joins.forEach((j, i) => {
      const ref = j.ref ?? target.primaryKey[i] ?? target.primaryKey[0] ?? "id";
      const name = j.name ?? `${rel.member.name}${ref[0].toUpperCase()}${ref.slice(1)}`;
      cols.push(name);
      refs.push(ref);
      if (!rel.table.columns.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        const refCol = target.columns.find((c) => c.name.toLowerCase() === ref.toLowerCase());
        rel.table.columns.push(makeColumn(name, refCol?.type ?? "integer", refCol?.baseType ?? "int", { nullable: rel.nullable }));
      }
    });
    rel.table.foreignKeys.push({ columns: cols, refTable: target.name, refColumns: refs, onDelete: rel.onDelete });
  }
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// 6. Sequelize
// ---------------------------------------------------------------------------

const SEQUELIZE_TYPES: Record<string, BaseType> = {
  string: "string",
  char: "string",
  text: "text",
  citext: "text",
  tinyint: "int",
  smallint: "int",
  mediumint: "int",
  integer: "int",
  bigint: "bigint",
  float: "float",
  real: "float",
  double: "float",
  decimal: "decimal",
  boolean: "boolean",
  date: "timestamp",
  dateonly: "date",
  time: "other",
  now: "timestamp",
  json: "json",
  jsonb: "json",
  jsontype: "json",
  uuid: "uuid",
  uuidv1: "uuid",
  uuidv4: "uuid",
  blob: "bytes",
  enum: "enum",
  array: "json",
  geometry: "other",
  geography: "other",
  range: "other",
  hstore: "json",
  cidr: "other",
  inet: "other",
  macaddr: "other",
  virtual: "other",
  tsvector: "other",
};

function sequelizeType(v: JsVal | undefined): { label: string; base: BaseType; length?: number; precision?: number; scale?: number; enumValues?: string[]; array?: boolean } {
  if (!v) return { label: "unknown", base: "other" };
  if (v.k === "str") return { label: v.v, base: SEQUELIZE_TYPES[v.v.toLowerCase()] ?? "other" };
  if (v.k !== "ref") return { label: "unknown", base: "other" };
  // DataTypes.STRING(255), Sequelize.ENUM("a","b"), DataTypes.ARRAY(DataTypes.STRING), STRING
  const seg = v.chain.find((c) => c.args) ?? v.chain[v.chain.length - 1];
  const name = seg.name;
  const lower = name.toLowerCase();
  const base = SEQUELIZE_TYPES[lower] ?? "other";
  const args = seg.args ?? [];
  if (lower === "array") {
    const inner = sequelizeType(args[0]);
    return { ...inner, label: `${inner.label}[]`, array: true };
  }
  if (lower === "enum") {
    const values = args.length === 1 && args[0].k === "arr" ? strList(args[0]) : args.length === 1 && args[0].k === "obj" ? strList(prop(args[0], "values")) : args.map(strOf).filter((s): s is string => !!s);
    return { label: "ENUM", base: "enum", enumValues: values };
  }
  const tail = v.chain.slice(v.chain.indexOf(seg) + 1).map((c) => c.name);
  const label = `${name}${args.length && numOf(args[0]) != null ? `(${args.map((a) => numOf(a)).filter((n) => n != null).join(",")})` : ""}${tail.includes("UNSIGNED") ? " UNSIGNED" : ""}`;
  const out: ReturnType<typeof sequelizeType> = { label, base };
  if (base === "string" && numOf(args[0]) != null) out.length = numOf(args[0]);
  if ((base === "decimal" || base === "float") && numOf(args[0]) != null) {
    out.precision = numOf(args[0]);
    out.scale = numOf(args[1]);
  }
  return out;
}

/** Parse `sequelize.define(...)`, `Model.init(...)` and association calls. Never throws. */
export function parseSequelizeModels(text: string): DdlParseResult {
  const big = tooLarge(text);
  if (big) return big;
  if (!text.trim()) return { ok: false, error: "Paste Sequelize models (sequelize.define or Model.init) and associations." };
  const toks = tokenize(text);
  const r = new Reader(toks, text);
  const warnings: string[] = [];
  interface ModelDef {
    constName?: string;
    modelName: string;
    attrs: JsVal;
    opts?: JsVal;
  }
  const models: ModelDef[] = [];
  const assocs: Array<{ source: string; kind: string; target: string; opts?: JsVal }> = [];
  const classNames = new Set<string>();
  const classRe = /\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+(?:\w+\.)?Model\b/g;
  let cm: RegExpExecArray | null;
  while ((cm = classRe.exec(text))) classNames.add(cm[1]);

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== "id" || toks[i + 1]?.v !== "(" || toks[i - 1]?.v !== ".") continue;
    const receiver = toks[i - 2];
    if (t.v === "define") {
      const constName = assignedName(r, i - 2);
      r.i = i + 1;
      const args = parseArgs(r);
      const modelName = strOf(args[0]);
      if (modelName && args[1]?.k === "obj") models.push({ constName, modelName, attrs: args[1], opts: args[2] });
      i = r.i - 1;
      continue;
    }
    if (t.v === "init" && receiver?.t === "id") {
      r.i = i + 1;
      const args = parseArgs(r);
      if (args[0]?.k === "obj") {
        const opts = args[1];
        models.push({ constName: receiver.v, modelName: strOf(prop(opts, "modelName")) ?? receiver.v, attrs: args[0], opts });
      }
      i = r.i - 1;
      continue;
    }
    if (/^(belongsTo|hasMany|hasOne|belongsToMany)$/.test(t.v) && receiver?.t === "id") {
      r.i = i + 1;
      const args = parseArgs(r);
      const target = args[0] ? (strOf(args[0]) ?? "") : "";
      if (target) assocs.push({ source: receiver.v, kind: t.v, target: target.replace(/^.*\./, ""), opts: args[1] });
      i = r.i - 1;
    }
  }
  if (!models.length) return { ok: false, error: "No sequelize.define(...) or Model.init(...) calls found." };

  const tables: Table[] = [];
  const byName = new Map<string, Table>(); // const name and model name -> table
  const attrToCol = new Map<Table, Map<string, string>>();
  const namer = new Map<Table, (attr: string) => string>();
  const pendingRefs: Array<{ table: Table; col: string; target: string; key?: string; onDelete?: string; onUpdate?: string }> = [];
  for (const m of models.slice(0, DDL_LIMITS.maxTables)) {
    const opts = m.opts;
    const freeze = boolOf(prop(opts, "freezeTableName")) ?? false;
    const underscored = boolOf(prop(opts, "underscored")) ?? false;
    const tableName = strOf(prop(opts, "tableName")) ?? (freeze ? m.modelName : plural(m.modelName));
    const table = newTable(tableName, strOf(prop(opts, "schema")));
    const map = new Map<string, string>();
    const dbName = (attr: string, field?: string) => field ?? (underscored ? attr.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase() : attr);
    for (const { key, value } of (m.attrs as { k: "obj"; props: Array<{ key: string; value: JsVal }> }).props) {
      const isObj = value.k === "obj" && !!prop(value, "type");
      const typeVal = isObj ? prop(value, "type") : value;
      const info = sequelizeType(typeVal);
      const colName = dbName(key, strOf(prop(isObj ? value : undefined, "field")));
      const o = isObj ? value : undefined;
      const col = makeColumn(colName, info.label, info.base, {
        nullable: boolOf(prop(o, "allowNull")) ?? true,
        primaryKey: !!boolOf(prop(o, "primaryKey")),
        autoIncrement: !!boolOf(prop(o, "autoIncrement")),
        unique: !!boolOf(prop(o, "unique")),
        length: info.length,
        precision: info.precision,
        scale: info.scale,
        array: info.array || undefined,
        defaultValue: defaultText(prop(o, "defaultValue")),
        enumValues: info.enumValues,
      });
      if (info.base === "other" && info.label !== "VIRTUAL") pushWarning(warnings, `${m.modelName}.${key}: unknown type ${info.label}.`);
      if (info.label === "VIRTUAL") continue;
      const uniq = prop(o, "unique");
      if (uniq?.k === "str") {
        col.unique = false;
        const group = table.uniques.find((u) => (u as string[] & { __name?: string }).__name === uniq.v);
        if (group) group.push(colName);
        else {
          const g = [colName] as string[] & { __name?: string };
          g.__name = uniq.v;
          table.uniques.push(g);
        }
      }
      const refs = prop(o, "references");
      if (refs) {
        const model = refs.k === "obj" ? prop(refs, "model") : refs;
        const target = model?.k === "obj" ? strOf(prop(model, "tableName")) : strOf(model);
        if (target) pendingRefs.push({ table, col: colName, target, key: strOf(prop(refs, "key")), onDelete: strOf(prop(o, "onDelete"))?.toUpperCase(), onUpdate: strOf(prop(o, "onUpdate"))?.toUpperCase() });
      }
      table.columns.push(col);
      map.set(key, colName);
    }
    const ts = prop(opts, "timestamps");
    if (ts === undefined || boolOf(ts)) {
      const ca = prop(opts, "createdAt");
      const ua = prop(opts, "updatedAt");
      const caName = ca?.k === "str" ? ca.v : ca?.k === "bool" && !ca.v ? null : dbName("createdAt");
      const uaName = ua?.k === "str" ? ua.v : ua?.k === "bool" && !ua.v ? null : dbName("updatedAt");
      if (caName && !table.columns.some((c) => c.name === caName)) table.columns.push(makeColumn(caName, "DATE", "timestamp", { nullable: false, defaultValue: "now()" }));
      if (uaName && !table.columns.some((c) => c.name === uaName)) table.columns.push(makeColumn(uaName, "DATE", "timestamp", { nullable: false, defaultValue: "now()" }));
      if (boolOf(prop(opts, "paranoid"))) {
        const da = prop(opts, "deletedAt");
        const daName = da?.k === "str" ? da.v : dbName("deletedAt");
        if (!table.columns.some((c) => c.name === daName)) table.columns.push(makeColumn(daName, "DATE", "timestamp", { nullable: true }));
      }
    }
    if (!table.columns.some((c) => c.primaryKey) && !table.primaryKey.length) table.columns.unshift(makeColumn("id", "INTEGER", "int", { nullable: false, primaryKey: true, autoIncrement: true }));
    const indexes = prop(opts, "indexes");
    if (indexes?.k === "arr") {
      for (const idx of indexes.items) {
        const cols = strList(prop(idx, "fields")).map((f) => map.get(f) ?? f);
        if (!cols.length) continue;
        if (boolOf(prop(idx, "unique"))) table.uniques.push(cols);
        else table.indexes.push({ name: strOf(prop(idx, "name")), columns: cols, unique: false });
      }
    }
    for (const u of table.uniques) delete (u as string[] & { __name?: string }).__name;
    finalizeTable(table);
    tables.push(table);
    attrToCol.set(table, map);
    namer.set(table, (attr) => dbName(attr));
    byName.set(m.modelName, table);
    if (m.constName) byName.set(m.constName, table);
    byName.set(tableName, table);
  }
  if (models.length > DDL_LIMITS.maxTables) pushWarning(warnings, `Only the first ${DDL_LIMITS.maxTables} models were parsed.`);

  const resolve = (name: string) => byName.get(name) ?? byName.get(name.replace(/^.*\./, "")) ?? findTable(tables, name) ?? findTable(tables, plural(name));
  for (const p of pendingRefs) {
    const target = resolve(p.target);
    p.table.foreignKeys.push({ columns: [p.col], refTable: target?.name ?? p.target, refColumns: [p.key ?? target?.primaryKey[0] ?? "id"], onDelete: p.onDelete, onUpdate: p.onUpdate });
  }
  for (const a of assocs) {
    const source = resolve(a.source);
    const target = resolve(a.target);
    if (!source || !target) {
      pushWarning(warnings, `${a.source}.${a.kind}(${a.target}): model not found in the input.`);
      continue;
    }
    if (a.kind === "belongsToMany") {
      const through = prop(a.opts, "through");
      pushWarning(warnings, `${a.source}.belongsToMany(${a.target}) through ${strOf(through?.k === "obj" ? prop(through, "model") : through) ?? "a join table"} is not drawn.`);
      continue;
    }
    // belongsTo: FK on source → target. hasMany / hasOne: FK on target → source.
    const owner = a.kind === "belongsTo" ? source : target;
    const other = a.kind === "belongsTo" ? target : source;
    const fkOpt = prop(a.opts, "foreignKey");
    const fkAttr = (fkOpt?.k === "obj" ? strOf(prop(fkOpt, "name")) ?? strOf(prop(fkOpt, "field")) : strOf(fkOpt)) ?? `${camelCase(singular((a.kind === "belongsTo" ? a.target : a.source).replace(/^.*\./, "")))}Id`;
    const fkCol = attrToCol.get(owner)?.get(fkAttr) ?? namer.get(owner)?.(fkAttr) ?? fkAttr;
    const refKey = strOf(prop(a.opts, a.kind === "belongsTo" ? "targetKey" : "sourceKey")) ?? other.primaryKey[0] ?? "id";
    if (owner.foreignKeys.some((fk) => fk.columns[0].toLowerCase() === fkCol.toLowerCase())) continue;
    if (!owner.columns.some((c) => c.name.toLowerCase() === fkCol.toLowerCase())) {
      const refCol = other.columns.find((c) => c.name.toLowerCase() === refKey.toLowerCase());
      const allowNull = fkOpt?.k === "obj" ? (boolOf(prop(fkOpt, "allowNull")) ?? true) : true;
      owner.columns.push(makeColumn(fkCol, refCol?.type ?? "INTEGER", refCol?.baseType ?? "int", { nullable: allowNull }));
    }
    owner.foreignKeys.push({ columns: [fkCol], refTable: other.name, refColumns: [refKey], onDelete: strOf(prop(a.opts, "onDelete"))?.toUpperCase(), onUpdate: strOf(prop(a.opts, "onUpdate"))?.toUpperCase() });
  }
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// Detection, registry and samples
// ---------------------------------------------------------------------------

/** Best guess at which parser fits the pasted text, or null when unsure. */
export function detectSchemaSource(text: string): SchemaSource | null {
  const t = text.trim();
  if (!t) return null;
  if (/\bcreate\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?table\b/i.test(t)) return "sql";
  if (/\b(pgTable|mysqlTable|sqliteTable|singlestoreTable)\s*\(/.test(t)) return "drizzle";
  if (/@Entity\s*\(/.test(t) || /@(Primary(Generated)?Column|Column)\s*\(/.test(t)) return "typeorm";
  if (/\bnew\s+(?:\w+\.)?Schema\s*\(/.test(t) || /\bmongoose\.model\s*\(/.test(t)) return "mongoose";
  if (/\.define\s*\(\s*["'`]\w+["'`]\s*,\s*\{/.test(t) || /\b(DataTypes|Sequelize)\.[A-Z]+\b/.test(t) || /\.init\s*\(\s*\{[\s\S]*\bsequelize\b/.test(t)) return "sequelize";
  if (/\bmodel\s+\w+\s*\{/.test(t) && (/@id\b|@relation\b|@default\(|@unique\b|\bdatasource\s+\w+\s*\{|\bgenerator\s+\w+\s*\{/.test(t))) return "prisma";
  if (/\b(interface|type)\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*(?:extends\s+[^{]+)?=?\s*\{/.test(t) || /\benum\s+\w+\s*\{/.test(t)) return "typescript";
  if (/^\s*db\.\w+/.test(t) || /^\s*[[{]/.test(t) || /\bObjectId\s*\(/.test(t)) return "json";
  return null;
}

export interface SourceSpec {
  id: SchemaSource;
  label: string;
  title: string;
  description: string;
  placeholder: string;
  sample: string;
  parse: (text: string) => DdlParseResult;
}

export const JSON_DOCS_SAMPLE = `// Sample documents, one insert per collection (mongosh style).
// Extended JSON ({ "$oid": ... }) and plain JSON work too.
// Fields named like a collection (user_id, userId, post) become relations.
db.users.insertMany([
  { _id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d1"), email: "ada@example.com", name: "Ada", role: "admin", createdAt: ISODate("2024-01-05T10:00:00Z") },
  { _id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d2"), email: "linus@example.com", name: "Linus", role: "member", bio: null, createdAt: ISODate("2024-02-11T09:30:00Z") }
]);

db.posts.insertMany([
  { _id: ObjectId("650000000000000000000001"), user_id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d1"), title: "Hello", tags: ["intro", "news"], status: "published", views: 120, meta: { readingTime: 3, cover: "hello.png" } },
  { _id: ObjectId("650000000000000000000002"), user_id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d2"), title: "Second", tags: [], status: "draft", views: 0, publishedAt: null }
]);

db.comments.insertMany([
  { _id: ObjectId("660000000000000000000001"), post_id: ObjectId("650000000000000000000001"), user_id: ObjectId("64f1a2b3c4d5e6f7a8b9c0d2"), body: "Nice!", likes: NumberLong(3) },
  { _id: ObjectId("660000000000000000000002"), post_id: ObjectId("650000000000000000000001"), body: "Anonymous comment", likes: NumberLong(0) }
]);
`;

export const MONGOOSE_SAMPLE = `import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 80 },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    bio: String,
    address: { city: String, country: { type: String, default: "IN" } },
  },
  { timestamps: true, collection: "users" },
);

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    tags: [String],
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    views: { type: Number, default: 0 },
    publishedAt: Date,
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } },
);
postSchema.index({ author: 1, status: 1 });

const commentSchema = new Schema({
  post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
  author: { type: Schema.Types.ObjectId, ref: "User" },
  body: { type: String, required: true },
  likes: { type: Number, default: 0 },
});

export const User = model("User", userSchema);
export const Post = model("Post", postSchema);
export const Comment = model("Comment", commentSchema);
`;

export const TYPESCRIPT_SAMPLE = `// Plain interfaces. \`id\` / \`_id\` become the key; \`authorId\`-style fields
// and \`// FK → table.column\` comments become relations. Kysely's
// Generated<> and a DB registry interface are understood too.
export type Role = "admin" | "member";

/** Table: users */
export interface User {
  id: number;                 // PK
  email: string;              // unique
  name: string;
  role: Role;
  bio?: string | null;
  createdAt: Date;
}

/** Table: posts */
export interface Post {
  id: number;                 // PK
  authorId: number;           // FK → users.id
  title: string;
  tags: string[];
  status: "draft" | "published";
  meta?: { readingTime: number; cover?: string };
  publishedAt: Date | null;
}

/** Table: comments */
export interface Comment {
  id: number;
  postId: number;
  userId?: number | null;
  body: string;
  likes: bigint;
}
`;

export const DRIZZLE_SAMPLE = `import { boolean, index, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "member"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  role: roleEnum("role").notNull().default("member"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    published: boolean("published").notNull().default(false),
    tags: text("tags").array(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [index("posts_author_idx").on(t.authorId, t.published)],
);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
`;

export const TYPEORM_SAMPLE = `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";

export type Role = "admin" | "member";

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 80 })
  name!: string;

  @Column({ type: "enum", enum: ["admin", "member"], default: "member" })
  role!: Role;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @OneToMany(() => Post, (post) => post.author)
  posts!: Post[];
}

@Entity({ name: "posts" })
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text", nullable: true })
  body!: string | null;

  @Column({ type: "boolean", default: false })
  published!: boolean;

  @ManyToOne(() => User, (user) => user.posts, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "author_id", referencedColumnName: "id" })
  author!: User;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments!: Comment[];
}

@Entity({ name: "comments" })
export class Comment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  body!: string;

  @ManyToOne(() => Post, (post) => post.comments, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: Post;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "author_id" })
  author!: User | null;
}
`;

export const SEQUELIZE_SAMPLE = `const { DataTypes } = require("sequelize");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    role: { type: DataTypes.ENUM("admin", "member"), defaultValue: "member" },
    bio: DataTypes.TEXT,
  },
  { tableName: "users", underscored: true },
);

const Post = sequelize.define(
  "Post",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    body: DataTypes.TEXT,
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt: DataTypes.DATE,
  },
  { tableName: "posts", underscored: true },
);

const Comment = sequelize.define(
  "Comment",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    body: { type: DataTypes.TEXT, allowNull: false },
    likes: { type: DataTypes.BIGINT, defaultValue: 0 },
  },
  { tableName: "comments", underscored: true, timestamps: false },
);

User.hasMany(Post, { foreignKey: { name: "authorId", allowNull: false }, onDelete: "CASCADE" });
Post.belongsTo(User, { foreignKey: "authorId" });
Post.hasMany(Comment, { foreignKey: "postId", onDelete: "CASCADE" });
Comment.belongsTo(User, { foreignKey: "authorId", onDelete: "SET NULL" });
`;

export const SCHEMA_SOURCES: SourceSpec[] = [
  {
    id: "sql",
    label: "SQL DDL",
    title: "SQL DDL",
    description: "CREATE TABLE statements with primary and foreign keys.",
    placeholder: "CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);",
    sample: DDL_SAMPLE,
    parse: parseDdl,
  },
  {
    id: "prisma",
    label: "Prisma",
    title: "Prisma schema",
    description: "model and enum blocks, including @relation fields.",
    placeholder: "model User {\n  id    Int    @id @default(autoincrement())\n  email String @unique\n}",
    sample: PRISMA_SAMPLE,
    parse: parsePrismaSchema,
  },
  {
    id: "json",
    label: "JSON docs",
    title: "JSON / MongoDB documents",
    description: "Sample documents per collection: mongosh inserts, { collection: [ … ] }, or mongoexport lines. Field types are inferred; *_id fields become relations.",
    placeholder: 'db.users.insertMany([\n  { _id: ObjectId("…"), email: "ada@example.com" }\n]);\n\n// or\n{ "users": [ { "_id": "…", "email": "…" } ], "posts": [ … ] }',
    sample: JSON_DOCS_SAMPLE,
    parse: parseJsonDocuments,
  },
  {
    id: "mongoose",
    label: "Mongoose",
    title: "Mongoose schemas",
    description: "new Schema({ … }) definitions with model() calls. ref fields become relations.",
    placeholder: 'const userSchema = new Schema({\n  email: { type: String, required: true, unique: true },\n});\nexport const User = model("User", userSchema);',
    sample: MONGOOSE_SAMPLE,
    parse: parseMongooseSchema,
  },
  {
    id: "typescript",
    label: "TypeScript",
    title: "TypeScript types",
    description: "interface and type declarations. id / _id is the key; userId-style fields, typed references and FK comments become relations. Kysely tables work too.",
    placeholder: "export interface User {\n  id: number;\n  email: string;\n}\n\nexport interface Post {\n  id: number;\n  authorId: number; // FK → users.id\n}",
    sample: TYPESCRIPT_SAMPLE,
    parse: parseTypeScriptTypes,
  },
  {
    id: "drizzle",
    label: "Drizzle",
    title: "Drizzle schema",
    description: "pgTable, mysqlTable or sqliteTable definitions with .references() and pgEnum.",
    placeholder: 'export const users = pgTable("users", {\n  id: serial("id").primaryKey(),\n  email: varchar("email", { length: 255 }).notNull().unique(),\n});',
    sample: DRIZZLE_SAMPLE,
    parse: parseDrizzleSchema,
  },
  {
    id: "typeorm",
    label: "TypeORM",
    title: "TypeORM entities",
    description: "@Entity classes with @Column, @PrimaryGeneratedColumn, @ManyToOne and @JoinColumn.",
    placeholder: '@Entity({ name: "users" })\nexport class User {\n  @PrimaryGeneratedColumn()\n  id!: number;\n\n  @Column({ type: "varchar", unique: true })\n  email!: string;\n}',
    sample: TYPEORM_SAMPLE,
    parse: parseTypeormEntities,
  },
  {
    id: "sequelize",
    label: "Sequelize",
    title: "Sequelize models",
    description: "sequelize.define / Model.init attributes plus belongsTo, hasMany and hasOne associations.",
    placeholder: 'const User = sequelize.define("User", {\n  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },\n  email: { type: DataTypes.STRING, unique: true },\n});',
    sample: SEQUELIZE_SAMPLE,
    parse: parseSequelizeModels,
  },
];

export function sourceSpec(id: SchemaSource): SourceSpec {
  return SCHEMA_SOURCES.find((s) => s.id === id) ?? SCHEMA_SOURCES[0];
}

/** Parse text with the given source's parser. */
export function parseSchemaSource(source: SchemaSource, text: string): DdlParseResult {
  return sourceSpec(source).parse(text);
}
