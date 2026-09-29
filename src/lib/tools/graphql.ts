/**
 * GraphQL formatter: minification and structural analysis are implemented
 * with a small tokenizer here (pure, testable); pretty-printing is delegated
 * to Prettier's GraphQL plugin, which the UI lazy-loads and passes in.
 */

/** Minimal surface of prettier/standalone + the GraphQL plugin, already bound to `parser: "graphql"`. */
export interface PrettierModule {
  format: (src: string) => Promise<string>;
}

export const GRAPHQL_MAX_INPUT = 500_000;

export type TokenKind = "punct" | "name" | "number" | "string" | "block" | "comment" | "comma" | "spread";

export interface GqlToken {
  kind: TokenKind;
  text: string;
  line: number;
}

const PUNCT = new Set(["{", "}", "(", ")", "[", "]", ":", "=", "@", "!", "|", "&", "$"]);

/** Tokenize a GraphQL document. Throws on unterminated strings / block strings. */
export function tokenizeGraphql(src: string): GqlToken[] {
  if (src.length > GRAPHQL_MAX_INPUT) throw new Error(`Input is too large (limit ${GRAPHQL_MAX_INPUT / 1000} KB).`);
  const out: GqlToken[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "﻿") {
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ kind: "comma", text: ",", line });
      i++;
      continue;
    }
    if (c === "#") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out.push({ kind: "comment", text: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (src.startsWith('"""', i)) {
      const end = src.indexOf('"""', i + 3);
      let j = end;
      // A block string may contain \""" as an escaped delimiter.
      while (j !== -1 && src[j - 1] === "\\") j = src.indexOf('"""', j + 3);
      if (j === -1) throw new Error(`Unterminated block string starting on line ${line}.`);
      const text = src.slice(i, j + 3);
      out.push({ kind: "block", text, line });
      line += (text.match(/\n/g) ?? []).length;
      i = j + 3;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\") j++;
        if (src[j] === "\n") throw new Error(`Unterminated string on line ${line}.`);
        j++;
      }
      if (j >= n) throw new Error(`Unterminated string on line ${line}.`);
      out.push({ kind: "string", text: src.slice(i, j + 1), line });
      i = j + 1;
      continue;
    }
    if (src.startsWith("...", i)) {
      out.push({ kind: "spread", text: "...", line });
      i += 3;
      continue;
    }
    if (PUNCT.has(c)) {
      out.push({ kind: "punct", text: c, line });
      i++;
      continue;
    }
    if (/[_A-Za-z]/.test(c)) {
      let j = i + 1;
      while (j < n && /[_0-9A-Za-z]/.test(src[j])) j++;
      out.push({ kind: "name", text: src.slice(i, j), line });
      i = j;
      continue;
    }
    if (c === "-" || /[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[0-9.eE+-]/.test(src[j])) j++;
      out.push({ kind: "number", text: src.slice(i, j), line });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character “${c}” on line ${line}.`);
  }
  return out;
}

/** Strip comments, collapse whitespace and drop insignificant commas; strings and block strings are kept intact. */
export function minifyGraphql(src: string): string {
  const tokens = tokenizeGraphql(src).filter((t) => t.kind !== "comment" && t.kind !== "comma");
  let out = "";
  let prev: GqlToken | null = null;
  for (const t of tokens) {
    const wordy = (k: TokenKind) => k === "name" || k === "number" || k === "string" || k === "block";
    // Two adjacent word-like tokens need a separator; punctuation never does, except a name after a spread ("... on" stays valid as "...on").
    if (prev && ((wordy(prev.kind) && wordy(t.kind)) || (prev.kind === "block" && t.kind === "block"))) out += " ";
    out += t.text;
    prev = t;
  }
  return out;
}

export type OperationType = "query" | "mutation" | "subscription";

export interface GqlVariable {
  name: string;
  type: string;
  hasDefault: boolean;
}

export interface GqlOperation {
  type: OperationType;
  name: string;
  variables: GqlVariable[];
  rootFields: string[];
  depth: number;
  fragmentsUsed: string[];
}

export interface GqlFragment {
  name: string;
  on: string;
  fragmentsUsed: string[];
  variablesUsed: string[];
  depth: number;
}

export type SchemaKind = "type" | "input" | "enum" | "interface" | "union" | "scalar" | "schema" | "directive";

export interface GqlSchemaType {
  kind: SchemaKind;
  name: string;
  fieldCount: number;
}

export interface GraphqlAnalysis {
  ok: true;
  kind: "operations" | "schema" | "mixed" | "empty";
  operations: GqlOperation[];
  fragments: GqlFragment[];
  schemaTypes: GqlSchemaType[];
  warnings: string[];
  tokenCount: number;
}

export interface GraphqlError {
  ok: false;
  error: string;
}

const DEEP_NESTING = 8;
const SCHEMA_KEYWORDS = new Set<string>(["type", "input", "enum", "interface", "union", "scalar", "schema", "directive", "extend"]);

class Parser {
  i = 0;
  constructor(readonly t: GqlToken[]) {}
  peek(offset = 0): GqlToken | undefined {
    return this.t[this.i + offset];
  }
  is(text: string, offset = 0): boolean {
    return this.peek(offset)?.text === text;
  }
  next(): GqlToken | undefined {
    return this.t[this.i++];
  }
  /** Skip a balanced (...), [...] or {...} group starting at the current opening token. */
  skipGroup(): void {
    const open = this.next()?.text;
    const close = open === "(" ? ")" : open === "[" ? "]" : "}";
    let depth = 1;
    while (this.i < this.t.length && depth > 0) {
      const tok = this.next();
      if (!tok) break;
      if (tok.text === open) depth++;
      else if (tok.text === close) depth--;
    }
  }
  /** Parse a type reference like [String!]! into its text. */
  typeRef(): string {
    let s = "";
    if (this.is("[")) {
      this.next();
      s = `[${this.typeRef()}]`;
      if (this.is("]")) this.next();
    } else {
      const tok = this.next();
      s = tok?.text ?? "";
    }
    if (this.is("!")) {
      this.next();
      s += "!";
    }
    return s;
  }
  skipDirectives(): void {
    while (this.is("@")) {
      this.next();
      this.next();
      if (this.is("(")) this.skipGroup();
    }
  }
}

interface SelectionInfo {
  fields: string[];
  depth: number;
  spreads: string[];
  variablesUsed: Set<string>;
}

function parseSelectionSet(p: Parser, depth: number, acc: SelectionInfo, guard: { steps: number }): number {
  // Returns the max depth reached; expects the current token to be "{".
  if (!p.is("{")) return depth;
  p.next();
  let max = depth + 1;
  while (p.i < p.t.length && !p.is("}")) {
    if (++guard.steps > 200_000) throw new Error("Document is too complex to analyse.");
    const tok = p.peek();
    if (!tok) break;
    if (tok.kind === "spread") {
      p.next();
      const spreadName = p.is("on") || p.is("{") || p.is("@") ? null : p.next();
      if (p.is("on")) {
        p.next();
        p.next();
      }
      if (spreadName) acc.spreads.push(spreadName.text);
      const dirStart = p.i;
      p.skipDirectives();
      for (let k = dirStart; k < p.i; k++) if (p.t[k].text === "$" && p.t[k + 1]?.kind === "name") acc.variablesUsed.add(p.t[k + 1].text);
      if (!spreadName) max = Math.max(max, parseSelectionSet(p, depth + 1, acc, guard));
      continue;
    }
    if (tok.kind !== "name") {
      p.next();
      continue;
    }
    let field = p.next()?.text ?? "";
    if (p.is(":")) {
      p.next();
      field = p.next()?.text ?? field;
    }
    if (depth === 0) acc.fields.push(field);
    const argStart = p.i;
    if (p.is("(")) p.skipGroup();
    p.skipDirectives();
    // Variables can appear in field arguments and in directive arguments (@include(if: $flag)).
    for (let k = argStart; k < p.i; k++) if (p.t[k].text === "$" && p.t[k + 1]?.kind === "name") acc.variablesUsed.add(p.t[k + 1].text);
    if (p.is("{")) max = Math.max(max, parseSelectionSet(p, depth + 1, acc, guard));
  }
  if (p.is("}")) p.next();
  return max;
}

function countFields(p: Parser): number {
  if (!p.is("{")) return 0;
  const start = p.i;
  p.skipGroup();
  let count = 0;
  let depth = 0;
  for (let k = start + 1; k < p.i - 1; k++) {
    const tok = p.t[k];
    if (tok.text === "(" || tok.text === "[" || tok.text === "{") depth++;
    else if (tok.text === ")" || tok.text === "]" || tok.text === "}") depth--;
    else if (depth === 0 && tok.kind === "name") {
      const nxt = p.t[k + 1];
      const prevTok = p.t[k - 1];
      // Enum values stand alone; fields are followed by ":" or "(". Skip directive names and argument names.
      if (prevTok?.text === "@" || prevTok?.text === ":" || prevTok?.text === "=") continue;
      if (!nxt || nxt.text === ":" || nxt.text === "(" || nxt.kind === "name" || nxt.text === "}" || nxt.text === "@" || nxt.kind === "string" || nxt.kind === "block") count++;
    }
  }
  return count;
}

export function analyzeGraphql(src: string): GraphqlAnalysis | GraphqlError {
  let tokens: GqlToken[];
  try {
    tokens = tokenizeGraphql(src).filter((t) => t.kind !== "comment" && t.kind !== "comma");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not tokenize the document." };
  }
  const p = new Parser(tokens);
  const operations: GqlOperation[] = [];
  const fragments: GqlFragment[] = [];
  const schemaTypes: GqlSchemaType[] = [];
  const warnings: string[] = [];
  const opVariablesUsed: Array<Set<string>> = [];
  const guard = { steps: 0 };

  try {
    while (p.i < tokens.length) {
      if (++guard.steps > 200_000) throw new Error("Document is too complex to analyse.");
      const tok = p.peek();
      if (!tok) break;
      if (tok.kind === "block" || tok.kind === "string") {
        p.next(); // description before a schema definition
        continue;
      }
      if (tok.text === "{") {
        const acc: SelectionInfo = { fields: [], depth: 0, spreads: [], variablesUsed: new Set() };
        const depth = parseSelectionSet(p, 0, acc, guard);
        operations.push({ type: "query", name: "", variables: [], rootFields: acc.fields, depth, fragmentsUsed: Array.from(new Set(acc.spreads)) });
        opVariablesUsed.push(acc.variablesUsed);
        continue;
      }
      if (tok.text === "query" || tok.text === "mutation" || tok.text === "subscription") {
        p.next();
        const name = p.peek()?.kind === "name" ? (p.next()?.text ?? "") : "";
        const variables: GqlVariable[] = [];
        if (p.is("(")) {
          p.next();
          while (p.i < tokens.length && !p.is(")")) {
            if (++guard.steps > 200_000) throw new Error("Document is too complex to analyse.");
            if (p.is("$")) {
              p.next();
              const vname = p.next()?.text ?? "";
              if (p.is(":")) p.next();
              const type = p.typeRef();
              let hasDefault = false;
              if (p.is("=")) {
                p.next();
                hasDefault = true;
                if (p.is("[") || p.is("{")) p.skipGroup();
                else p.next();
              }
              p.skipDirectives();
              variables.push({ name: vname, type, hasDefault });
            } else p.next();
          }
          p.next();
        }
        p.skipDirectives();
        const acc: SelectionInfo = { fields: [], depth: 0, spreads: [], variablesUsed: new Set() };
        const depth = parseSelectionSet(p, 0, acc, guard);
        operations.push({ type: tok.text, name, variables, rootFields: acc.fields, depth, fragmentsUsed: Array.from(new Set(acc.spreads)) });
        opVariablesUsed.push(acc.variablesUsed);
        continue;
      }
      if (tok.text === "fragment") {
        p.next();
        const name = p.next()?.text ?? "";
        if (p.is("on")) p.next();
        const on = p.next()?.text ?? "";
        p.skipDirectives();
        const acc: SelectionInfo = { fields: [], depth: 0, spreads: [], variablesUsed: new Set() };
        const depth = parseSelectionSet(p, 0, acc, guard);
        fragments.push({ name, on, fragmentsUsed: Array.from(new Set(acc.spreads)), variablesUsed: Array.from(acc.variablesUsed), depth });
        continue;
      }
      if (SCHEMA_KEYWORDS.has(tok.text)) {
        p.next();
        let kind = tok.text;
        if (kind === "extend") kind = p.next()?.text ?? "type";
        let name = "";
        if (kind === "schema") name = "schema";
        else if (kind === "directive") {
          if (p.is("@")) p.next();
          name = `@${p.next()?.text ?? ""}`;
          if (p.is("(")) p.skipGroup();
          while (p.i < tokens.length && !p.is("{") && !SCHEMA_KEYWORDS.has(p.peek()?.text ?? "") && !p.is("fragment") && !p.is("query")) p.next();
        } else name = p.next()?.text ?? "";
        // implements A & B, = A | B for unions, directives
        while (p.i < tokens.length && !p.is("{")) {
          const t2 = p.peek();
          if (!t2) break;
          if (t2.kind === "block" || t2.kind === "string" || SCHEMA_KEYWORDS.has(t2.text) || t2.text === "fragment" || t2.text === "query" || t2.text === "mutation" || t2.text === "subscription") break;
          if (t2.text === "(") p.skipGroup();
          else p.next();
        }
        let fieldCount = 0;
        if (kind === "union") {
          const start = p.i;
          let k = start - 1;
          while (k > 0 && tokens[k].text !== "=") k--;
          fieldCount = tokens.slice(k + 1, start).filter((t) => t.kind === "name").length;
        } else fieldCount = countFields(p);
        schemaTypes.push({ kind: kind as SchemaKind, name, fieldCount });
        continue;
      }
      p.next(); // unknown token at top level: skip
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not analyse the document." };
  }

  // Warnings. A variable counts as used when any fragment the operation spreads (transitively) references it.
  const fragmentByName = new Map(fragments.map((f) => [f.name, f]));
  operations.forEach((op, idx) => {
    const used = new Set(opVariablesUsed[idx]);
    const queue = [...op.fragmentsUsed];
    const visited = new Set<string>();
    while (queue.length && visited.size < 1000) {
      const f = fragmentByName.get(queue.pop() ?? "");
      if (!f || visited.has(f.name)) continue;
      visited.add(f.name);
      f.variablesUsed.forEach((v) => used.add(v));
      queue.push(...f.fragmentsUsed);
    }
    for (const v of op.variables) if (!used.has(v.name)) warnings.push(`Variable $${v.name} is declared but never used${op.name ? ` in ${op.name}` : ""}.`);
  });
  const anonymous = operations.filter((o) => !o.name);
  if (anonymous.length && operations.length > 1) warnings.push("Anonymous operation combined with other operations: servers reject documents where an unnamed operation is not the only one.");
  else if (anonymous.length) warnings.push("Anonymous operation: naming it helps servers, logs and tooling identify the request.");
  const seen = new Map<string, number>();
  for (const o of operations) if (o.name) seen.set(o.name, (seen.get(o.name) ?? 0) + 1);
  for (const [n, c] of seen) if (c > 1) warnings.push(`Duplicate operation name ${n} (${c} times).`);
  const fragSeen = new Map<string, number>();
  for (const f of fragments) fragSeen.set(f.name, (fragSeen.get(f.name) ?? 0) + 1);
  for (const [n, c] of fragSeen) if (c > 1) warnings.push(`Duplicate fragment name ${n} (${c} times).`);
  const used = new Set<string>();
  for (const o of operations) o.fragmentsUsed.forEach((f) => used.add(f));
  for (const f of fragments) f.fragmentsUsed.forEach((x) => used.add(x));
  for (const f of fragments) if (!used.has(f.name)) warnings.push(`Unused fragment ${f.name}.`);
  const defined = new Set(fragments.map((f) => f.name));
  for (const f of used) if (!defined.has(f)) warnings.push(`Fragment ${f} is spread but not defined in this document.`);
  for (const o of operations) if (o.depth > DEEP_NESTING) warnings.push(`${o.name || "Anonymous " + o.type} is deeply nested (${o.depth} levels > ${DEEP_NESTING}).`);

  const hasOps = operations.length > 0 || fragments.length > 0;
  const hasSchema = schemaTypes.length > 0;
  return {
    ok: true,
    kind: hasOps && hasSchema ? "mixed" : hasSchema ? "schema" : hasOps ? "operations" : "empty",
    operations,
    fragments,
    schemaTypes,
    warnings,
    tokenCount: tokens.length,
  };
}

/** Pretty-print through the injected Prettier module, mapping errors to a result object. */
export async function formatGraphql(prettier: PrettierModule, src: string): Promise<{ ok: true; output: string } | GraphqlError> {
  if (!src.trim()) return { ok: false, error: "Input is empty." };
  if (src.length > GRAPHQL_MAX_INPUT) return { ok: false, error: `Input is too large (limit ${GRAPHQL_MAX_INPUT / 1000} KB).` };
  try {
    return { ok: true, output: await prettier.format(src) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not format this document.";
    return { ok: false, error: msg.split("\n")[0].replace(/\s*\(\d+:\d+\)\s*$/, (m) => m.trim()) };
  }
}

export const GRAPHQL_SAMPLE = `# Fetch a user with their latest posts
query GetUser($id: ID!, $first: Int = 10, $withEmail: Boolean = false) {
  user(id: $id) { ...UserFields,
    posts(first: $first, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      edges { node { id title tags publishedAt } }
    }
  }
}

fragment UserFields on User {
  id, name
  email @include(if: $withEmail)
  avatar(size: 64) { url width height }
}`;

export const GRAPHQL_SCHEMA_SAMPLE = `"""
A registered account.
"""
type User implements Node {
  id: ID!
  name: String!
  email: String @deprecated(reason: "Use contact.email")
  role: Role!
  posts(first: Int = 10, after: String): PostConnection!
}

interface Node { id: ID! }

enum Role { ADMIN, EDITOR, VIEWER }

input CreateUserInput {
  name: String!
  email: String!
  role: Role = VIEWER
}

union SearchResult = User | Post

type Query {
  user(id: ID!): User
  search(term: String!): [SearchResult!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
}`;
