/**
 * Relaxed Mongo-shell syntax → strict JSON. Handles unquoted keys, single
 * quotes, trailing commas, comments, and wrappers such as ObjectId("…"),
 * ISODate("…"), NumberLong(…), NumberInt(…), NumberDecimal("…"), Date("…"),
 * RegExp literals and undefined. Wrappers are preserved as Extended-JSON-style
 * objects so nothing is silently lost.
 */

export interface MongoNormalizeResult {
  ok: boolean;
  /** Strict JSON text */
  json: string;
  /** Pretty-printed shell-style output (unquoted simple keys, wrappers restored) */
  shell: string;
  error?: string;
  position?: number;
  kind: "find" | "aggregate" | "document" | "unknown";
  collection?: string;
}

type Tok = { t: "punct" | "str" | "num" | "ident" | "regex"; v: string; pos: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if ("{}[]:,()".includes(c)) {
      out.push({ t: "punct", v: c, pos: i });
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < n) {
          const e = src[j + 1];
          s += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e === "u" ? (() => { const h = src.slice(j + 2, j + 6); j += 4; return String.fromCharCode(parseInt(h, 16)); })() : e;
          j += 2;
          continue;
        }
        s += src[j++];
      }
      if (j >= n) throw Object.assign(new Error("Unterminated string"), { pos: i });
      out.push({ t: "str", v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (c === "/") {
      // regex literal (only valid in value position; we accept it greedily)
      let j = i + 1;
      while (j < n && src[j] !== "/") j += src[j] === "\\" ? 2 : 1;
      if (j >= n) throw Object.assign(new Error("Unterminated regular expression"), { pos: i });
      j++;
      const fm = /^[gimsuy]*/.exec(src.slice(j))!;
      out.push({ t: "regex", v: src.slice(i, j + fm[0].length), pos: i });
      i = j + fm[0].length;
      continue;
    }
    const num = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (num && (c !== "-" || /\d|\./.test(src[i + 1] ?? ""))) {
      out.push({ t: "num", v: num[0], pos: i });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_$][A-Za-z0-9_$.]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: "ident", v: id[0], pos: i });
      i += id[0].length;
      continue;
    }
    throw Object.assign(new Error(`Unexpected character "${c}"`), { pos: i });
  }
  return out;
}

type V = null | boolean | number | string | V[] | { [k: string]: V } | { __wrap: string; args: V[] };

class P {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw Object.assign(new Error("Unexpected end of input"), { pos: -1 });
    return t;
  }
  expect(v: string) {
    const t = this.next();
    if (t.t !== "punct" || t.v !== v) throw Object.assign(new Error(`Expected "${v}" but found "${t.v}"`), { pos: t.pos });
  }
  value(): V {
    const t = this.next();
    if (t.t === "punct" && t.v === "{") return this.object();
    if (t.t === "punct" && t.v === "[") return this.array();
    if (t.t === "str") return t.v;
    if (t.t === "num") return Number(t.v);
    if (t.t === "regex") return { __wrap: "RegExp", args: [t.v] };
    if (t.t === "ident") {
      if (t.v === "true") return true;
      if (t.v === "false") return false;
      if (t.v === "null" || t.v === "undefined") return null;
      if (t.v === "new") return this.value(); // new Date(...) / new ObjectId(...)
      const p = this.peek();
      if (p && p.t === "punct" && p.v === "(") {
        this.next();
        const args: V[] = [];
        while (!(this.peek()?.t === "punct" && this.peek()?.v === ")")) {
          args.push(this.value());
          if (this.peek()?.t === "punct" && this.peek()?.v === ",") this.next();
        }
        this.expect(")");
        return { __wrap: t.v, args };
      }
      throw Object.assign(new Error(`Unexpected identifier "${t.v}" (strings must be quoted)`), { pos: t.pos });
    }
    throw Object.assign(new Error(`Unexpected "${t.v}"`), { pos: t.pos });
  }
  object(): V {
    const o: { [k: string]: V } = {};
    for (;;) {
      const t = this.peek();
      if (!t) throw Object.assign(new Error("Unterminated object"), { pos: -1 });
      if (t.t === "punct" && t.v === "}") {
        this.next();
        return o;
      }
      const k = this.next();
      let key: string;
      if (k.t === "str" || k.t === "ident") key = k.v;
      else if (k.t === "num") key = k.v;
      else throw Object.assign(new Error(`Expected a key but found "${k.v}"`), { pos: k.pos });
      this.expect(":");
      o[key] = this.value();
      const sep = this.peek();
      if (sep?.t === "punct" && sep.v === ",") this.next();
      else if (!(sep?.t === "punct" && sep.v === "}")) throw Object.assign(new Error(`Expected "," or "}" after value for "${key}"`), { pos: sep?.pos ?? -1 });
    }
  }
  array(): V {
    const a: V[] = [];
    for (;;) {
      const t = this.peek();
      if (!t) throw Object.assign(new Error("Unterminated array"), { pos: -1 });
      if (t.t === "punct" && t.v === "]") {
        this.next();
        return a;
      }
      a.push(this.value());
      const sep = this.peek();
      if (sep?.t === "punct" && sep.v === ",") this.next();
      else if (!(sep?.t === "punct" && sep.v === "]")) throw Object.assign(new Error('Expected "," or "]" in array'), { pos: sep?.pos ?? -1 });
    }
  }
}

function isWrap(v: V): v is { __wrap: string; args: V[] } {
  return !!v && typeof v === "object" && !Array.isArray(v) && "__wrap" in v;
}

/** Convert wrappers to MongoDB Extended JSON so the output is strict JSON. */
function toStrict(v: V): unknown {
  if (isWrap(v)) {
    const a = v.args[0];
    switch (v.__wrap) {
      case "ObjectId":
      case "ObjectID":
        return { $oid: a };
      case "ISODate":
      case "Date":
        return { $date: a ?? new Date(0).toISOString() };
      case "NumberLong":
        return { $numberLong: String(a) };
      case "NumberInt":
        return { $numberInt: String(a) };
      case "NumberDecimal":
        return { $numberDecimal: String(a) };
      case "RegExp": {
        const m = /^\/(.*)\/([a-z]*)$/.exec(String(a));
        return { $regularExpression: { pattern: m ? m[1] : String(a), options: m ? m[2] : "" } };
      }
      case "UUID":
      case "BinData":
        return { $uuid: a };
      case "Timestamp":
        return { $timestamp: { t: v.args[0], i: v.args[1] ?? 0 } };
      default:
        return { [`$${v.__wrap}`]: v.args.length === 1 ? toStrict(v.args[0]) : v.args.map(toStrict) };
    }
  }
  if (Array.isArray(v)) return v.map(toStrict);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toStrict(x)]));
  return v;
}

const SIMPLE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Pretty shell-style output: unquoted simple keys, wrappers restored. */
function toShell(v: V, depth = 0): string {
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (isWrap(v)) {
    if (v.__wrap === "RegExp") return String(v.args[0]);
    return `${v.__wrap}(${v.args.map((a) => toShell(a, depth)).join(", ")})`;
  }
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    const simple = v.every((x) => x === null || typeof x !== "object") && v.length <= 8;
    if (simple) return `[${v.map((x) => toShell(x)).join(", ")}]`;
    return `[\n${v.map((x) => padIn + toShell(x, depth + 1)).join(",\n")}\n${pad}]`;
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v);
    if (!entries.length) return "{}";
    const body = entries.map(([k, x]) => `${padIn}${SIMPLE_KEY.test(k) ? k : JSON.stringify(k)}: ${toShell(x, depth + 1)}`);
    return `{\n${body.join(",\n")}\n${pad}}`;
  }
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

function normalizeMongoUnsafe(src: string): MongoNormalizeResult {
  const text = src.trim();
  if (!text) return { ok: false, json: "", shell: "", error: "Paste a query, filter document or aggregation pipeline.", kind: "unknown" };

  let kind: MongoNormalizeResult["kind"] = "document";
  let collection: string | undefined;
  let body = text;
  // db.collection.find({...}, {...}) / db.getCollection("x").aggregate([...])
  const m = /^db\.(?:getCollection\(\s*["'`]([^"'`]+)["'`]\s*\)|([A-Za-z0-9_$.-]+))\.(find|findOne|aggregate|countDocuments|deleteMany|deleteOne|updateOne|updateMany|insertOne|insertMany|distinct)\s*\(([\s\S]*)\)\s*;?$/.exec(text);
  if (m) {
    collection = m[1] ?? m[2];
    const method = m[3];
    kind = method === "aggregate" ? "aggregate" : method === "find" || method === "findOne" ? "find" : "document";
    body = `[${m[4]}]`; // parse the argument list as an array
  }

  let value: V;
  try {
    const toks = tokenize(body);
    const p = new P(toks);
    value = p.value();
    if (p.peek()) throw Object.assign(new Error(`Unexpected "${p.peek()!.v}" after the document`), { pos: p.peek()!.pos });
  } catch (e) {
    const err = e as Error & { pos?: number };
    return { ok: false, json: "", shell: "", error: err.message ?? "Could not parse.", position: err.pos, kind };
  }

  if (!m) {
    if (Array.isArray(value) && value.length && value.every((s) => s && typeof s === "object" && !Array.isArray(s) && !isWrap(s) && Object.keys(s).some((k) => k.startsWith("$")))) kind = "aggregate";
  }

  const strict = JSON.stringify(toStrict(value), null, 2);
  let shell: string;
  if (m) {
    const args = value as V[];
    const argText = args.map((a) => toShell(a)).join(", ");
    const coll = collection && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(collection) ? `db.${collection}` : `db.getCollection(${JSON.stringify(collection)})`;
    shell = `${coll}.${m[3]}(${argText})`;
  } else if (kind === "aggregate") {
    shell = `db.collection.aggregate(${toShell(value)})`;
  } else {
    shell = `db.collection.find(${toShell(value)})`;
  }
  return { ok: true, json: strict, shell, kind, collection };
}

export const MONGO_EXAMPLES: Array<{ label: string; code: string }> = [
  {
    label: "find",
    code: `db.orders.find({ status: 'paid', total: { $gte: 100 }, createdAt: { $gt: ISODate("2026-01-01") } }, { _id: 0, total: 1 })`,
  },
  {
    label: "aggregate",
    code: `db.orders.aggregate([
  { $match: { status: "paid" } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
])`,
  },
  { label: "$match", code: `{ $match: { _id: ObjectId("507f1f77bcf86cd799439011"), tags: { $in: ['a', 'b'] } } }` },
  { label: "$group", code: `{ $group: { _id: { year: { $year: "$createdAt" } }, revenue: { $sum: "$amount" }, avg: { $avg: "$amount" } } }` },
  {
    label: "$lookup",
    code: `{ $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } }, { $unwind: "$user" }`,
  },
  { label: "$project", code: `{ $project: { _id: 0, name: 1, email: { $toLower: "$email" }, fullName: { $concat: ["$first", " ", "$last"] } } }` },
];

/** Wraps the formatter so pathological input (e.g. thousands of nested arrays) reports an error instead of crashing. */
export function normalizeMongo(...args: Parameters<typeof normalizeMongoUnsafe>): ReturnType<typeof normalizeMongoUnsafe> {
  try {
    return normalizeMongoUnsafe(...args);
  } catch (e) {
    const message = e instanceof RangeError ? "Input is nested too deeply to format in the browser." : e instanceof Error ? e.message : "Could not format.";
    return { ok: false, json: "", shell: "", error: message, kind: "find" };
  }
}
