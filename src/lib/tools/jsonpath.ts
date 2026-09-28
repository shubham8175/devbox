import type { JsonValue } from "@/lib/tools/json";

/**
 * Dependency-free JSONPath subset evaluator (no eval):
 *   $  .key  ['key']  ["key"]  [n]  [-n]  [*]  .*  ['a','b']  [1,3]  [start:end:step]
 *   ..key  ..*  ..[n]     recursive descent
 *   [?(@.key op value)]   filters with == != < <= > >= =~ (regex), && || !, and existence [?(@.key)]
 */

type Selector =
  | { type: "key"; name: string }
  | { type: "wildcard" }
  | { type: "index"; index: number }
  | { type: "union"; keys: Array<string | number> }
  | { type: "slice"; start: number | null; end: number | null; step: number }
  | { type: "filter"; expr: Expr }
  | { type: "recursive"; inner: Selector };

type Expr =
  | { kind: "and"; l: Expr; r: Expr }
  | { kind: "or"; l: Expr; r: Expr }
  | { kind: "not"; e: Expr }
  | { kind: "cmp"; op: string; l: Operand; r: Operand }
  | { kind: "exists"; path: Operand };

type Operand = { kind: "path"; segs: Selector[]; root: boolean } | { kind: "lit"; value: JsonValue };

export interface Match {
  path: string;
  value: JsonValue;
}

export interface JsonPathResult {
  ok: boolean;
  error?: string;
  matches: Match[];
}

class Parser {
  pos = 0;
  constructor(private src: string) {}

  private peek(n = 0) {
    return this.src[this.pos + n];
  }
  private eat(ch: string) {
    if (this.src.startsWith(ch, this.pos)) {
      this.pos += ch.length;
      return true;
    }
    return false;
  }
  private ws() {
    while (/\s/.test(this.peek() ?? "")) this.pos++;
  }
  /** Skip trailing whitespace and return the current position. */
  finish(): number {
    this.ws();
    return this.pos;
  }
  private fail(msg: string): never {
    throw new Error(`${msg} at position ${this.pos}`);
  }

  parsePath(): { root: boolean; segs: Selector[] } {
    this.ws();
    let root: boolean;
    if (this.eat("$")) root = true;
    else if (this.eat("@")) root = false;
    else this.fail('Expected "$" (or "@" inside a filter)');
    const segs: Selector[] = [];
    for (;;) {
      if (this.eat("..")) {
        segs.push({ type: "recursive", inner: this.parseAfterDots() });
      } else if (this.eat(".")) {
        if (this.eat("*")) segs.push({ type: "wildcard" });
        else segs.push({ type: "key", name: this.readIdent() });
      } else if (this.peek() === "[") {
        segs.push(this.parseBracket());
      } else break;
    }
    return { root, segs };
  }

  private parseAfterDots(): Selector {
    if (this.eat("*")) return { type: "wildcard" };
    if (this.peek() === "[") return this.parseBracket();
    return { type: "key", name: this.readIdent() };
  }

  private readIdent(): string {
    const m = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(this.src.slice(this.pos));
    if (!m) this.fail("Expected a property name");
    this.pos += m[0].length;
    return m[0];
  }

  private readString(): string {
    const q = this.peek();
    if (q !== "'" && q !== '"') this.fail("Expected a quoted string");
    this.pos++;
    let out = "";
    while (this.pos < this.src.length && this.peek() !== q) {
      if (this.peek() === "\\") {
        this.pos++;
        const c = this.peek();
        out += c === "n" ? "\n" : c === "t" ? "\t" : c;
        this.pos++;
      } else out += this.src[this.pos++];
    }
    if (!this.eat(q)) this.fail("Unterminated string");
    return out;
  }

  private readNumber(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos));
    if (!m) this.fail("Expected a number");
    this.pos += m[0].length;
    return Number(m[0]);
  }

  private parseBracket(): Selector {
    if (!this.eat("[")) this.fail("Expected [");
    this.ws();
    if (this.eat("*")) {
      this.ws();
      if (!this.eat("]")) this.fail("Expected ]");
      return { type: "wildcard" };
    }
    if (this.eat("?")) {
      this.ws();
      const paren = this.eat("(");
      const expr = this.parseOr();
      this.ws();
      if (paren && !this.eat(")")) this.fail("Expected )");
      this.ws();
      if (!this.eat("]")) this.fail("Expected ]");
      return { type: "filter", expr };
    }
    // slice / index / union
    const items: Array<string | number> = [];
    let isSlice = false;
    let start: number | null = null;
    let end: number | null = null;
    let step = 1;
    if (this.peek() === "'" || this.peek() === '"') {
      items.push(this.readString());
    } else if (this.peek() === ":") {
      isSlice = true;
    } else {
      items.push(this.readNumber());
    }
    this.ws();
    if (this.peek() === ":") {
      isSlice = true;
      start = typeof items[0] === "number" ? (items[0] as number) : null;
      this.eat(":");
      this.ws();
      if (this.peek() !== "]" && this.peek() !== ":") end = this.readNumber();
      this.ws();
      if (this.eat(":")) {
        this.ws();
        if (this.peek() !== "]") step = this.readNumber();
      }
      this.ws();
      if (!this.eat("]")) this.fail("Expected ]");
      if (step === 0) this.fail("Slice step cannot be 0");
      for (const n of [start, end, step]) if (n !== null && !Number.isInteger(n)) this.fail("Slice bounds and step must be whole numbers");
      if (Math.abs(step) > 1_000_000) this.fail("Slice step is too large");
      return { type: "slice", start, end, step };
    }
    while (this.eat(",")) {
      this.ws();
      if (this.peek() === "'" || this.peek() === '"') items.push(this.readString());
      else items.push(this.readNumber());
      this.ws();
    }
    if (!this.eat("]")) this.fail("Expected ]");
    if (isSlice) return { type: "slice", start, end, step };
    if (items.length === 1) return typeof items[0] === "number" ? { type: "index", index: items[0] } : { type: "key", name: items[0] };
    return { type: "union", keys: items };
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    this.ws();
    while (this.eat("||")) {
      const r = this.parseAnd();
      l = { kind: "or", l, r };
      this.ws();
    }
    return l;
  }
  private parseAnd(): Expr {
    let l = this.parseUnary();
    this.ws();
    while (this.eat("&&")) {
      const r = this.parseUnary();
      l = { kind: "and", l, r };
      this.ws();
    }
    return l;
  }
  private parseUnary(): Expr {
    this.ws();
    if (this.eat("!")) return { kind: "not", e: this.parseUnary() };
    if (this.eat("(")) {
      const e = this.parseOr();
      this.ws();
      if (!this.eat(")")) this.fail("Expected )");
      return e;
    }
    const l = this.parseOperand();
    this.ws();
    const ops = ["==", "!=", "<=", ">=", "=~", "<", ">"];
    for (const op of ops) {
      if (this.eat(op)) {
        this.ws();
        const r = this.parseOperand();
        return { kind: "cmp", op, l, r };
      }
    }
    if (l.kind !== "path") this.fail("Expected a comparison");
    return { kind: "exists", path: l };
  }
  private parseOperand(): Operand {
    this.ws();
    const c = this.peek();
    if (c === "@" || c === "$") {
      const p = this.parsePath();
      return { kind: "path", segs: p.segs, root: p.root };
    }
    if (c === "'" || c === '"') return { kind: "lit", value: this.readString() };
    if (c === "/") {
      // regex literal /.../flags
      let i = this.pos + 1;
      while (i < this.src.length && this.src[i] !== "/") i += this.src[i] === "\\" ? 2 : 1;
      if (i >= this.src.length) this.fail("Unterminated regex");
      const body = this.src.slice(this.pos + 1, i);
      i++;
      const fm = /^[gimsuy]*/.exec(this.src.slice(i))!;
      this.pos = i + fm[0].length;
      return { kind: "lit", value: `/${body}/${fm[0]}` };
    }
    if (this.eat("true")) return { kind: "lit", value: true };
    if (this.eat("false")) return { kind: "lit", value: false };
    if (this.eat("null")) return { kind: "lit", value: null };
    if (/[-\d]/.test(c ?? "")) return { kind: "lit", value: this.readNumber() };
    this.fail("Expected a value");
  }
}

function fmtSeg(seg: string | number): string {
  if (typeof seg === "number") return `[${seg}]`;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(seg) ? `.${seg}` : `['${seg.replace(/'/g, "\\'")}']`;
}

const MAX_JSONPATH_MATCHES = 10_000;
class TooManyMatches extends Error {}

function applySelector(sel: Selector, nodes: Match[], root: JsonValue): Match[] {
  const out: Match[] = [];
  const push = (m: Match) => {
    if (out.length >= MAX_JSONPATH_MATCHES) throw new TooManyMatches();
    out.push(m);
  };
  for (const node of nodes) {
    const v = node.value;
    switch (sel.type) {
      case "key":
        if (v && typeof v === "object" && !Array.isArray(v) && Object.hasOwn(v, sel.name)) push({ path: node.path + fmtSeg(sel.name), value: (v as Record<string, JsonValue>)[sel.name] });
        break;
      case "wildcard":
        if (Array.isArray(v)) v.forEach((x, i) => push({ path: node.path + fmtSeg(i), value: x }));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) push({ path: node.path + fmtSeg(k), value: x });
        break;
      case "index":
        if (Array.isArray(v)) {
          const i = sel.index < 0 ? v.length + sel.index : sel.index;
          if (i >= 0 && i < v.length) push({ path: node.path + fmtSeg(i), value: v[i] });
        }
        break;
      case "union":
        for (const k of sel.keys) {
          if (typeof k === "number") {
            if (Array.isArray(v)) {
              const i = k < 0 ? v.length + k : k;
              if (i >= 0 && i < v.length) push({ path: node.path + fmtSeg(i), value: v[i] });
            }
          } else if (v && typeof v === "object" && !Array.isArray(v) && Object.hasOwn(v, k)) push({ path: node.path + fmtSeg(k), value: (v as Record<string, JsonValue>)[k] });
        }
        break;
      case "slice":
        if (Array.isArray(v)) {
          const len = v.length;
          const norm = (n: number | null, def: number) => (n === null ? def : n < 0 ? Math.max(0, len + n) : Math.min(n, len));
          if (sel.step > 0) {
            const s = norm(sel.start, 0);
            const e = norm(sel.end, len);
            for (let i = s; i < e; i += sel.step) push({ path: node.path + fmtSeg(i), value: v[i] });
          } else {
            const s = sel.start === null ? len - 1 : sel.start < 0 ? len + sel.start : Math.min(sel.start, len - 1);
            const e = sel.end === null ? -1 : sel.end < 0 ? len + sel.end : sel.end;
            for (let i = s; i > e; i += sel.step) if (i >= 0 && i < len) push({ path: node.path + fmtSeg(i), value: v[i] });
          }
        }
        break;
      case "filter": {
        const children: Match[] = [];
        if (Array.isArray(v)) v.forEach((x, i) => children.push({ path: node.path + fmtSeg(i), value: x }));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) children.push({ path: node.path + fmtSeg(k), value: x });
        for (const c of children) if (evalExpr(sel.expr, c.value, root)) push(c);
        break;
      }
      case "recursive": {
        const all: Match[] = [];
        const walk = (m: Match) => {
          all.push(m);
          if (Array.isArray(m.value)) m.value.forEach((x, i) => walk({ path: m.path + fmtSeg(i), value: x }));
          else if (m.value && typeof m.value === "object") for (const [k, x] of Object.entries(m.value)) walk({ path: m.path + fmtSeg(k), value: x });
        };
        walk(node);
        for (const m of applySelector(sel.inner, all, root)) push(m);
        break;
      }
    }
  }
  return out;
}

function evalOperand(op: Operand, current: JsonValue, root: JsonValue): { present: boolean; value: JsonValue | undefined } {
  if (op.kind === "lit") return { present: true, value: op.value };
  const start: Match = { path: op.root ? "$" : "@", value: op.root ? root : current };
  let nodes = [start];
  for (const s of op.segs) nodes = applySelector(s, nodes, root);
  if (!nodes.length) return { present: false, value: undefined };
  return { present: true, value: nodes[0].value };
}

function evalExpr(e: Expr, current: JsonValue, root: JsonValue): boolean {
  switch (e.kind) {
    case "and":
      return evalExpr(e.l, current, root) && evalExpr(e.r, current, root);
    case "or":
      return evalExpr(e.l, current, root) || evalExpr(e.r, current, root);
    case "not":
      return !evalExpr(e.e, current, root);
    case "exists": {
      // JS-style truthiness: a missing key, null, false, 0 and "" are all falsy.
      const r = evalOperand(e.path, current, root);
      return r.present && !!r.value;
    }
    case "cmp": {
      const l = evalOperand(e.l, current, root);
      const r = evalOperand(e.r, current, root);
      if (!l.present || !r.present) return e.op === "!=" && l.present !== r.present;
      const a = l.value;
      const b = r.value;
      switch (e.op) {
        case "==":
          return JSON.stringify(a) === JSON.stringify(b);
        case "!=":
          return JSON.stringify(a) !== JSON.stringify(b);
        case "=~": {
          if (typeof a !== "string" || typeof b !== "string") return false;
          const m = /^\/(.*)\/([gimsuy]*)$/.exec(b);
          if (!m || m[1].length > 2000) return false;
          try {
            return new RegExp(m[1], m[2].replace(/g/g, "")).test(a);
          } catch {
            return false;
          }
        }
        default: {
          if (typeof a === "number" && typeof b === "number") return e.op === "<" ? a < b : e.op === "<=" ? a <= b : e.op === ">" ? a > b : a >= b;
          if (typeof a === "string" && typeof b === "string") return e.op === "<" ? a < b : e.op === "<=" ? a <= b : e.op === ">" ? a > b : a >= b;
          return false;
        }
      }
    }
  }
}

export function queryJsonPath(root: JsonValue, expression: string): JsonPathResult {
  const src = expression.trim();
  if (!src) return { ok: false, error: "Enter a JSONPath expression, e.g. $.users[*].name", matches: [] };
  let parsed: { root: boolean; segs: Selector[] };
  try {
    const p = new Parser(src);
    parsed = p.parsePath();
    const end = p.finish();
    if (end < src.length) throw new Error(`Unexpected "${src[end]}" at position ${end}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid expression.", matches: [] };
  }
  if (!parsed.root) return { ok: false, error: 'Expressions must start with "$".', matches: [] };
  let nodes: Match[] = [{ path: "$", value: root }];
  try {
    for (const seg of parsed.segs) {
      nodes = applySelector(seg, nodes, root);
      if (nodes.length > MAX_JSONPATH_MATCHES) return { ok: false, error: `Too many matches (over ${MAX_JSONPATH_MATCHES.toLocaleString()}). Narrow the expression.`, matches: [] };
    }
  } catch (e) {
    if (e instanceof TooManyMatches) return { ok: false, error: `Too many matches (over ${MAX_JSONPATH_MATCHES.toLocaleString()}). Narrow the expression.`, matches: [] };
    if (e instanceof RangeError) return { ok: false, error: "The document is nested too deeply for this expression.", matches: [] };
    return { ok: false, error: e instanceof Error ? e.message : "Query failed.", matches: [] };
  }
  return { ok: true, matches: nodes };
}

export const JSONPATH_EXAMPLES: Array<{ expr: string; label: string }> = [
  { expr: "$.users[*].name", label: "All user names" },
  { expr: "$.users[0]", label: "First user" },
  { expr: "$.users[-1].email", label: "Last user's email" },
  { expr: "$..id", label: "Every id, anywhere" },
  { expr: "$.users[?(@.age > 30)]", label: "Users older than 30" },
  { expr: "$.users[?(@.active && @.role == 'admin')].name", label: "Active admins" },
  { expr: "$.users[?(@.email =~ /example\\.com$/)]", label: "Regex on email" },
  { expr: "$.users[0:2]", label: "First two users" },
  { expr: "$.users[*]['name','role']", label: "Pick two keys" },
  { expr: "$.users[?(@.nickname)]", label: "Users that have a nickname" },
];

export const JSONPATH_SAMPLE = `{
  "users": [
    { "id": 1, "name": "Ada", "email": "ada@example.com", "age": 36, "role": "admin", "active": true, "nickname": "Countess" },
    { "id": 2, "name": "Grace", "email": "grace@navy.mil", "age": 45, "role": "dev", "active": true },
    { "id": 3, "name": "Linus", "email": "linus@example.com", "age": 28, "role": "admin", "active": false }
  ],
  "meta": { "id": "req_1", "total": 3 }
}`;
