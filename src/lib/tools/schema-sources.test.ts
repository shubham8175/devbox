import { describe, expect, it } from "vitest";
import { DDL_SAMPLE, parseDdl, type Table } from "@/lib/tools/ddl";
import { generateOrm } from "@/lib/tools/sql-to-orm";
import { buildSchemaGraph, toMermaid } from "@/lib/tools/schema-visualizer";
import {
  DRIZZLE_SAMPLE,
  JSON_DOCS_SAMPLE,
  MONGOOSE_SAMPLE,
  SCHEMA_SOURCES,
  SEQUELIZE_SAMPLE,
  TYPEORM_SAMPLE,
  TYPESCRIPT_SAMPLE,
  detectSchemaSource,
  parseDrizzleSchema,
  parseJsonDocuments,
  parseMongooseSchema,
  parseSchemaSource,
  parseSequelizeModels,
  parseTypeScriptTypes,
  parseTypeormEntities,
} from "@/lib/tools/schema-sources";

function ok(r: ReturnType<typeof parseJsonDocuments>): Table[] {
  if (!r.ok) throw new Error(r.error);
  return r.tables;
}
const col = (t: Table, name: string) => t.columns.find((c) => c.name === name);
const edges = (tables: Table[]) => buildSchemaGraph(tables).edges.map((e) => `${e.from}.${e.fromColumn}->${e.to}.${e.toColumn}`);

describe("parseJsonDocuments", () => {
  it("parses mongosh inserts with shell constructors and infers types, nullability and relations", () => {
    const tables = ok(parseJsonDocuments(JSON_DOCS_SAMPLE));
    expect(tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    const users = tables[0];
    expect(col(users, "_id")).toMatchObject({ primaryKey: true, type: "ObjectId", nullable: false });
    expect(col(users, "email")).toMatchObject({ type: "string", nullable: false });
    expect(col(users, "bio")).toMatchObject({ type: "null", nullable: true });
    expect(col(users, "createdAt")).toMatchObject({ type: "Date", baseType: "datetime" });
    const posts = tables[1];
    expect(col(posts, "tags")).toMatchObject({ type: "string[]", array: true });
    expect(col(posts, "meta")).toMatchObject({ type: "object", baseType: "json" });
    expect(col(posts, "meta.readingTime")).toMatchObject({ type: "int", nullable: true });
    expect(col(posts, "publishedAt")?.nullable).toBe(true);
    expect(col(tables[2], "likes")).toMatchObject({ type: "long", baseType: "bigint" });
    expect(col(tables[2], "user_id")?.nullable).toBe(true);
    expect(edges(tables)).toEqual(["posts.user_id->users._id", "comments.post_id->posts._id", "comments.user_id->users._id"]);
  });

  it("accepts an object keyed by collection with Extended JSON", () => {
    const tables = ok(
      parseJsonDocuments(`{
        "users": [{ "_id": { "$oid": "64f1a2b3c4d5e6f7a8b9c0d1" }, "age": { "$numberLong": "31" }, "joined": { "$date": "2024-01-01T00:00:00Z" } }],
        "devices": [{ "_id": "64f1a2b3c4d5e6f7a8b9c0d9", "user": "64f1a2b3c4d5e6f7a8b9c0d1", "serial": "ABC" }]
      }`),
    );
    expect(tables.map((t) => t.name)).toEqual(["users", "devices"]);
    expect(col(tables[0], "age")).toMatchObject({ type: "long" });
    expect(col(tables[0], "joined")).toMatchObject({ type: "Date" });
    expect(col(tables[1], "user")).toMatchObject({ type: "ObjectId" });
    expect(edges(tables)).toEqual(["devices.user->users._id"]);
  });

  it("treats a bare array or NDJSON as one unnamed collection and warns", () => {
    const r = parseJsonDocuments('{"id": 1, "name": "a"}\n{"id": 2, "name": "b", "extra": true}');
    if (!r.ok) throw new Error(r.error);
    expect(r.tables.map((t) => t.name)).toEqual(["documents"]);
    expect(col(r.tables[0], "extra")?.nullable).toBe(true);
    expect(col(r.tables[0], "name")?.nullable).toBe(false);
    expect(r.warnings[0]).toMatch(/Single collection/);
    const arr = ok(parseJsonDocuments('[{"a": 1}, {"a": 2.5}]'));
    expect(col(arr[0], "a")?.type).toBe("double | int");
  });

  it("detects small string enums across enough documents", () => {
    const docs = Array.from({ length: 8 }, (_, i) => ({ status: i % 2 ? "open" : "closed" }));
    const tables = ok(parseJsonDocuments(JSON.stringify({ tickets: docs })));
    expect(col(tables[0], "status")).toMatchObject({ baseType: "enum", enumValues: ["closed", "open"] });
  });

  it("reports empty or non-document input", () => {
    expect(parseJsonDocuments("   ").ok).toBe(false);
    expect(parseJsonDocuments("just words").ok).toBe(false);
    expect(parseJsonDocuments("[]").ok).toBe(false);
  });
});

describe("parseMongooseSchema", () => {
  it("parses schemas, refs, enums, nested paths, timestamps and indexes", () => {
    const r = parseMongooseSchema(MONGOOSE_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const [users, posts, comments] = r.tables;
    expect(r.tables.map((t) => t.name)).toEqual(["users", "Post", "Comment"]);
    expect(col(users, "_id")).toMatchObject({ primaryKey: true });
    expect(col(users, "email")).toMatchObject({ type: "String", nullable: false, unique: true });
    expect(col(users, "name")?.length).toBe(80);
    expect(col(users, "role")).toMatchObject({ baseType: "enum", enumValues: ["admin", "member"], defaultValue: "'member'" });
    expect(col(users, "address.country")).toMatchObject({ type: "String", defaultValue: "'IN'" });
    expect(col(users, "createdAt")).toMatchObject({ type: "Date" });
    expect(col(posts, "created_at")).toBeDefined();
    expect(col(posts, "updatedAt")).toBeUndefined();
    expect(col(posts, "tags")).toMatchObject({ type: "String[]", array: true });
    expect(col(posts, "author")).toMatchObject({ type: "ObjectId", nullable: false });
    expect(posts.indexes).toEqual([{ columns: ["author", "status"], unique: false }]);
    expect(col(comments, "author")?.nullable).toBe(true);
    expect(edges(r.tables)).toEqual(["Post.author->users._id", "Comment.post->Post._id", "Comment.author->users._id"]);
    expect(r.warnings).toEqual([]);
  });

  it("supports mongoose.Schema, model consts as refs, _id: false and sub-schemas", () => {
    const r = parseMongooseSchema(`
      const addressSchema = new mongoose.Schema({ city: String, zip: { type: String, required: true } }, { _id: false });
      const orgSchema = new mongoose.Schema({ name: String, address: addressSchema, members: [{ type: mongoose.Schema.Types.ObjectId, ref: Person }] });
      const Person = mongoose.model("Person", new mongoose.Schema({ name: String }));
      module.exports = mongoose.model("Org", orgSchema);
    `);
    if (!r.ok) throw new Error(r.error);
    expect(r.tables.map((t) => t.name)).toEqual(["Org", "Person"]);
    const org = r.tables[0];
    expect(col(org, "address.zip")).toMatchObject({ nullable: false });
    expect(col(org, "members")).toMatchObject({ type: "ObjectId[]", array: true });
    expect(edges(r.tables)).toEqual(["Org.members->Person._id"]);
  });

  it("warns about refs to models that are not in the input", () => {
    const r = parseMongooseSchema('const s = new Schema({ owner: { type: Schema.Types.ObjectId, ref: "Ghost" } }); model("Thing", s);');
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings[0]).toMatch(/Ghost/);
    expect(parseMongooseSchema("const x = 1;").ok).toBe(false);
  });
});

describe("parseTypeScriptTypes", () => {
  it("parses interfaces with keys, FK comments, name heuristics, unions and nested objects", () => {
    const r = parseTypeScriptTypes(TYPESCRIPT_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const [users, posts, comments] = r.tables;
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    expect(col(users, "id")).toMatchObject({ primaryKey: true, type: "number", nullable: false });
    expect(col(users, "email")?.unique).toBe(true);
    expect(col(users, "role")).toMatchObject({ baseType: "enum", enumValues: ["admin", "member"], enumName: "Role" });
    expect(col(users, "bio")?.nullable).toBe(true);
    expect(col(posts, "status")).toMatchObject({ baseType: "enum", enumValues: ["draft", "published"] });
    expect(col(posts, "tags")).toMatchObject({ array: true, type: "string[]" });
    expect(col(posts, "meta.cover")).toMatchObject({ nullable: true });
    expect(col(posts, "publishedAt")).toMatchObject({ type: "Date", nullable: true });
    expect(col(comments, "likes")).toMatchObject({ baseType: "bigint" });
    expect(edges(r.tables)).toEqual(["posts.authorId->users.id", "comments.postId->posts.id", "comments.userId->users.id"]);
  });

  it("understands Kysely registries and Generated<> columns", () => {
    const r = parseTypeScriptTypes(`
      import type { Generated, ColumnType } from "kysely";
      export interface UsersTable { id: Generated<number>; email: string; created_at: ColumnType<Date, string | undefined, never>; }
      export interface PostsTable { id: Generated<number>; user_id: number; title: string | null }
      export interface DB { users: UsersTable; posts: PostsTable; }
    `);
    if (!r.ok) throw new Error(r.error);
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts"]);
    expect(col(r.tables[0], "id")).toMatchObject({ primaryKey: true, autoIncrement: true, type: "number" });
    expect(col(r.tables[0], "created_at")).toMatchObject({ type: "Date", nullable: false });
    expect(col(r.tables[1], "title")?.nullable).toBe(true);
    expect(edges(r.tables)).toEqual(["posts.user_id->users.id"]);
  });

  it("treats typed references as relations and embeds helper types", () => {
    const r = parseTypeScriptTypes(`
      type Address = { city: string; zip?: string };
      interface Org { _id: string; name: string; address: Address; owner: User; tags?: string[] }
      interface User { _id: string; name: string; orgIds: string[] }
      interface DB { orgs: Org; users: User }
    `);
    if (!r.ok) throw new Error(r.error);
    expect(r.tables.map((t) => t.name)).toEqual(["orgs", "users"]);
    expect(col(r.tables[0], "address.city")).toBeDefined();
    expect(col(r.tables[0], "owner")).toMatchObject({ type: "User" });
    expect(edges(r.tables)).toEqual(["orgs.owner->users._id", "users.orgIds->orgs._id"]);
  });

  it("fails cleanly without declarations", () => {
    expect(parseTypeScriptTypes("const a = 1;").ok).toBe(false);
  });
});

describe("parseDrizzleSchema", () => {
  it("parses pgTable definitions with chains, enums, arrays, references and extras", () => {
    const r = parseDrizzleSchema(DRIZZLE_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const [users, posts, comments] = r.tables;
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    expect(col(users, "id")).toMatchObject({ primaryKey: true, autoIncrement: true, nullable: false });
    expect(col(users, "email")).toMatchObject({ type: "varchar(255)", length: 255, unique: true, nullable: false });
    expect(col(users, "role")).toMatchObject({ baseType: "enum", enumValues: ["admin", "member"], defaultValue: "'member'" });
    expect(col(users, "bio")?.nullable).toBe(true);
    expect(col(users, "created_at")).toMatchObject({ type: "timestamptz", defaultValue: "now()" });
    expect(col(posts, "tags")).toMatchObject({ array: true, type: "text[]" });
    expect(posts.indexes).toEqual([{ name: "posts_author_idx", columns: ["author_id", "published"], unique: false }]);
    expect(posts.foreignKeys[0]).toMatchObject({ columns: ["author_id"], refTable: "users", refColumns: ["id"], onDelete: "CASCADE" });
    expect(comments.foreignKeys[1]).toMatchObject({ columns: ["author_id"], refTable: "users", onDelete: "SET NULL" });
    expect(edges(r.tables)).toEqual(["posts.author_id->users.id", "comments.post_id->posts.id", "comments.author_id->users.id"]);
  });

  it("handles mysqlTable, composite keys, sqlite modes and namespaced builders", () => {
    const r = parseDrizzleSchema(`
      export const tags = mysqlTable("tags", { id: int("id").autoincrement().primaryKey(), kind: mysqlEnum("kind", ["a", "b"]).notNull() });
      export const postTags = sqliteTable("post_tags", {
        postId: integer("post_id").notNull(),
        tagId: integer("tag_id").notNull().references(() => tags.id),
        pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
      }, (t) => ({ pk: primaryKey({ columns: [t.postId, t.tagId] }), u: unique("u").on(t.postId) }));
      export const audit = pgTable("audit", { id: t.uuid("id").defaultRandom().primaryKey(), payload: t.jsonb("payload") });
    `);
    if (!r.ok) throw new Error(r.error);
    expect(col(r.tables[0], "id")?.autoIncrement).toBe(true);
    expect(col(r.tables[0], "kind")).toMatchObject({ baseType: "enum", enumValues: ["a", "b"] });
    expect(r.tables[1].primaryKey).toEqual(["post_id", "tag_id"]);
    expect(r.tables[1].uniques).toEqual([["post_id"]]);
    expect(col(r.tables[1], "pinned")?.baseType).toBe("boolean");
    expect(col(r.tables[2], "id")).toMatchObject({ baseType: "uuid", defaultValue: "gen_random_uuid()" });
    expect(col(r.tables[2], "payload")?.baseType).toBe("json");
    expect(edges(r.tables)).toEqual(["post_tags.tag_id->tags.id"]);
  });

  it("fails cleanly without tables", () => {
    expect(parseDrizzleSchema("export const x = relations(users, () => ({}));").ok).toBe(false);
  });
});

describe("parseTypeormEntities", () => {
  it("parses entities, column options, generated keys and ManyToOne joins", () => {
    const r = parseTypeormEntities(TYPEORM_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const [users, posts, comments] = r.tables;
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    expect(col(users, "id")).toMatchObject({ primaryKey: true, autoIncrement: true, baseType: "int" });
    expect(col(users, "email")).toMatchObject({ type: "varchar(255)", unique: true, nullable: false });
    expect(col(users, "role")).toMatchObject({ baseType: "enum", enumValues: ["admin", "member"] });
    expect(col(users, "bio")?.nullable).toBe(true);
    expect(col(users, "createdAt")).toMatchObject({ baseType: "timestamp", defaultValue: "now()" });
    expect(col(users, "posts")).toBeUndefined();
    expect(col(posts, "author_id")).toMatchObject({ nullable: false, baseType: "int" });
    expect(col(comments, "id")).toMatchObject({ primaryKey: true, baseType: "uuid", autoIncrement: false });
    expect(col(comments, "author_id")?.nullable).toBe(true);
    expect(posts.foreignKeys[0]).toMatchObject({ columns: ["author_id"], refTable: "users", refColumns: ["id"], onDelete: "CASCADE" });
    expect(edges(r.tables)).toEqual(["posts.author_id->users.id", "comments.post_id->posts.id", "comments.author_id->users.id"]);
  });

  it("falls back to TS member types, supports @Entity('name') and @Unique/@Index, and warns on many-to-many", () => {
    const r = parseTypeormEntities(`
      @Entity("tags")
      @Unique(["slug", "lang"])
      @Index(["name"])
      export class Tag {
        @PrimaryColumn({ type: "uuid" }) id: string;
        @Column() name: string;
        @Column() slug: string;
        @Column({ default: "en" }) lang: string;
        @Column({ nullable: true }) count?: number;
        @ManyToMany(() => Post) @JoinTable() posts: Post[];
        @BeforeInsert() normalise() { this.slug = this.slug.toLowerCase(); }
      }
    `);
    if (!r.ok) throw new Error(r.error);
    const tag = r.tables[0];
    expect(tag.name).toBe("tags");
    expect(tag.uniques).toEqual([["slug", "lang"]]);
    expect(tag.indexes).toEqual([{ name: undefined, columns: ["name"], unique: false }]);
    expect(col(tag, "id")).toMatchObject({ primaryKey: true, baseType: "uuid" });
    expect(col(tag, "name")).toMatchObject({ type: "string", baseType: "string" });
    expect(col(tag, "count")).toMatchObject({ baseType: "int", nullable: true });
    expect(col(tag, "normalise")).toBeUndefined();
    expect(r.warnings[0]).toMatch(/many-to-many/);
  });

  it("fails cleanly without entities", () => {
    expect(parseTypeormEntities("export class Nope { id: number }").ok).toBe(false);
  });
});

describe("parseSequelizeModels", () => {
  it("parses define() models, options, timestamps and associations", () => {
    const r = parseSequelizeModels(SEQUELIZE_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const [users, posts, comments] = r.tables;
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    expect(col(users, "id")).toMatchObject({ primaryKey: true, autoIncrement: true, baseType: "int" });
    expect(col(users, "email")).toMatchObject({ type: "STRING(255)", length: 255, unique: true, nullable: false });
    expect(col(users, "role")).toMatchObject({ baseType: "enum", enumValues: ["admin", "member"], defaultValue: "'member'" });
    expect(col(users, "bio")).toMatchObject({ type: "TEXT", nullable: true });
    expect(col(users, "created_at")).toBeDefined();
    expect(col(comments, "created_at")).toBeUndefined();
    expect(col(comments, "id")).toMatchObject({ baseType: "uuid", primaryKey: true });
    expect(col(posts, "author_id")).toMatchObject({ nullable: false });
    expect(col(comments, "author_id")).toMatchObject({ nullable: true });
    expect(edges(r.tables)).toEqual(["posts.author_id->users.id", "comments.post_id->posts.id", "comments.author_id->users.id"]);
    expect(posts.foreignKeys[0].onDelete).toBe("CASCADE");
  });

  it("parses Model.init with references, ARRAY types, paranoid and belongsToMany warnings", () => {
    const r = parseSequelizeModels(`
      class Project extends Model {}
      Project.init({
        id: { type: DataTypes.UUID, primaryKey: true },
        ownerId: { type: DataTypes.INTEGER, references: { model: "users", key: "id" }, onDelete: "SET NULL" },
        labels: DataTypes.ARRAY(DataTypes.STRING),
        budget: DataTypes.DECIMAL(10, 2),
      }, { sequelize, tableName: "projects", paranoid: true, indexes: [{ unique: true, fields: ["ownerId", "budget"] }] });
      class User extends Model {}
      User.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true } }, { sequelize, tableName: "users" });
      Project.belongsToMany(User, { through: "ProjectMembers" });
    `);
    if (!r.ok) throw new Error(r.error);
    const project = r.tables[0];
    expect(col(project, "labels")).toMatchObject({ array: true, type: "STRING[]" });
    expect(col(project, "budget")).toMatchObject({ baseType: "decimal", precision: 10, scale: 2 });
    expect(col(project, "deletedAt")?.nullable).toBe(true);
    expect(project.uniques).toEqual([["ownerId", "budget"]]);
    expect(edges(r.tables)).toEqual(["projects.ownerId->users.id"]);
    expect(r.warnings.some((w) => w.includes("ProjectMembers"))).toBe(true);
  });

  it("fails cleanly without models", () => {
    expect(parseSequelizeModels("const x = require('sequelize');").ok).toBe(false);
  });
});

describe("round trips through the SQL → ORM generators", () => {
  const source = parseDdl(DDL_SAMPLE);
  if (!source.ok) throw new Error(source.error);
  const expected = edges(source.tables);

  it.each([
    ["drizzle", parseDrizzleSchema],
    ["typeorm", parseTypeormEntities],
    ["mongoose", parseMongooseSchema],
    ["typescript", parseTypeScriptTypes],
  ] as const)("%s output parses back with the same relations", (target, parse) => {
    const code = generateOrm(source.tables, target, { dialect: "postgresql", naming: "camel" }).code;
    const r = parse(code);
    if (!r.ok) throw new Error(`${target}: ${r.error}`);
    expect(r.tables).toHaveLength(3);
    const got = edges(r.tables).map((e) => e.toLowerCase().replace(/_/g, ""));
    // Normalised: case and underscores dropped, so Mongoose's `_id` compares equal to `id`.
    expect(got).toEqual(expected.map((e) => e.toLowerCase().replace(/_/g, "")));
    expect(toMermaid(r.tables)).toContain("erDiagram");
  });
});

describe("detectSchemaSource and the registry", () => {
  it("guesses each sample's source", () => {
    for (const s of SCHEMA_SOURCES) expect([s.id, detectSchemaSource(s.sample)]).toEqual([s.id, s.id]);
    expect(detectSchemaSource("")).toBeNull();
    expect(detectSchemaSource("hello there")).toBeNull();
  });

  it("every sample parses through parseSchemaSource with no warnings", () => {
    for (const s of SCHEMA_SOURCES) {
      const r = parseSchemaSource(s.id, s.sample);
      if (!r.ok) throw new Error(`${s.id}: ${r.error}`);
      expect(r.tables.length, s.id).toBeGreaterThanOrEqual(3);
      expect(r.warnings, s.id).toEqual([]);
      expect(buildSchemaGraph(r.tables).edges.length, s.id).toBeGreaterThanOrEqual(3);
    }
  });
});
