/**
 * Tolerant parser for CREATE TABLE DDL (PostgreSQL, MySQL, SQLite basics) and
 * Prisma schemas into one normalized table model. Everything runs in the
 * browser on pasted text; nothing is executed or sent anywhere.
 */

export type BaseType =
  | "string"
  | "text"
  | "int"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "json"
  | "uuid"
  | "bytes"
  | "enum"
  | "other";

export interface Column {
  name: string;
  /** Type as written, e.g. `VARCHAR(255)` or `timestamp with time zone` */
  type: string;
  baseType: BaseType;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  defaultValue?: string;
  autoIncrement: boolean;
  primaryKey: boolean;
  unique: boolean;
  enumValues?: string[];
  /** Name of a named enum type (Postgres CREATE TYPE / Prisma enum), when known */
  enumName?: string;
  /** Array column (`text[]`, Prisma `String[]`) */
  array?: boolean;
}

export interface ForeignKey {
  name?: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface IndexDef {
  name?: string;
  columns: string[];
  unique: boolean;
}

export interface Table {
  name: string;
  schema?: string;
  columns: Column[];
  primaryKey: string[];
  uniques: string[][];
  foreignKeys: ForeignKey[];
  indexes: IndexDef[];
}

export type DdlParseResult = { ok: true; tables: Table[]; warnings: string[] } | { ok: false; error: string };

export const DDL_LIMITS = { maxChars: 500_000, maxTables: 200, maxWarnings: 25 } as const;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

interface Tok {
  /** word = bare identifier/keyword, ident = quoted identifier, str = string literal */
  t: "word" | "ident" | "str" | "num" | "punct";
  v: string;
  start: number;
  end: number;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v") {
      i++;
      continue;
    }
    if (c === "-" && src[i + 1] === "-") {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "`") {
      let j = i + 1;
      let v = "";
      while (j < n) {
        if (src[j] === c) {
          if (src[j + 1] === c) {
            v += c;
            j += 2;
            continue;
          }
          break;
        }
        v += src[j++];
      }
      out.push({ t: "ident", v, start: i, end: Math.min(j + 1, n) });
      i = j + 1;
      continue;
    }
    if (c === "[") {
      if (src[i + 1] === "]") {
        out.push({ t: "punct", v: "[]", start: i, end: i + 2 });
        i += 2;
        continue;
      }
      const close = src.indexOf("]", i + 1);
      if (close > 0 && /^[A-Za-z_][^\]\n]*$/.test(src.slice(i + 1, close))) {
        out.push({ t: "ident", v: src.slice(i + 1, close), start: i, end: close + 1 });
        i = close + 1;
        continue;
      }
      out.push({ t: "punct", v: "[", start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let v = "";
      while (j < n) {
        if (src[j] === "\\" && j + 1 < n) {
          v += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            v += "'";
            j += 2;
            continue;
          }
          break;
        }
        v += src[j++];
      }
      out.push({ t: "str", v, start: i, end: Math.min(j + 1, n) });
      i = j + 1;
      continue;
    }
    if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(src.slice(i, i + 64));
      if (tag) {
        const close = src.indexOf(tag[0], i + tag[0].length);
        const end = close < 0 ? n : close + tag[0].length;
        out.push({ t: "str", v: src.slice(i + tag[0].length, close < 0 ? n : close), start: i, end });
        i = end;
        continue;
      }
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 64));
      const v = m ? m[0] : c;
      out.push({ t: "num", v, start: i, end: i + v.length });
      i += v.length;
      continue;
    }
    if (/[A-Za-z_\u0080-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$\u0080-￿]/.test(src[j])) j++;
      out.push({ t: "word", v: src.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (c === ":" && src[i + 1] === ":") {
      out.push({ t: "punct", v: "::", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    out.push({ t: "punct", v: c, start: i, end: i + 1 });
    i++;
  }
  return out;
}

function up(t: Tok | undefined): string {
  return t && t.t === "word" ? t.v.toUpperCase() : "";
}

function isPunct(t: Tok | undefined, v: string): boolean {
  return !!t && t.t === "punct" && t.v === v;
}

function isNameTok(t: Tok | undefined): boolean {
  return !!t && (t.t === "word" || t.t === "ident");
}

class Cursor {
  pos = 0;
  constructor(
    readonly toks: Tok[],
    readonly src: string,
  ) {}
  more(): boolean {
    return this.pos < this.toks.length;
  }
  peek(k = 0): Tok | undefined {
    return this.toks[this.pos + k];
  }
  next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  /** Consume the given keyword sequence if present. */
  kw(...words: string[]): boolean {
    for (let k = 0; k < words.length; k++) if (up(this.peek(k)) !== words[k]) return false;
    this.pos += words.length;
    return true;
  }
  punct(v: string): boolean {
    if (isPunct(this.peek(), v)) {
      this.pos++;
      return true;
    }
    return false;
  }
  /** Read a possibly schema-qualified name: `schema.name` or `"a"."b"`. */
  name(): { schema?: string; name: string } | null {
    const t = this.peek();
    if (!isNameTok(t)) return null;
    this.pos++;
    const parts = [t!.v];
    while (isPunct(this.peek(), ".") && isNameTok(this.peek(1))) {
      this.pos++;
      parts.push(this.next()!.v);
    }
    const name = parts[parts.length - 1];
    return parts.length > 1 ? { schema: parts[parts.length - 2], name } : { name };
  }
  /** At `(`: skip the balanced group and return its inner tokens. */
  group(): Tok[] | null {
    if (!isPunct(this.peek(), "(")) return null;
    const start = ++this.pos;
    let depth = 1;
    while (this.pos < this.toks.length) {
      const t = this.toks[this.pos];
      if (isPunct(t, "(")) depth++;
      else if (isPunct(t, ")")) {
        depth--;
        if (depth === 0) break;
      }
      this.pos++;
    }
    const inner = this.toks.slice(start, this.pos);
    this.pos++; // closing paren (or end)
    return inner;
  }
  slice(from: Tok, to: Tok): string {
    return this.src.slice(from.start, to.end).replace(/\s+/g, " ").trim();
  }
}

function splitTop(toks: Tok[], sep = ","): Tok[][] {
  const out: Tok[][] = [];
  let depth = 0;
  let cur: Tok[] = [];
  for (const t of toks) {
    if (isPunct(t, "(")) depth++;
    else if (isPunct(t, ")")) depth--;
    if (depth === 0 && isPunct(t, sep)) {
      out.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length || out.length) out.push(cur);
  return out.filter((x) => x.length);
}

// ---------------------------------------------------------------------------
// Type normalisation
// ---------------------------------------------------------------------------

const TYPE_MAP: Record<string, BaseType> = {
  int: "int",
  integer: "int",
  int4: "int",
  int2: "int",
  int3: "int",
  smallint: "int",
  tinyint: "int",
  mediumint: "int",
  serial: "int",
  serial4: "int",
  serial2: "int",
  smallserial: "int",
  number: "int",
  bigint: "bigint",
  int8: "bigint",
  bigserial: "bigint",
  serial8: "bigint",
  varchar: "string",
  "character varying": "string",
  char: "string",
  character: "string",
  nchar: "string",
  nvarchar: "string",
  varchar2: "string",
  nvarchar2: "string",
  citext: "string",
  string: "string",
  text: "text",
  tinytext: "text",
  mediumtext: "text",
  longtext: "text",
  clob: "text",
  ntext: "text",
  float: "float",
  float4: "float",
  float8: "float",
  real: "float",
  double: "float",
  "double precision": "float",
  decimal: "decimal",
  dec: "decimal",
  numeric: "decimal",
  money: "decimal",
  smallmoney: "decimal",
  boolean: "boolean",
  bool: "boolean",
  bit: "boolean",
  date: "date",
  datetime: "datetime",
  datetime2: "datetime",
  smalldatetime: "datetime",
  timestamp: "timestamp",
  timestamptz: "timestamp",
  "timestamp with time zone": "timestamp",
  "timestamp without time zone": "timestamp",
  json: "json",
  jsonb: "json",
  uuid: "uuid",
  uniqueidentifier: "uuid",
  bytea: "bytes",
  blob: "bytes",
  tinyblob: "bytes",
  mediumblob: "bytes",
  longblob: "bytes",
  binary: "bytes",
  varbinary: "bytes",
  bytes: "bytes",
  image: "bytes",
  enum: "enum",
};

function parseStringList(args: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^']|'')*)'|"((?:[^"]|"")*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(args))) out.push((m[1] ?? m[2] ?? "").replace(/''/g, "'").replace(/""/g, '"'));
  return out;
}

interface TypeInfo {
  baseType: BaseType;
  length?: number;
  precision?: number;
  scale?: number;
  enumValues?: string[];
  enumName?: string;
  array?: boolean;
  serial: boolean;
}

function normalizeType(raw: string, enums: Map<string, string[]>): TypeInfo {
  const lower = raw.toLowerCase();
  const argsMatch = /\(([^()]*)\)/.exec(lower);
  const args = argsMatch ? argsMatch[1] : "";
  const array = /\[\s*\d*\s*\]/.test(lower) || /\barray\b/.test(lower);
  let base = lower
    .replace(/\([^()]*\)/g, " ")
    .replace(/\[\s*\d*\s*\]/g, " ")
    .replace(/["`]/g, "")
    .replace(/\b(unsigned|zerofill|signed|array)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  base = base.replace(/^[a-z_][a-z0-9_]*\./, ""); // strip schema prefix (public.status)
  const serial = /^(big|small)?serial[248]?$/.test(base);
  const info: TypeInfo = { baseType: TYPE_MAP[base] ?? "other", serial, array: array || undefined };
  if (info.baseType === "other" && enums.has(base)) {
    info.baseType = "enum";
    info.enumValues = enums.get(base);
    info.enumName = base;
  }
  if (base === "enum" || base === "set") {
    info.baseType = "enum";
    info.enumValues = parseStringList(argsMatch ? argsMatch[1] : "");
    return info;
  }
  const nums = args
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
  if (base === "tinyint" && nums[0] === 1) info.baseType = "boolean";
  if (base === "bit" && nums.length && nums[0] > 1) info.baseType = "bytes";
  if (nums.length) {
    if (info.baseType === "string" || info.baseType === "bytes") info.length = nums[0];
    else if (info.baseType === "decimal" || info.baseType === "float") {
      info.precision = nums[0];
      if (nums.length > 1) info.scale = nums[1];
    } else if (info.baseType === "timestamp" || info.baseType === "datetime") info.precision = nums[0];
  }
  return info;
}

// ---------------------------------------------------------------------------
// Statement parsers
// ---------------------------------------------------------------------------

interface Ctx {
  src: string;
  tables: Table[];
  enums: Map<string, string[]>;
  warnings: string[];
  skipped: Map<string, number>;
}

function warn(ctx: Ctx, msg: string) {
  if (ctx.warnings.length < DDL_LIMITS.maxWarnings && !ctx.warnings.includes(msg)) ctx.warnings.push(msg);
}

function newTable(name: string, schema?: string): Table {
  return { name, schema, columns: [], primaryKey: [], uniques: [], foreignKeys: [], indexes: [] };
}

export function findTable(tables: Table[], name: string): Table | undefined {
  const bare = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  const lc = bare.toLowerCase();
  return tables.find((t) => t.name.toLowerCase() === lc);
}

const COLUMN_STOP = new Set([
  "NOT",
  "NULL",
  "DEFAULT",
  "PRIMARY",
  "UNIQUE",
  "REFERENCES",
  "AUTO_INCREMENT",
  "AUTOINCREMENT",
  "GENERATED",
  "CHECK",
  "COLLATE",
  "CONSTRAINT",
  "COMMENT",
  "ON",
  "IDENTITY",
  "AS",
  "ENCODE",
  "INVISIBLE",
  "VISIBLE",
  "STORED",
  "VIRTUAL",
]);

/** Read one expression (a DEFAULT value): atom, optional call args, casts. */
function readExpr(c: Cursor): string | undefined {
  const first = c.peek();
  if (!first) return undefined;
  let last: Tok = first;
  if (isPunct(first, "(")) {
    c.group();
    last = c.toks[c.pos - 1] ?? first;
  } else {
    c.next();
    if ((isPunct(first, "-") || isPunct(first, "+")) && c.peek()?.t === "num") last = c.next()!;
    // MySQL bit/hex literals such as b'0' or x'FF'
    if (first.t === "word" && c.peek()?.t === "str" && c.peek()!.start === first.end) last = c.next()!;
  }
  for (;;) {
    const t = c.peek();
    if (isPunct(t, "(")) {
      c.group();
      last = c.toks[c.pos - 1] ?? last;
      continue;
    }
    if (isPunct(t, "::")) {
      c.next();
      const typeWord = c.peek();
      if (!isNameTok(typeWord)) break;
      last = c.next()!;
      for (;;) {
        const w = c.peek();
        if (isPunct(w, "(")) {
          c.group();
          last = c.toks[c.pos - 1] ?? last;
        } else if (isPunct(w, "[]") || (isPunct(w, ".") && isNameTok(c.peek(1)))) {
          c.next();
          last = isPunct(w, ".") ? c.next()! : w!;
        } else if (/^(VARYING|PRECISION|WITH|WITHOUT|TIME|ZONE)$/.test(up(w))) last = c.next()!;
        else break;
      }
      continue;
    }
    if (t && t.t === "ident" && t.start === last.end) {
      // ARRAY['a'] style: our tokenizer reads `[...]` as an identifier
      last = c.next()!;
      continue;
    }
    break;
  }
  return c.slice(first, last);
}

function readAction(c: Cursor): string | undefined {
  if (c.kw("SET", "NULL")) return "SET NULL";
  if (c.kw("SET", "DEFAULT")) return "SET DEFAULT";
  if (c.kw("NO", "ACTION")) return "NO ACTION";
  if (c.kw("CASCADE")) return "CASCADE";
  if (c.kw("RESTRICT")) return "RESTRICT";
  return undefined;
}

function readColumnNames(c: Cursor): string[] {
  const inner = c.group();
  if (!inner) return [];
  return splitTop(inner).map((part) => {
    const first = part[0];
    if (isNameTok(first) && (part.length === 1 || !isPunct(part[1], "("))) return first.v;
    if (isNameTok(first) && isPunct(part[1], "(") && part.every((t) => t.t !== "word" || t === first || /^\d+$/.test(t.v))) return first.v; // MySQL prefix index `name(20)`
    return c.slice(part[0], part[part.length - 1]);
  });
}

function parseReferences(c: Cursor, name?: string): ForeignKey | null {
  if (!c.kw("REFERENCES")) return null;
  const ref = c.name();
  if (!ref) return null;
  const fk: ForeignKey = { name, columns: [], refTable: ref.name, refColumns: [] };
  if (isPunct(c.peek(), "(")) fk.refColumns = readColumnNames(c);
  for (;;) {
    if (c.kw("MATCH")) {
      c.next();
      continue;
    }
    if (c.kw("ON", "DELETE")) {
      fk.onDelete = readAction(c);
      continue;
    }
    if (c.kw("ON", "UPDATE")) {
      fk.onUpdate = readAction(c);
      continue;
    }
    if (c.kw("NOT", "DEFERRABLE") || c.kw("DEFERRABLE") || c.kw("INITIALLY", "DEFERRED") || c.kw("INITIALLY", "IMMEDIATE")) continue;
    break;
  }
  return fk;
}

function parseColumnDef(c: Cursor, table: Table, ctx: Ctx) {
  const nameTok = c.next();
  if (!nameTok || !isNameTok(nameTok)) return;
  const typeToks: Tok[] = [];
  while (c.more()) {
    const t = c.peek()!;
    const u = up(t);
    if (COLUMN_STOP.has(u)) break;
    if (u === "CHARACTER" && up(c.peek(1)) === "SET") break;
    if (u === "KEY" && typeToks.length) break; // MySQL `col INT KEY`
    if (isPunct(t, "(")) {
      c.group();
      typeToks.push(t, c.toks[c.pos - 1] ?? t);
      continue;
    }
    typeToks.push(t);
    c.next();
  }
  const rawType = typeToks.length ? c.slice(typeToks[0], typeToks[typeToks.length - 1]) : "";
  const info = normalizeType(rawType, ctx.enums);
  const col: Column = {
    name: nameTok.v,
    type: rawType,
    baseType: info.baseType,
    length: info.length,
    precision: info.precision,
    scale: info.scale,
    nullable: true,
    autoIncrement: info.serial,
    primaryKey: false,
    unique: false,
    enumValues: info.enumValues,
    enumName: info.enumName,
    array: info.array,
  };
  if (info.serial) col.nullable = false;
  let constraintName: string | undefined;
  while (c.more()) {
    const u = up(c.peek());
    if (c.kw("NOT", "NULL")) col.nullable = false;
    else if (c.kw("NULL")) col.nullable = true;
    else if (c.kw("DEFAULT")) col.defaultValue = readExpr(c);
    else if (c.kw("PRIMARY", "KEY") || c.kw("KEY")) {
      col.primaryKey = true;
      col.nullable = false;
    } else if (c.kw("UNIQUE")) {
      c.kw("KEY");
      col.unique = true;
    } else if (c.kw("AUTO_INCREMENT") || c.kw("AUTOINCREMENT")) col.autoIncrement = true;
    else if (c.kw("IDENTITY")) {
      c.group();
      col.autoIncrement = true;
    } else if (c.kw("GENERATED")) {
      if (!c.kw("ALWAYS")) c.kw("BY", "DEFAULT");
      c.kw("AS");
      if (c.kw("IDENTITY")) {
        col.autoIncrement = true;
        c.group();
      } else c.group();
      if (!c.kw("STORED")) c.kw("VIRTUAL");
    } else if (c.kw("AS")) {
      c.group();
      if (!c.kw("STORED")) c.kw("VIRTUAL");
    } else if (u === "REFERENCES") {
      const fk = parseReferences(c, constraintName);
      if (fk) {
        fk.columns = [col.name];
        table.foreignKeys.push(fk);
      }
      constraintName = undefined;
    } else if (c.kw("CHECK")) c.group();
    else if (c.kw("COLLATE") || c.kw("COMMENT") || c.kw("ENCODE")) c.next();
    else if (c.kw("CONSTRAINT")) constraintName = c.next()?.v;
    else if (c.kw("CHARACTER", "SET")) c.next();
    else if (c.kw("ON", "UPDATE")) readExpr(c);
    else c.next();
  }
  table.columns.push(col);
}

function parseTableElement(toks: Tok[], table: Table, ctx: Ctx) {
  const c = new Cursor(toks, ctx.src);
  let constraintName: string | undefined;
  if (c.kw("CONSTRAINT")) constraintName = c.next()?.v;
  const u = up(c.peek());
  const u1 = up(c.peek(1));
  if (c.kw("PRIMARY", "KEY")) {
    if (c.kw("USING")) c.next();
    if (isNameTok(c.peek()) && isPunct(c.peek(1), "(")) c.next();
    table.primaryKey = readColumnNames(c);
    return;
  }
  if (c.kw("UNIQUE")) {
    if (!c.kw("KEY")) c.kw("INDEX");
    if (isNameTok(c.peek()) && isPunct(c.peek(1), "(")) constraintName = c.next()!.v;
    if (c.kw("USING")) c.next();
    const cols = readColumnNames(c);
    if (cols.length) table.uniques.push(cols);
    if (constraintName) table.indexes.push({ name: constraintName, columns: cols, unique: true });
    return;
  }
  if (c.kw("FOREIGN", "KEY")) {
    if (isNameTok(c.peek()) && isPunct(c.peek(1), "(")) c.next();
    const cols = readColumnNames(c);
    const fk = parseReferences(c, constraintName);
    if (fk) {
      fk.columns = cols;
      table.foreignKeys.push(fk);
    } else warn(ctx, `Table ${table.name}: FOREIGN KEY without a REFERENCES clause was ignored.`);
    return;
  }
  if ((u === "KEY" || u === "INDEX") && (u1 === "" || isPunct(c.peek(1), "(") || (isNameTok(c.peek(1)) && isPunct(c.peek(2), "(")) || (isNameTok(c.peek(1)) && up(c.peek(2)) === "USING"))) {
    c.next();
    let name: string | undefined;
    if (isNameTok(c.peek()) && !isPunct(c.peek(), "(")) name = c.next()!.v;
    if (c.kw("USING")) c.next();
    const cols = readColumnNames(c);
    if (cols.length) table.indexes.push({ name, columns: cols, unique: false });
    return;
  }
  if (u === "CHECK" || u === "EXCLUDE" || u === "FULLTEXT" || u === "SPATIAL" || u === "LIKE" || u === "PERIOD") return;
  parseColumnDef(c, table, ctx);
}

function skipToStatementStart(c: Cursor) {
  let depth = 0;
  while (c.more()) {
    const t = c.peek()!;
    if (isPunct(t, "(")) depth++;
    else if (isPunct(t, ")")) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (up(t) === "CREATE" || up(t) === "ALTER")) return;
    c.next();
  }
}

function parseCreateTable(c: Cursor, ctx: Ctx): boolean {
  c.kw("IF", "NOT", "EXISTS");
  const nm = c.name();
  if (!nm) return false;
  if (!isPunct(c.peek(), "(")) {
    warn(ctx, `CREATE TABLE ${nm.name}: only column-list definitions are supported (skipped).`);
    return false;
  }
  if (ctx.tables.length >= DDL_LIMITS.maxTables) {
    warn(ctx, `Only the first ${DDL_LIMITS.maxTables} tables were parsed.`);
    c.group();
    return true;
  }
  const table = newTable(nm.name, nm.schema);
  const body = c.group() ?? [];
  for (const el of splitTop(body)) parseTableElement(el, table, ctx);
  finalizeTable(table);
  const existing = findTable(ctx.tables, table.name);
  if (existing) warn(ctx, `Table ${table.name} is defined more than once; the later definition wins.`);
  ctx.tables = ctx.tables.filter((t) => t !== existing);
  ctx.tables.push(table);
  return true;
}

function finalizeTable(table: Table) {
  if (!table.primaryKey.length) table.primaryKey = table.columns.filter((col) => col.primaryKey).map((col) => col.name);
  for (const col of table.columns) {
    if (table.primaryKey.some((k) => k.toLowerCase() === col.name.toLowerCase())) {
      col.primaryKey = true;
      col.nullable = false;
    }
    if (col.unique && !table.uniques.some((u) => u.length === 1 && u[0].toLowerCase() === col.name.toLowerCase())) table.uniques.push([col.name]);
  }
  for (const u of table.uniques) {
    if (u.length !== 1) continue;
    const col = table.columns.find((x) => x.name.toLowerCase() === u[0].toLowerCase());
    if (col) col.unique = true;
  }
}

function parseCreateIndex(c: Cursor, ctx: Ctx, unique: boolean): boolean {
  c.kw("CONCURRENTLY");
  c.kw("IF", "NOT", "EXISTS");
  let name: string | undefined;
  if (up(c.peek()) !== "ON") name = c.name()?.name;
  if (!c.kw("ON")) return false;
  c.kw("ONLY");
  const tn = c.name();
  if (!tn) return false;
  if (c.kw("USING")) c.next();
  const cols = readColumnNames(c);
  const table = findTable(ctx.tables, tn.name);
  if (!table) {
    warn(ctx, `CREATE INDEX ${name ?? ""} refers to unknown table ${tn.name}.`.replace(/\s+/g, " "));
    return true;
  }
  table.indexes.push({ name, columns: cols, unique });
  if (unique && cols.length) {
    table.uniques.push(cols);
    if (cols.length === 1) {
      const col = table.columns.find((x) => x.name.toLowerCase() === cols[0].toLowerCase());
      if (col) col.unique = true;
    }
  }
  return true;
}

function parseCreateType(c: Cursor, ctx: Ctx): boolean {
  const nm = c.name();
  if (!nm) return false;
  if (!c.kw("AS", "ENUM")) {
    warn(ctx, `CREATE TYPE ${nm.name}: only ENUM types are supported (skipped).`);
    return false;
  }
  const inner = c.group() ?? [];
  ctx.enums.set(nm.name.toLowerCase(), inner.filter((t) => t.t === "str").map((t) => t.v));
  return true;
}

function parseAlterTable(c: Cursor, ctx: Ctx): boolean {
  c.kw("ONLY");
  c.kw("IF", "EXISTS");
  const tn = c.name();
  if (!tn) return false;
  const table = findTable(ctx.tables, tn.name);
  // Collect the action tokens up to the next statement start, then split on commas.
  const start = c.pos;
  skipToStatementStart(c);
  const actions = splitTop(c.toks.slice(start, c.pos));
  if (!table) {
    warn(ctx, `ALTER TABLE ${tn.name}: table not defined above (skipped).`);
    return true;
  }
  for (const act of actions) {
    const a = new Cursor(act, ctx.src);
    if (a.kw("ADD")) {
      if (a.kw("COLUMN") || (isNameTok(a.peek()) && !["CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "KEY", "INDEX", "CHECK"].includes(up(a.peek())))) {
        a.kw("IF", "NOT", "EXISTS");
        parseColumnDef(a, table, ctx);
      } else parseTableElement(act.slice(a.pos), table, ctx);
    } else warn(ctx, `ALTER TABLE ${table.name}: only ADD COLUMN / ADD CONSTRAINT are supported; other actions were skipped.`);
  }
  finalizeTable(table);
  return true;
}

function parseOne(c: Cursor, ctx: Ctx): boolean {
  const startTok = c.peek();
  if (!startTok) return true;
  if (c.kw("CREATE")) {
    let unique = false;
    for (;;) {
      if (c.kw("OR", "REPLACE") || c.kw("TEMP") || c.kw("TEMPORARY") || c.kw("UNLOGGED") || c.kw("GLOBAL") || c.kw("LOCAL")) continue;
      if (c.kw("UNIQUE")) {
        unique = true;
        continue;
      }
      break;
    }
    if (c.kw("TABLE")) return parseCreateTable(c, ctx);
    if (c.kw("INDEX")) return parseCreateIndex(c, ctx, unique);
    if (c.kw("TYPE")) return parseCreateType(c, ctx);
    return false;
  }
  if (c.kw("ALTER", "TABLE")) return parseAlterTable(c, ctx);
  return false;
}

function statementLabel(toks: Tok[]): string {
  return toks
    .slice(0, 2)
    .map((t) => (t.t === "word" ? t.v.toUpperCase() : t.v))
    .join(" ");
}

/** Parse SQL DDL into the normalized table model. Never throws. */
export function parseDdl(sql: string): DdlParseResult {
  if (sql.length > DDL_LIMITS.maxChars) return { ok: false, error: `Input is too large (${Math.round(sql.length / 1000)} KB). The limit is ${DDL_LIMITS.maxChars / 1000} KB.` };
  if (!sql.trim()) return { ok: false, error: "Paste one or more CREATE TABLE statements." };
  let toks: Tok[];
  try {
    toks = tokenize(sql);
  } catch {
    return { ok: false, error: "Could not tokenize the SQL." };
  }
  const ctx: Ctx = { src: sql, tables: [], enums: new Map(), warnings: [], skipped: new Map() };
  try {
    for (const stmt of splitTop(toks, ";")) {
      const c = new Cursor(stmt, sql);
      while (c.more()) {
        const before = c.pos;
        const handled = parseOne(c, ctx);
        if (!handled) {
          const label = statementLabel(stmt.slice(before));
          ctx.skipped.set(label, (ctx.skipped.get(label) ?? 0) + 1);
        }
        skipToStatementStart(c);
        if (c.pos === before) c.next();
      }
    }
  } catch {
    return { ok: false, error: "The SQL could not be parsed. Check for unbalanced parentheses or quotes." };
  }
  // Resolve foreign keys with implicit referenced columns (defaults to the target's primary key).
  for (const t of ctx.tables) {
    for (const fk of t.foreignKeys) {
      if (!fk.refColumns.length) {
        const target = findTable(ctx.tables, fk.refTable);
        fk.refColumns = target?.primaryKey.length ? [...target.primaryKey] : ["id"];
      }
      if (!findTable(ctx.tables, fk.refTable)) warn(ctx, `Table ${t.name} references ${fk.refTable}, which is not defined in the input.`);
    }
    // Enum types declared after the table that uses them.
    for (const col of t.columns) {
      if (col.baseType === "other") {
        const key = col.type.toLowerCase().replace(/["`]/g, "").replace(/^[a-z_][a-z0-9_]*\./, "");
        const values = ctx.enums.get(key);
        if (values) {
          col.baseType = "enum";
          col.enumValues = values;
          col.enumName = key;
        }
      }
    }
  }
  if (ctx.skipped.size) {
    const parts = [...ctx.skipped.entries()].slice(0, 8).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k));
    warn(ctx, `Skipped unsupported statements: ${parts.join(", ")}.`);
  }
  if (!ctx.tables.length) return { ok: false, error: "No CREATE TABLE statements found." };
  return { ok: true, tables: ctx.tables, warnings: ctx.warnings };
}

// ---------------------------------------------------------------------------
// Prisma schema
// ---------------------------------------------------------------------------

const PRISMA_SCALARS: Record<string, BaseType> = {
  String: "string",
  Int: "int",
  BigInt: "bigint",
  Float: "float",
  Decimal: "decimal",
  Boolean: "boolean",
  DateTime: "timestamp",
  Json: "json",
  Bytes: "bytes",
};

function prismaAttrArgs(attrs: string, name: string): string | null {
  const i = attrs.indexOf(`@${name}(`);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i + name.length + 1; j < attrs.length; j++) {
    if (attrs[j] === "(") depth++;
    else if (attrs[j] === ")") {
      depth--;
      if (depth === 0) return attrs.slice(i + name.length + 2, j);
    }
  }
  return null;
}

function prismaList(s: string | null): string[] {
  if (!s) return [];
  const m = /\[([^\]]*)\]/.exec(s);
  return (m ? m[1] : s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function prismaDefault(raw: string): { value?: string; autoIncrement: boolean } {
  const v = raw.trim();
  if (v === "autoincrement()") return { autoIncrement: true };
  if (v === "now()") return { value: "now()", autoIncrement: false };
  if (/^(uuid|cuid|nanoid|ulid)\(\d*\)$/.test(v)) return { value: v, autoIncrement: false };
  const db = /^dbgenerated\("((?:[^"\\]|\\.)*)"\)$/.exec(v);
  if (db) return { value: db[1], autoIncrement: false };
  const str = /^"((?:[^"\\]|\\.)*)"$/.exec(v);
  if (str) return { value: `'${str[1]}'`, autoIncrement: false };
  if (/^-?\d+(\.\d+)?$/.test(v) || v === "true" || v === "false") return { value: v, autoIncrement: false };
  if (/^[A-Za-z_]\w*$/.test(v)) return { value: `'${v}'`, autoIncrement: false }; // enum value
  return { value: v, autoIncrement: false };
}

/** Parse Prisma `model` and `enum` blocks into the same table model as parseDdl. Never throws. */
export function parsePrismaSchema(text: string): DdlParseResult {
  if (text.length > DDL_LIMITS.maxChars) return { ok: false, error: `Input is too large (${Math.round(text.length / 1000)} KB). The limit is ${DDL_LIMITS.maxChars / 1000} KB.` };
  if (!text.trim()) return { ok: false, error: "Paste a Prisma schema with at least one model." };
  const src = text.replace(/\/\/[^\n]*/g, "");
  const warnings: string[] = [];
  const enums = new Map<string, string[]>();
  const models: Array<{ name: string; body: string }> = [];
  const blockRe = /\b(model|enum|type|datasource|generator|view)\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(src))) {
    const [, kind, name, body] = m;
    if (kind === "enum") {
      const values = body
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((v) => v && !v.startsWith("@"));
      enums.set(name, values);
    } else if (kind === "model" || kind === "view") {
      if (models.length >= DDL_LIMITS.maxTables) {
        if (!warnings.includes(`Only the first ${DDL_LIMITS.maxTables} models were parsed.`)) warnings.push(`Only the first ${DDL_LIMITS.maxTables} models were parsed.`);
        continue;
      }
      models.push({ name, body });
    } else if (kind === "type") warnings.push(`Composite type ${name} is not shown (only models are).`);
  }
  if (!models.length) return { ok: false, error: "No `model` blocks found." };
  const modelNames = new Set(models.map((x) => x.name));

  const tables: Table[] = [];
  const fieldMaps: Array<Map<string, string>> = [];
  for (const model of models) {
    const table = newTable(model.name);
    // Prisma field name -> database column name (differs only with @map)
    const fieldToCol = new Map<string, string>();
    const fieldRe = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/;
    for (const rawLine of model.body.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("@@")) {
        const attr = /^@@(\w+)/.exec(line)?.[1];
        const args = prismaAttrArgs(line, attr ?? "");
        if (attr === "id") table.primaryKey = prismaList(args);
        else if (attr === "unique") table.uniques.push(prismaList(args));
        else if (attr === "index") {
          const nm = /name:\s*"([^"]*)"/.exec(args ?? "")?.[1];
          table.indexes.push({ name: nm, columns: prismaList(args), unique: false });
        } else if (attr === "map") {
          const mapped = /"([^"]*)"/.exec(args ?? "")?.[1];
          if (mapped) table.name = mapped;
        }
        continue;
      }
      const f = fieldRe.exec(line);
      if (!f) continue;
      const [, fname, ftype, isList, isOptional, attrs] = f;
      if (modelNames.has(ftype)) {
        // Relation field: only the side with `fields:` owns a foreign key.
        const rel = prismaAttrArgs(attrs, "relation");
        if (rel) {
          const fields = prismaList(/fields:\s*(\[[^\]]*\])/.exec(rel)?.[1] ?? null);
          const refs = prismaList(/references:\s*(\[[^\]]*\])/.exec(rel)?.[1] ?? null);
          if (fields.length) {
            const onDelete = /onDelete:\s*(\w+)/.exec(rel)?.[1];
            const onUpdate = /onUpdate:\s*(\w+)/.exec(rel)?.[1];
            const nm = /^\s*"([^"]*)"/.exec(rel)?.[1];
            table.foreignKeys.push({
              name: nm,
              columns: fields,
              refTable: ftype,
              refColumns: refs,
              onDelete: onDelete ? onDelete.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() : undefined,
              onUpdate: onUpdate ? onUpdate.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase() : undefined,
            });
          }
        }
        continue;
      }
      const col: Column = {
        name: fname,
        type: `${ftype}${isList ?? ""}${isOptional ?? ""}`,
        baseType: PRISMA_SCALARS[ftype] ?? (enums.has(ftype) ? "enum" : "other"),
        nullable: !!isOptional,
        autoIncrement: false,
        primaryKey: /(^|\s)@id(\s|$)/.test(attrs),
        unique: /(^|\s)@unique(\s|\(|$)/.test(attrs),
        array: isList ? true : undefined,
      };
      if (enums.has(ftype)) {
        col.enumValues = enums.get(ftype);
        col.enumName = ftype;
      }
      const native = /@db\.(\w+)(?:\(([^)]*)\))?/.exec(attrs);
      if (native) {
        const nt = native[1].toLowerCase();
        const args = (native[2] ?? "").split(",").map((x) => Number(x.trim()));
        if (nt === "varchar" || nt === "char" || nt === "nvarchar") {
          col.baseType = "string";
          if (Number.isFinite(args[0])) col.length = args[0];
        } else if (nt === "text" || nt === "longtext" || nt === "mediumtext") col.baseType = "text";
        else if (nt === "uuid") col.baseType = "uuid";
        else if (nt === "date") col.baseType = "date";
        else if (nt === "datetime") col.baseType = "datetime";
        else if (nt === "decimal" || nt === "money") {
          col.baseType = "decimal";
          if (Number.isFinite(args[0])) col.precision = args[0];
          if (Number.isFinite(args[1])) col.scale = args[1];
        } else if (nt === "jsonb" || nt === "json") col.baseType = "json";
        else if (nt === "bigint") col.baseType = "bigint";
        else if (nt === "smallint" || nt === "integer" || nt === "tinyint") col.baseType = "int";
      }
      const def = prismaAttrArgs(attrs, "default");
      if (def !== null) {
        const d = prismaDefault(def);
        col.autoIncrement = d.autoIncrement;
        col.defaultValue = d.value;
      }
      const mapped = /@map\("([^"]*)"\)/.exec(attrs)?.[1];
      if (mapped) col.name = mapped;
      fieldToCol.set(fname, col.name);
      if (col.baseType === "other") warnings.push(`${model.name}.${fname}: unknown type ${ftype}.`);
      table.columns.push(col);
    }
    // Block attributes and relations name Prisma fields; translate them to column names.
    const toCol = (f: string) => fieldToCol.get(f) ?? f;
    table.primaryKey = table.primaryKey.map(toCol);
    table.uniques = table.uniques.map((u) => u.map(toCol));
    for (const idx of table.indexes) idx.columns = idx.columns.map(toCol);
    for (const fk of table.foreignKeys) fk.columns = fk.columns.map(toCol);
    finalizeTable(table);
    tables.push(table);
    fieldMaps.push(fieldToCol);
  }
  // Map model names in relations to their @@map'd table names and referenced fields to columns.
  const indexByModel = new Map(models.map((mdl, i) => [mdl.name, i]));
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      const targetIndex = indexByModel.get(fk.refTable);
      if (targetIndex !== undefined) {
        fk.refTable = tables[targetIndex].name;
        fk.refColumns = fk.refColumns.map((f) => fieldMaps[targetIndex].get(f) ?? f);
      }
      if (!fk.refColumns.length) fk.refColumns = findTable(tables, fk.refTable)?.primaryKey ?? ["id"];
    }
  }
  return { ok: true, tables, warnings: warnings.slice(0, DDL_LIMITS.maxWarnings) };
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const DDL_SAMPLE = `-- A small blog schema (PostgreSQL flavour)
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(80),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status post_status NOT NULL DEFAULT 'draft',
  price NUMERIC(10, 2),
  metadata JSONB,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (author_id, slug)
);

CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  author_id INTEGER,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_comments_post ON comments (post_id);
`;

export const PRISMA_SAMPLE = `// A small blog schema
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

model User {
  id          Int       @id @default(autoincrement())
  email       String    @unique @db.VarChar(255)
  displayName String?   @db.VarChar(80)
  isAdmin     Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  posts       Post[]
  comments    Comment[]
}

model Post {
  id          BigInt     @id @default(autoincrement())
  authorId    Int
  author      User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  slug        String     @db.VarChar(120)
  title       String
  body        String?
  status      PostStatus @default(DRAFT)
  price       Decimal?   @db.Decimal(10, 2)
  metadata    Json?
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  comments    Comment[]

  @@unique([authorId, slug])
}

model Comment {
  id        BigInt   @id @default(autoincrement())
  postId    BigInt
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  Int?
  author    User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)
  body      String
  createdAt DateTime @default(now())

  @@index([postId])
}
`;
