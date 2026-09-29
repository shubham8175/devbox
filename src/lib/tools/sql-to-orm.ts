import type { Column, ForeignKey, Table } from "@/lib/tools/ddl";
import { findTable } from "@/lib/tools/ddl";

export type OrmTarget = "prisma" | "drizzle" | "typeorm" | "mongoose" | "typescript";
export type OrmDialect = "postgresql" | "mysql";
export type OrmNaming = "preserve" | "camel";

export interface OrmOptions {
  dialect: OrmDialect;
  naming: OrmNaming;
}

export const ORM_TARGETS: Array<{ id: OrmTarget; label: string; filename: string }> = [
  { id: "prisma", label: "Prisma", filename: "schema.prisma" },
  { id: "drizzle", label: "Drizzle", filename: "schema.ts" },
  { id: "typeorm", label: "TypeORM", filename: "entities.ts" },
  { id: "mongoose", label: "Mongoose", filename: "models.ts" },
  { id: "typescript", label: "TypeScript types", filename: "types.ts" },
];

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

export function camelCase(s: string): string {
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return "_";
  const out = parts.map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join("");
  return /^[0-9]/.test(out) ? `_${out}` : out;
}

export function pascalCase(s: string): string {
  const c = camelCase(s);
  return c[0].toUpperCase() + c.slice(1);
}

export function singular(s: string): string {
  if (/(ss|us|is)$/i.test(s) || s.length < 4) return s;
  if (/ies$/i.test(s)) return s.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.slice(0, -2);
  if (/s$/i.test(s)) return s.slice(0, -1);
  return s;
}

export function plural(s: string): string {
  if (/s$/i.test(s)) return s;
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(s)) return s + "es";
  return s + "s";
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function modelName(table: Table, naming: OrmNaming): string {
  return naming === "camel" ? singular(pascalCase(table.name)) : pascalCase(table.name);
}

function fieldName(col: string, naming: OrmNaming): string {
  return naming === "camel" ? camelCase(col) : col;
}

function tsKey(name: string): string {
  return IDENT.test(name) ? name : JSON.stringify(name);
}

function isCreatedAt(col: Column): boolean {
  return /^(created_?at|creation_?date|created)$/i.test(col.name) && isTemporal(col);
}

function isUpdatedAt(col: Column): boolean {
  return /^(updated_?at|modified_?at|updated)$/i.test(col.name) && isTemporal(col);
}

function isTemporal(col: Column): boolean {
  return col.baseType === "timestamp" || col.baseType === "datetime" || col.baseType === "date";
}

function hasTz(col: Column): boolean {
  return /tz|with time zone/i.test(col.type);
}

type DefaultKind = { kind: "now" } | { kind: "uuid" } | { kind: "number"; value: string } | { kind: "boolean"; value: string } | { kind: "string"; value: string } | { kind: "null" } | { kind: "raw"; value: string };

function classifyDefault(col: Column): DefaultKind | null {
  if (col.defaultValue === undefined) return null;
  const raw = col.defaultValue.trim();
  const v = raw.replace(/::[\w\s"\[\]().]+$/, "").trim();
  const lower = v.toLowerCase();
  if (/^(now\(\)|current_timestamp(\(\d*\))?|localtimestamp|current_date|getdate\(\)|sysdate\(\)|transaction_timestamp\(\))$/.test(lower)) return { kind: "now" };
  if (/^(gen_random_uuid\(\)|uuid_generate_v4\(\)|uuid\(\)|newid\(\))$/.test(lower)) return { kind: "uuid" };
  if (lower === "null") return { kind: "null" };
  if (/^[-+]?\d+(\.\d+)?$/.test(v)) return { kind: "number", value: v };
  if (lower === "true" || lower === "false") return { kind: "boolean", value: lower };
  const str = /^'((?:[^']|'')*)'$/.exec(v);
  if (str) {
    const s = str[1].replace(/''/g, "'");
    if (col.baseType === "boolean" && /^[01]$/.test(s)) return { kind: "boolean", value: s === "1" ? "true" : "false" };
    if ((col.baseType === "int" || col.baseType === "bigint" || col.baseType === "float" || col.baseType === "decimal") && /^[-+]?\d+(\.\d+)?$/.test(s)) return { kind: "number", value: s };
    return { kind: "string", value: s };
  }
  return { kind: "raw", value: raw };
}

interface EnumDef {
  name: string;
  values: string[];
}

/** Collect distinct enums, naming unnamed inline enums after table + column. */
function collectEnums(tables: Table[], naming: OrmNaming): { enums: EnumDef[]; enumFor: (t: Table, c: Column) => string } {
  const enums: EnumDef[] = [];
  const key = (t: Table, c: Column) => `${t.name}.${c.name}`;
  const byKey = new Map<string, string>();
  const byName = new Map<string, EnumDef>();
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.baseType !== "enum") continue;
      let name = c.enumName ? pascalCase(c.enumName) : `${modelName(t, naming)}${pascalCase(c.name)}`;
      const values = c.enumValues ?? [];
      const existing = byName.get(name);
      if (existing && existing.values.join("\0") !== values.join("\0")) name = `${name}${pascalCase(t.name)}`;
      if (!byName.has(name)) {
        const def = { name, values };
        byName.set(name, def);
        enums.push(def);
      }
      byKey.set(key(t, c), name);
    }
  }
  return { enums, enumFor: (t, c) => byKey.get(key(t, c)) ?? "String" };
}

interface Relation {
  fk: ForeignKey;
  source: Table;
  target: Table;
  /** Field on the source model pointing at the target */
  field: string;
  /** Back-reference field on the target model */
  backField: string;
  /** Explicit relation name when the pair is ambiguous */
  name?: string;
  nullable: boolean;
}

function relationsFor(tables: Table[], naming: OrmNaming): { relations: Relation[]; warnings: string[] } {
  const relations: Relation[] = [];
  const warnings: string[] = [];
  const usedFieldNames = new Map<Table, Set<string>>();
  const used = (t: Table) => {
    let s = usedFieldNames.get(t);
    if (!s) {
      s = new Set(t.columns.map((c) => fieldName(c.name, naming)));
      usedFieldNames.set(t, s);
    }
    return s;
  };
  const uniqueName = (t: Table, base: string, fallback: string) => {
    const set = used(t);
    let name = base;
    if (set.has(name)) name = fallback;
    let i = 2;
    while (set.has(name)) name = `${fallback}${i++}`;
    set.add(name);
    return name;
  };
  for (const source of tables) {
    for (const fk of source.foreignKeys) {
      const target = findTable(tables, fk.refTable);
      if (!target) {
        warnings.push(`${source.name}.${fk.columns.join(", ")} references ${fk.refTable}, which is not in the input; relation skipped.`);
        continue;
      }
      const base = fk.columns.length === 1 ? fk.columns[0].replace(/(_?id|Id|ID)$/, "") : "";
      const fieldBase = base && base !== fk.columns[0] ? fieldName(base, naming) : camelCase(singular(target.name));
      const field = uniqueName(source, fieldBase, `${fieldBase}Ref`);
      const backBase = source === target ? `${camelCase(plural(source.name))}As${pascalCase(field)}` : camelCase(plural(source.name));
      const backField = uniqueName(target, backBase, `${camelCase(plural(source.name))}As${pascalCase(field)}`);
      const siblings = source.foreignKeys.filter((f) => f.refTable.toLowerCase() === fk.refTable.toLowerCase());
      const name = siblings.length > 1 || source === target ? `${modelName(source, naming)}_${fk.columns.join("_")}` : undefined;
      const nullable = fk.columns.every((c) => source.columns.find((x) => x.name === c)?.nullable !== false);
      relations.push({ fk, source, target, field, backField, name, nullable });
    }
  }
  return { relations, warnings };
}

/** Referenced tables first (Kahn's algorithm, stable on ties; cycles fall back to input order). */
export function dependencyOrder(tables: Table[]): Table[] {
  const remaining = [...tables];
  const done: Table[] = [];
  const doneSet = new Set<string>();
  while (remaining.length) {
    const idx = remaining.findIndex((t) =>
      t.foreignKeys.every((fk) => {
        const ref = fk.refTable.toLowerCase();
        return ref === t.name.toLowerCase() || doneSet.has(ref) || !findTable(tables, fk.refTable);
      }),
    );
    const next = remaining.splice(idx < 0 ? 0 : idx, 1)[0];
    done.push(next);
    doneSet.add(next.name.toLowerCase());
  }
  return done;
}

function onDeleteWord(action: string | undefined, style: "prisma" | "drizzle" | "typeorm"): string | undefined {
  if (!action) return undefined;
  const a = action.toUpperCase();
  if (style === "prisma") return { CASCADE: "Cascade", "SET NULL": "SetNull", "SET DEFAULT": "SetDefault", RESTRICT: "Restrict", "NO ACTION": "NoAction" }[a];
  if (style === "drizzle") return { CASCADE: "cascade", "SET NULL": "set null", "SET DEFAULT": "set default", RESTRICT: "restrict", "NO ACTION": "no action" }[a];
  return { CASCADE: "CASCADE", "SET NULL": "SET NULL", "SET DEFAULT": "SET DEFAULT", RESTRICT: "RESTRICT", "NO ACTION": "NO ACTION" }[a];
}

function align(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const r of rows) r.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]))).join(" ").trimEnd());
}

// ---------------------------------------------------------------------------
// Prisma
// ---------------------------------------------------------------------------

function prismaIdent(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || "_";
}

function genPrisma(tables: Table[], opts: OrmOptions, rels: Relation[]): string {
  const { enums, enumFor } = collectEnums(tables, opts.naming);
  const out: string[] = [
    "generator client {",
    '  provider = "prisma-client-js"',
    "}",
    "",
    "datasource db {",
    `  provider = "${opts.dialect}"`,
    '  url      = env("DATABASE_URL")',
    "}",
    "",
  ];
  for (const e of enums) {
    out.push(`enum ${e.name} {`);
    for (const v of e.values) {
      const id = prismaIdent(v);
      out.push(`  ${id}${id !== v ? ` @map(${JSON.stringify(v)})` : ""}`);
    }
    out.push("}", "");
  }
  for (const t of tables) {
    const model = modelName(t, opts.naming);
    const rows: string[][] = [];
    const fname = (c: string) => prismaIdent(fieldName(c, opts.naming));
    for (const c of t.columns) {
      let type: string;
      const attrs: string[] = [];
      switch (c.baseType) {
        case "string":
          type = "String";
          if (c.length) attrs.push(`@db.VarChar(${c.length})`);
          break;
        case "text":
          type = "String";
          attrs.push("@db.Text");
          break;
        case "int":
          type = "Int";
          break;
        case "bigint":
          type = "BigInt";
          break;
        case "float":
          type = "Float";
          break;
        case "decimal":
          type = "Decimal";
          if (c.precision) attrs.push(`@db.Decimal(${c.precision}, ${c.scale ?? 0})`);
          break;
        case "boolean":
          type = "Boolean";
          break;
        case "date":
          type = "DateTime";
          attrs.push("@db.Date");
          break;
        case "datetime":
          type = "DateTime";
          break;
        case "timestamp":
          type = "DateTime";
          if (opts.dialect === "postgresql" && hasTz(c)) attrs.push(`@db.Timestamptz(${c.precision ?? 6})`);
          break;
        case "json":
          type = "Json";
          break;
        case "uuid":
          type = "String";
          attrs.push(opts.dialect === "postgresql" ? "@db.Uuid" : "@db.VarChar(36)");
          break;
        case "bytes":
          type = "Bytes";
          break;
        case "enum":
          type = enumFor(t, c);
          break;
        default:
          type = `Unsupported(${JSON.stringify(c.type)})`;
      }
      const unsupported = c.baseType === "other";
      const pre: string[] = [];
      if (c.primaryKey && t.primaryKey.length === 1) pre.push("@id");
      if (c.unique && !c.primaryKey) pre.push("@unique");
      if (!unsupported) {
        const d = classifyDefault(c);
        const updatedAt = isUpdatedAt(c);
        if (c.autoIncrement) pre.push("@default(autoincrement())");
        else if (d?.kind === "now") {
          if (!updatedAt) pre.push("@default(now())");
        }
        else if (d?.kind === "uuid") pre.push("@default(uuid())");
        else if (d?.kind === "number" || d?.kind === "boolean") pre.push(`@default(${d.value})`);
        else if (d?.kind === "string") pre.push(c.baseType === "enum" && c.enumValues?.includes(d.value) ? `@default(${prismaIdent(d.value)})` : `@default(${JSON.stringify(d.value)})`);
        else if (d?.kind === "raw") pre.push(`@default(dbgenerated(${JSON.stringify(d.value)}))`);
        if (updatedAt) pre.push("@updatedAt");
      }
      const name = fname(c.name);
      if (name !== c.name) pre.push(`@map(${JSON.stringify(c.name)})`);
      rows.push([name, `${type}${c.array ? "[]" : ""}${c.nullable && !c.primaryKey ? "?" : ""}`, [...pre, ...attrs].join(" ")]);
    }
    for (const r of rels.filter((x) => x.source === t)) {
      const target = modelName(r.target, opts.naming);
      const args = [r.name ? JSON.stringify(r.name) : "", `fields: [${r.fk.columns.map(fname).join(", ")}]`, `references: [${r.fk.refColumns.map(fname).join(", ")}]`];
      const od = onDeleteWord(r.fk.onDelete, "prisma");
      if (od) args.push(`onDelete: ${od}`);
      rows.push([r.field, `${target}${r.nullable ? "?" : ""}`, `@relation(${args.filter(Boolean).join(", ")})`]);
    }
    for (const r of rels.filter((x) => x.target === t)) {
      rows.push([r.backField, `${modelName(r.source, opts.naming)}[]`, r.name ? `@relation(${JSON.stringify(r.name)})` : ""]);
    }
    out.push(`model ${model} {`, ...align(rows).map((l) => `  ${l}`));
    const block: string[] = [];
    if (t.primaryKey.length > 1) block.push(`@@id([${t.primaryKey.map(fname).join(", ")}])`);
    for (const u of t.uniques) if (u.length > 1) block.push(`@@unique([${u.map(fname).join(", ")}])`);
    for (const i of t.indexes) if (!i.unique) block.push(`@@index([${i.columns.map(fname).join(", ")}])`);
    if (model !== t.name) block.push(`@@map(${JSON.stringify(t.name)})`);
    if (block.length) out.push("", ...block.map((l) => `  ${l}`));
    out.push("}", "");
  }
  return out.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Drizzle
// ---------------------------------------------------------------------------

function genDrizzle(tables: Table[], opts: OrmOptions, rels: Relation[]): string {
  const pg = opts.dialect === "postgresql";
  const core = pg ? "drizzle-orm/pg-core" : "drizzle-orm/mysql-core";
  const imports = new Set<string>([pg ? "pgTable" : "mysqlTable"]);
  const rootImports = new Set<string>();
  const { enums, enumFor } = collectEnums(tables, opts.naming);
  const enumConst = (name: string) => `${camelCase(name)}Enum`;
  const body: string[] = [];
  let needsBytea = false;

  if (pg) {
    for (const e of enums) {
      imports.add("pgEnum");
      body.push(`export const ${enumConst(e.name)} = pgEnum(${JSON.stringify(e.name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase())}, [${e.values.map((v) => JSON.stringify(v)).join(", ")}]);`);
    }
    if (enums.length) body.push("");
  }

  const tableConst = (t: Table) => camelCase(t.name);
  const col = (name: string) => {
    imports.add(name);
    return name;
  };
  const q = JSON.stringify;

  for (const t of tables) {
    const lines: string[] = [];
    for (const c of t.columns) {
      let b: string;
      const singlePk = c.primaryKey && t.primaryKey.length === 1;
      switch (c.baseType) {
        case "int":
          b = pg ? (c.autoIncrement ? `${col("serial")}(${q(c.name)})` : `${col("integer")}(${q(c.name)})`) : `${col("int")}(${q(c.name)})`;
          break;
        case "bigint":
          b = pg && c.autoIncrement ? `${col("bigserial")}(${q(c.name)}, { mode: "number" })` : `${col("bigint")}(${q(c.name)}, { mode: "number" })`;
          break;
        case "string":
          b = `${col("varchar")}(${q(c.name)}${c.length || !pg ? `, { length: ${c.length ?? 255} }` : ""})`;
          break;
        case "text":
          b = `${col("text")}(${q(c.name)})`;
          break;
        case "float":
          b = pg ? (/real|float4/i.test(c.type) ? `${col("real")}(${q(c.name)})` : `${col("doublePrecision")}(${q(c.name)})`) : /^float/i.test(c.type) ? `${col("float")}(${q(c.name)})` : `${col("double")}(${q(c.name)})`;
          break;
        case "decimal": {
          const fn = col(pg ? "numeric" : "decimal");
          b = c.precision ? `${fn}(${q(c.name)}, { precision: ${c.precision}, scale: ${c.scale ?? 0} })` : `${fn}(${q(c.name)})`;
          break;
        }
        case "boolean":
          b = `${col("boolean")}(${q(c.name)})`;
          break;
        case "date":
          b = `${col("date")}(${q(c.name)})`;
          break;
        case "datetime":
          b = pg ? `${col("timestamp")}(${q(c.name)})` : `${col("datetime")}(${q(c.name)})`;
          break;
        case "timestamp":
          b = pg && hasTz(c) ? `${col("timestamp")}(${q(c.name)}, { withTimezone: true })` : `${col("timestamp")}(${q(c.name)})`;
          break;
        case "json":
          b = pg && /jsonb/i.test(c.type) ? `${col("jsonb")}(${q(c.name)})` : `${col("json")}(${q(c.name)})`;
          break;
        case "uuid":
          b = pg ? `${col("uuid")}(${q(c.name)})` : `${col("varchar")}(${q(c.name)}, { length: 36 })`;
          break;
        case "bytes":
          if (pg) {
            needsBytea = true;
            b = `bytea(${q(c.name)})`;
          } else b = `${col("varbinary")}(${q(c.name)}, { length: ${c.length ?? 255} })`;
          break;
        case "enum":
          b = pg ? `${enumConst(enumFor(t, c))}(${q(c.name)})` : `${col("mysqlEnum")}(${q(c.name)}, [${(c.enumValues ?? []).map((v) => q(v)).join(", ")}])`;
          break;
        default:
          b = `${col("text")}(${q(c.name)}) /* ${c.type} */`;
      }
      if (c.array && pg) b += ".array()";
      if (!pg && c.autoIncrement) b += ".autoincrement()";
      if (singlePk) b += ".primaryKey()";
      else if (!c.nullable) b += ".notNull()";
      if (c.unique && !singlePk) b += ".unique()";
      const d = classifyDefault(c);
      if (!c.autoIncrement && d) {
        if (d.kind === "now") b += ".defaultNow()";
        else if (d.kind === "uuid" && pg) b += ".defaultRandom()";
        else if (d.kind === "number" || d.kind === "boolean") b += `.default(${d.value})`;
        else if (d.kind === "string") b += `.default(${q(d.value)})`;
        else if (d.kind === "raw" || d.kind === "uuid") {
          rootImports.add("sql");
          const expr = d.kind === "raw" ? d.value : "gen_random_uuid()";
          b += `.default(sql\`${expr.replace(/`/g, "\\`")}\`)`;
        }
      }
      const fk = t.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === c.name);
      if (fk && findTable(tables, fk.refTable)) {
        const target = findTable(tables, fk.refTable)!;
        const od = onDeleteWord(fk.onDelete, "drizzle");
        b += `.references(() => ${tableConst(target)}.${fieldName(fk.refColumns[0] ?? "id", opts.naming)}${od ? `, { onDelete: ${q(od)} }` : ""})`;
      }
      lines.push(`  ${tsKey(fieldName(c.name, opts.naming))}: ${b},`);
    }
    const extras: string[] = [];
    const ref = (col: string) => `t.${fieldName(col, opts.naming)}`;
    if (t.primaryKey.length > 1) extras.push(`${col("primaryKey")}({ columns: [${t.primaryKey.map(ref).join(", ")}] })`);
    for (const u of t.uniques) if (u.length > 1) extras.push(`${col("unique")}().on(${u.map(ref).join(", ")})`);
    for (const i of t.indexes) if (!i.unique) extras.push(`${col("index")}(${q(i.name ?? `${t.name}_${i.columns.join("_")}_idx`)}).on(${i.columns.map(ref).join(", ")})`);
    for (const fk of t.foreignKeys) {
      const target = findTable(tables, fk.refTable);
      if (fk.columns.length > 1 && target) extras.push(`${col("foreignKey")}({ columns: [${fk.columns.map(ref).join(", ")}], foreignColumns: [${fk.refColumns.map((c) => `${tableConst(target)}.${fieldName(c, opts.naming)}`).join(", ")}] })`);
    }
    body.push(`export const ${tableConst(t)} = ${pg ? "pgTable" : "mysqlTable"}(${q(t.name)}, {`, ...lines, extras.length ? `}, (t) => [${extras.join(", ")}]);` : "});", "");
  }

  const relByTable = new Map<Table, string[]>();
  for (const r of rels) {
    const src = relByTable.get(r.source) ?? [];
    const rn = r.name ? `, relationName: ${q(r.name)}` : "";
    src.push(`  ${r.field}: one(${tableConst(r.target)}, { fields: [${r.fk.columns.map((c) => `${tableConst(r.source)}.${fieldName(c, opts.naming)}`).join(", ")}], references: [${r.fk.refColumns.map((c) => `${tableConst(r.target)}.${fieldName(c, opts.naming)}`).join(", ")}]${rn} }),`);
    relByTable.set(r.source, src);
    const tgt = relByTable.get(r.target) ?? [];
    tgt.push(`  ${r.backField}: many(${tableConst(r.source)}${r.name ? `, { relationName: ${q(r.name)} }` : ""}),`);
    relByTable.set(r.target, tgt);
  }
  for (const t of tables) {
    const lines = relByTable.get(t);
    if (!lines) continue;
    rootImports.add("relations");
    body.push(`export const ${tableConst(t)}Relations = relations(${tableConst(t)}, ({ one, many }) => ({`, ...lines, "}));", "");
  }

  const header: string[] = [`import { ${[...imports].sort().join(", ")} } from "${core}";`];
  if (rootImports.size) header.push(`import { ${[...rootImports].sort().join(", ")} } from "drizzle-orm";`);
  if (needsBytea) {
    imports.add("customType");
    header[0] = `import { ${[...imports].sort().join(", ")} } from "${core}";`;
    header.push("", 'const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });');
  }
  return [...header, "", ...body].join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// TypeORM
// ---------------------------------------------------------------------------

function tsType(c: Column, style: "typeorm" | "plain", enumName?: string): string {
  let t: string;
  switch (c.baseType) {
    case "int":
    case "float":
      t = "number";
      break;
    case "bigint":
      t = style === "typeorm" ? "string" : "bigint";
      break;
    case "decimal":
      t = "string";
      break;
    case "boolean":
      t = "boolean";
      break;
    case "date":
    case "datetime":
    case "timestamp":
      t = "Date";
      break;
    case "json":
      t = "unknown";
      break;
    case "bytes":
      t = style === "typeorm" ? "Buffer" : "Uint8Array";
      break;
    case "enum":
      t = enumName ?? (c.enumValues ?? []).map((v) => JSON.stringify(v)).join(" | ") ?? "string";
      break;
    default:
      t = "string";
  }
  if (c.array) t = t.includes("|") ? `(${t})[]` : `${t}[]`;
  return t;
}

function genTypeorm(tables: Table[], opts: OrmOptions, rels: Relation[]): string {
  const pg = opts.dialect === "postgresql";
  const imports = new Set<string>(["Entity", "Column"]);
  const { enumFor, enums } = collectEnums(tables, opts.naming);
  const body: string[] = [];
  const q = JSON.stringify;
  for (const e of enums) body.push(`export type ${e.name} = ${e.values.map((v) => q(v)).join(" | ")};`);
  if (enums.length) body.push("");
  const dbType = (c: Column): string => {
    switch (c.baseType) {
      case "int":
        return pg ? "integer" : "int";
      case "bigint":
        return "bigint";
      case "string":
        return "varchar";
      case "text":
        return "text";
      case "float":
        return pg ? "double precision" : "double";
      case "decimal":
        return pg ? "numeric" : "decimal";
      case "boolean":
        return "boolean";
      case "date":
        return "date";
      case "datetime":
        return pg ? "timestamp" : "datetime";
      case "timestamp":
        return pg && hasTz(c) ? "timestamptz" : "timestamp";
      case "json":
        return pg && /jsonb/i.test(c.type) ? "jsonb" : "json";
      case "uuid":
        return pg ? "uuid" : "varchar";
      case "bytes":
        return pg ? "bytea" : "blob";
      case "enum":
        return "enum";
      default:
        return c.type.toLowerCase() || "text";
    }
  };
  for (const t of tables) {
    const cls = modelName(t, opts.naming);
    const decorators = [`@Entity({ name: ${q(t.name)} })`];
    for (const u of t.uniques) {
      if (u.length > 1) {
        imports.add("Unique");
        decorators.push(`@Unique([${u.map((c) => q(fieldName(c, opts.naming))).join(", ")}])`);
      }
    }
    for (const i of t.indexes) {
      if (!i.unique) {
        imports.add("Index");
        decorators.push(`@Index([${i.columns.map((c) => q(fieldName(c, opts.naming))).join(", ")}])`);
      }
    }
    const members: string[] = [];
    for (const c of t.columns) {
      const name = fieldName(c.name, opts.naming);
      const opt: string[] = [];
      if (name !== c.name) opt.push(`name: ${q(c.name)}`);
      const type = tsType(c, "typeorm", c.baseType === "enum" ? enumFor(t, c) : undefined);
      let deco: string;
      if (c.primaryKey && c.autoIncrement) {
        imports.add("PrimaryGeneratedColumn");
        if (c.baseType === "bigint") opt.push('type: "bigint"');
        deco = `@PrimaryGeneratedColumn(${opt.length ? `{ ${opt.join(", ")} }` : ""})`;
      } else if (c.primaryKey && c.baseType === "uuid" && classifyDefault(c)?.kind === "uuid") {
        imports.add("PrimaryGeneratedColumn");
        deco = `@PrimaryGeneratedColumn("uuid"${opt.length ? `, { ${opt.join(", ")} }` : ""})`;
      } else if (c.primaryKey) {
        imports.add("PrimaryColumn");
        opt.unshift(`type: ${q(dbType(c))}`);
        if (c.length) opt.push(`length: ${c.length}`);
        deco = `@PrimaryColumn({ ${opt.join(", ")} })`;
      } else if (isCreatedAt(c) || isUpdatedAt(c)) {
        const d = isCreatedAt(c) ? "CreateDateColumn" : "UpdateDateColumn";
        imports.add(d);
        opt.push(`type: ${q(dbType(c))}`);
        deco = `@${d}({ ${opt.join(", ")} })`;
      } else {
        opt.unshift(`type: ${q(dbType(c))}`);
        if (c.baseType === "enum") opt.push(`enum: [${(c.enumValues ?? []).map((v) => q(v)).join(", ")}]`);
        if (c.length || (c.baseType === "uuid" && !pg)) opt.push(`length: ${c.length ?? 36}`);
        if (c.precision && (c.baseType === "decimal" || c.baseType === "float")) opt.push(`precision: ${c.precision}, scale: ${c.scale ?? 0}`);
        if (c.nullable) opt.push("nullable: true");
        if (c.unique) opt.push("unique: true");
        if (c.array && pg) opt.push("array: true");
        const d = classifyDefault(c);
        if (d?.kind === "now") opt.push(`default: () => ${q(pg ? "now()" : "CURRENT_TIMESTAMP")}`);
        else if (d?.kind === "number" || d?.kind === "boolean") opt.push(`default: ${d.value}`);
        else if (d?.kind === "string") opt.push(`default: ${q(d.value)}`);
        else if (d?.kind === "raw" || d?.kind === "uuid") opt.push(`default: () => ${q(d.kind === "raw" ? d.value : "gen_random_uuid()")}`);
        deco = `@Column({ ${opt.join(", ")} })`;
      }
      members.push(`  ${deco}`, `  ${tsKey(name)}!: ${type}${c.nullable && !c.primaryKey && type !== "unknown" ? " | null" : ""};`, "");
    }
    for (const r of rels.filter((x) => x.source === t)) {
      imports.add("ManyToOne").add("JoinColumn");
      const target = modelName(r.target, opts.naming);
      const ropts = [`nullable: ${r.nullable}`];
      const od = onDeleteWord(r.fk.onDelete, "typeorm");
      if (od) ropts.push(`onDelete: ${q(od)}`);
      const join = r.fk.columns.length === 1 ? `{ name: ${q(r.fk.columns[0])}, referencedColumnName: ${q(fieldName(r.fk.refColumns[0] ?? "id", opts.naming))} }` : `[${r.fk.columns.map((c, i) => `{ name: ${q(c)}, referencedColumnName: ${q(fieldName(r.fk.refColumns[i] ?? "id", opts.naming))} }`).join(", ")}]`;
      members.push(`  @ManyToOne(() => ${target}, (${camelCase(target)}) => ${camelCase(target)}.${r.backField}, { ${ropts.join(", ")} })`, `  @JoinColumn(${join})`, `  ${r.field}!: ${target}${r.nullable ? " | null" : ""};`, "");
    }
    for (const r of rels.filter((x) => x.target === t)) {
      imports.add("OneToMany");
      const source = modelName(r.source, opts.naming);
      members.push(`  @OneToMany(() => ${source}, (${camelCase(source)}) => ${camelCase(source)}.${r.field})`, `  ${r.backField}!: ${source}[];`, "");
    }
    body.push(...decorators, `export class ${cls} {`, ...members.slice(0, -1), "}", "");
  }
  return [`import { ${[...imports].sort().join(", ")} } from "typeorm";`, "", ...body].join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Mongoose
// ---------------------------------------------------------------------------

function genMongoose(tables: Table[], opts: OrmOptions): string {
  const q = JSON.stringify;
  const body: string[] = ['import { Schema, model, type InferSchemaType } from "mongoose";', ""];
  for (const t of tables) {
    const name = modelName(t, opts.naming);
    const schemaConst = `${camelCase(name)}Schema`;
    const created = t.columns.find(isCreatedAt);
    const updated = t.columns.find(isUpdatedAt);
    const lines: string[] = [];
    for (const c of t.columns) {
      if (c === created || c === updated) continue;
      if (c.primaryKey && t.primaryKey.length === 1 && c.autoIncrement) {
        lines.push(`    // ${c.name}: MongoDB provides _id instead of an auto-increment key`);
        continue;
      }
      const fk = t.foreignKeys.find((f) => f.columns.length === 1 && f.columns[0] === c.name);
      const target = fk ? findTable(tables, fk.refTable) : undefined;
      const parts: string[] = [];
      let type: string;
      if (target) type = "Schema.Types.ObjectId";
      else {
        switch (c.baseType) {
          case "int":
          case "float":
            type = "Number";
            break;
          case "bigint":
            type = "BigInt";
            break;
          case "decimal":
            type = "Schema.Types.Decimal128";
            break;
          case "boolean":
            type = "Boolean";
            break;
          case "date":
          case "datetime":
          case "timestamp":
            type = "Date";
            break;
          case "json":
            type = "Schema.Types.Mixed";
            break;
          case "bytes":
            type = "Buffer";
            break;
          default:
            type = "String";
        }
      }
      parts.push(`type: ${c.array ? `[${type}]` : type}`);
      if (target) parts.push(`ref: ${q(modelName(target, opts.naming))}`);
      if (!c.nullable) parts.push("required: true");
      if (c.unique || (c.primaryKey && !c.autoIncrement)) parts.push("unique: true");
      if (c.baseType === "enum" && c.enumValues) parts.push(`enum: [${c.enumValues.map((v) => q(v)).join(", ")}]`);
      if (c.length && (c.baseType === "string" || c.baseType === "text")) parts.push(`maxlength: ${c.length}`);
      const d = classifyDefault(c);
      if (d?.kind === "now") parts.push("default: Date.now");
      else if (d?.kind === "number" || d?.kind === "boolean") parts.push(`default: ${d.value}`);
      else if (d?.kind === "string") parts.push(`default: ${q(d.value)}`);
      lines.push(`    ${tsKey(fieldName(c.name, opts.naming))}: { ${parts.join(", ")} },`);
    }
    let tsOpt = "";
    if (created || updated) {
      const ca = created ? fieldName(created.name, opts.naming) : "createdAt";
      const ua = updated ? fieldName(updated.name, opts.naming) : "updatedAt";
      tsOpt = ca === "createdAt" && ua === "updatedAt" ? "timestamps: true" : `timestamps: { createdAt: ${created ? q(ca) : "false"}, updatedAt: ${updated ? q(ua) : "false"} }`;
    }
    body.push(`const ${schemaConst} = new Schema(`, "  {", ...lines, "  },", `  { ${tsOpt ? `${tsOpt}, ` : ""}collection: ${q(t.name)} },`, ");");
    for (const u of t.uniques) if (u.length > 1) body.push(`${schemaConst}.index({ ${u.map((c) => `${tsKey(fieldName(c, opts.naming))}: 1`).join(", ")} }, { unique: true });`);
    for (const i of t.indexes) if (!i.unique) body.push(`${schemaConst}.index({ ${i.columns.map((c) => `${tsKey(fieldName(c, opts.naming))}: 1`).join(", ")} });`);
    body.push(`export type ${name} = InferSchemaType<typeof ${schemaConst}>;`, `export const ${name}Model = model<${name}>(${q(name)}, ${schemaConst});`, "");
  }
  return body.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Plain TypeScript
// ---------------------------------------------------------------------------

function genTypescript(tables: Table[], opts: OrmOptions): string {
  const { enums, enumFor } = collectEnums(tables, opts.naming);
  const out: string[] = [];
  for (const e of enums) out.push(`export type ${e.name} = ${e.values.map((v) => JSON.stringify(v)).join(" | ")};`);
  if (enums.length) out.push("");
  for (const t of tables) {
    const name = modelName(t, opts.naming);
    out.push(`/** Table: ${t.schema ? `${t.schema}.` : ""}${t.name} */`, `export interface ${name} {`);
    const rows = t.columns.map((c) => {
      const notes: string[] = [];
      if (c.primaryKey) notes.push("PK");
      const fk = t.foreignKeys.find((f) => f.columns.includes(c.name));
      if (fk) notes.push(`FK → ${fk.refTable}.${fk.refColumns[fk.columns.indexOf(c.name)] ?? fk.refColumns[0] ?? "id"}`);
      if (c.unique && !c.primaryKey) notes.push("unique");
      const type = tsType(c, "plain", c.baseType === "enum" ? enumFor(t, c) : undefined);
      return [`  ${tsKey(fieldName(c.name, opts.naming))}: ${type}${c.nullable && !c.primaryKey && type !== "unknown" ? " | null" : ""};`, notes.length ? `// ${notes.join(", ")}` : ""];
    });
    out.push(...align(rows), "}", "");
  }
  return out.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------

export interface OrmOutput {
  code: string;
  filename: string;
  warnings: string[];
}

/** Generate schema code for one ORM target from the normalized table model. */
export function generateOrm(tables: Table[], target: OrmTarget, opts: OrmOptions): OrmOutput {
  const ordered = dependencyOrder(tables);
  const { relations, warnings } = relationsFor(ordered, opts.naming);
  const filename = ORM_TARGETS.find((t) => t.id === target)?.filename ?? "schema.txt";
  let code: string;
  switch (target) {
    case "prisma":
      code = genPrisma(ordered, opts, relations);
      break;
    case "drizzle":
      code = genDrizzle(ordered, opts, relations);
      break;
    case "typeorm":
      code = genTypeorm(ordered, opts, relations);
      break;
    case "mongoose":
      code = genMongoose(ordered, opts);
      break;
    default:
      code = genTypescript(ordered, opts);
  }
  for (const t of tables) for (const c of t.columns) if (c.baseType === "other") warnings.push(`${t.name}.${c.name}: type ${c.type} has no direct mapping; check the generated field.`);
  return { code, filename, warnings };
}
