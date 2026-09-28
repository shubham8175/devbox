import type { JsonValue } from "@/lib/tools/json";

/** Internal shape model inferred from JSON. */
type Shape =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "unknown" }
  | { kind: "array"; item: Shape }
  | { kind: "object"; fields: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: "union"; members: Shape[] };

function shapeOf(v: JsonValue): Shape {
  if (v === null) return { kind: "null" };
  if (Array.isArray(v)) {
    if (v.length === 0) return { kind: "array", item: { kind: "unknown" } };
    let item: Shape | null = null;
    for (const el of v) item = item ? merge(item, shapeOf(el)) : shapeOf(el);
    return { kind: "array", item: item ?? { kind: "unknown" } };
  }
  if (typeof v === "object") {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    for (const [k, val] of Object.entries(v)) fields.set(k, { shape: shapeOf(val), optional: false });
    return { kind: "object", fields };
  }
  if (typeof v === "string") return { kind: "string" };
  if (typeof v === "number") return { kind: "number" };
  return { kind: "boolean" };
}

function sameKind(a: Shape, b: Shape): boolean {
  return a.kind === b.kind;
}

/** Merge two shapes: objects field-wise (missing keys become optional), arrays item-wise, otherwise union. */
function merge(a: Shape, b: Shape): Shape {
  if (a.kind === "unknown") return b;
  if (b.kind === "unknown") return a;
  if (a.kind === "object" && b.kind === "object") {
    const fields = new Map<string, { shape: Shape; optional: boolean }>();
    const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);
    for (const k of keys) {
      const fa = a.fields.get(k);
      const fb = b.fields.get(k);
      if (fa && fb) fields.set(k, { shape: merge(fa.shape, fb.shape), optional: fa.optional || fb.optional });
      else fields.set(k, { shape: (fa ?? fb)!.shape, optional: true });
    }
    return { kind: "object", fields };
  }
  if (a.kind === "array" && b.kind === "array") return { kind: "array", item: merge(a.item, b.item) };
  const members: Shape[] = [];
  const push = (s: Shape) => {
    const list = s.kind === "union" ? s.members : [s];
    for (const m of list) {
      const existing = members.find((x) => sameKind(x, m));
      if (!existing) members.push(m);
      else if (m.kind === "object" || m.kind === "array") members[members.indexOf(existing)] = merge(existing, m);
    }
  };
  push(a);
  push(b);
  return members.length === 1 ? members[0] : { kind: "union", members };
}

export function toPascalCase(s: string): string {
  const words = s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return /^[0-9]/.test(out) ? `_${out}` : out || "Item";
}

function singular(name: string): string {
  if (/ies$/i.test(name)) return name.replace(/ies$/i, "y");
  if (/(ss|us|is)$/i.test(name)) return name;
  if (/s$/i.test(name) && name.length > 3) return name.slice(0, -1);
  return name;
}

const RESERVED = new Set(["string", "number", "boolean", "object", "any", "unknown", "null", "undefined", "never", "void", "symbol", "function"]);

function safeKey(k: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
}

interface Named {
  name: string;
  shape: Extract<Shape, { kind: "object" }>;
}

/** Walk shapes, assigning names to object shapes and collecting them in dependency order. */
class Namer {
  named: Named[] = [];
  private used = new Set<string>();

  constructor(private rootName: string) {}

  /** Reserve a name so nested types never collide with it. */
  reserve(name: string) {
    this.used.add(name);
  }

  private unique(base: string): string {
    let name = RESERVED.has(base.toLowerCase()) ? `${base}Type` : base;
    let i = 2;
    while (this.used.has(name)) name = `${base}${i++}`;
    this.used.add(name);
    return name;
  }

  /** Returns the TS type expression for a shape, registering named objects as needed. */
  ts(shape: Shape, hint: string): string {
    switch (shape.kind) {
      case "string":
      case "number":
      case "boolean":
      case "null":
      case "unknown":
        return shape.kind;
      case "array": {
        const inner = this.ts(shape.item, singular(hint));
        return shape.item.kind === "union" ? `(${inner})[]` : `${inner}[]`;
      }
      case "union":
        return shape.members.map((m) => this.ts(m, hint)).join(" | ");
      case "object": {
        const name = this.unique(toPascalCase(hint));
        // Register placeholder first to keep dependency order: children before parents
        const entry: Named = { name, shape };
        this.named.push(entry);
        return name;
      }
    }
  }

  register(shape: Shape): string {
    if (shape.kind !== "object") {
      this.reserve(this.rootName);
      return this.ts(shape, shape.kind === "array" ? `${this.rootName}Item` : this.rootName);
    }
    return this.ts(shape, this.rootName);
  }
}

function fieldsToTs(n: Named, namer: Namer, indent = "  "): string {
  const lines: string[] = [];
  for (const [k, f] of n.shape.fields) {
    const t = namer.ts(f.shape, k);
    lines.push(`${indent}${safeKey(k)}${f.optional ? "?" : ""}: ${t};`);
  }
  return lines.join("\n");
}

export interface GeneratedTypes {
  interfaces: string;
  types: string;
  zod: string;
  /** Names in generation order, root last */
  names: string[];
}

export function generateTypes(value: JsonValue, rootName: string): GeneratedTypes {
  const root = toPascalCase(rootName || "Root") || "Root";
  const shape = shapeOf(value);

  // ---- interfaces
  const iNamer = new Namer(root);
  const rootExpr = iNamer.register(shape);
  const blocks: string[] = [];
  // Resolve bodies (this may register more named objects as it goes)
  const bodies = new Map<string, string>();
  for (let i = 0; i < iNamer.named.length; i++) {
    const n = iNamer.named[i];
    bodies.set(n.name, fieldsToTs(n, iNamer));
  }
  // Emit children first (reverse registration order puts nested types before parents)
  const ordered = [...iNamer.named].reverse();
  for (const n of ordered) blocks.push(`export interface ${n.name} {\n${bodies.get(n.name)}\n}`);
  if (shape.kind !== "object") blocks.push(`export type ${root} = ${rootExpr};`);
  const interfaces = blocks.join("\n\n");

  // ---- type aliases
  const tNamer = new Namer(root);
  const tRoot = tNamer.register(shape);
  const tBodies = new Map<string, string>();
  for (let i = 0; i < tNamer.named.length; i++) tBodies.set(tNamer.named[i].name, fieldsToTs(tNamer.named[i], tNamer));
  const tBlocks = [...tNamer.named].reverse().map((n) => `export type ${n.name} = {\n${tBodies.get(n.name)}\n};`);
  if (shape.kind !== "object") tBlocks.push(`export type ${root} = ${tRoot};`);
  const types = tBlocks.join("\n\n");

  // ---- zod
  const zNamer = new Namer(root);
  if (shape.kind !== "object") zNamer.reserve(root);
  const zExpr = (s: Shape, hint: string): string => {
    switch (s.kind) {
      case "string":
        return "z.string()";
      case "number":
        return "z.number()";
      case "boolean":
        return "z.boolean()";
      case "null":
        return "z.null()";
      case "unknown":
        return "z.unknown()";
      case "array":
        return `z.array(${zExpr(s.item, singular(hint))})`;
      case "union": {
        const nonNull = s.members.filter((m) => m.kind !== "null");
        const hasNull = nonNull.length !== s.members.length;
        const inner = nonNull.length === 1 ? zExpr(nonNull[0], hint) : `z.union([${nonNull.map((m) => zExpr(m, hint)).join(", ")}])`;
        return hasNull ? `${inner}.nullable()` : inner;
      }
      case "object": {
        const name = zNamer.ts(s, hint); // registers & names
        return `${schemaName(name)}`;
      }
    }
  };
  const schemaName = (n: string) => `${n[0].toLowerCase()}${n.slice(1)}Schema`;
  const zRoot = zExpr(shape, shape.kind === "array" ? `${root}Item` : root);
  const zBodies = new Map<string, string>();
  for (let i = 0; i < zNamer.named.length; i++) {
    const n = zNamer.named[i];
    const lines: string[] = [];
    for (const [k, f] of n.shape.fields) {
      let e = zExpr(f.shape, k);
      if (f.optional) e += ".optional()";
      lines.push(`  ${safeKey(k)}: ${e},`);
    }
    zBodies.set(n.name, lines.join("\n"));
  }
  const zBlocks = ['import { z } from "zod";', ""];
  for (const n of [...zNamer.named].reverse()) {
    zBlocks.push(`export const ${schemaName(n.name)} = z.object({\n${zBodies.get(n.name)}\n});`);
    zBlocks.push(`export type ${n.name} = z.infer<typeof ${schemaName(n.name)}>;`, "");
  }
  if (shape.kind !== "object") {
    zBlocks.push(`export const ${schemaName(root)} = ${zRoot};`);
    zBlocks.push(`export type ${root} = z.infer<typeof ${schemaName(root)}>;`);
  }
  const zod = zBlocks.join("\n").trim();

  return { interfaces, types, zod, names: iNamer.named.map((n) => n.name) };
}

export const JSON_TO_TYPES_SAMPLE = `{
  "id": 1,
  "name": "John",
  "active": true,
  "tags": ["developer"],
  "address": { "city": "Pune", "zip": "411001" },
  "orders": [
    { "id": "o1", "total": 99.5, "coupon": null },
    { "id": "o2", "total": 12 }
  ]
}`;
