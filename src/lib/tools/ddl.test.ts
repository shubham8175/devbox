import { describe, expect, it } from "vitest";
import { DDL_LIMITS, DDL_SAMPLE, PRISMA_SAMPLE, findTable, parseDdl, parsePrismaSchema, type Table } from "@/lib/tools/ddl";

function tables(sql: string): Table[] {
  const r = parseDdl(sql);
  if (!r.ok) throw new Error(r.error);
  return r.tables;
}

function col(t: Table, name: string) {
  const c = t.columns.find((x) => x.name === name);
  if (!c) throw new Error(`no column ${name} in ${t.name}`);
  return c;
}

describe("parseDdl: PostgreSQL", () => {
  it("parses the bundled sample into three tables with keys, enum and foreign keys", () => {
    const r = parseDdl(DDL_SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.tables.map((t) => t.name)).toEqual(["users", "posts", "comments"]);
    const users = r.tables[0];
    expect(users.primaryKey).toEqual(["id"]);
    expect(col(users, "id")).toMatchObject({ baseType: "int", autoIncrement: true, primaryKey: true, nullable: false });
    expect(col(users, "email")).toMatchObject({ baseType: "string", length: 255, unique: true, nullable: false });
    expect(col(users, "display_name").nullable).toBe(true);
    expect(col(users, "is_admin")).toMatchObject({ baseType: "boolean", defaultValue: "false" });
    expect(col(users, "created_at")).toMatchObject({ baseType: "timestamp", defaultValue: "now()" });
    expect(col(users, "created_at").precision).toBeUndefined();

    const posts = r.tables[1];
    expect(col(posts, "id").baseType).toBe("bigint");
    expect(col(posts, "status")).toMatchObject({ baseType: "enum", enumValues: ["draft", "published", "archived"], defaultValue: "'draft'" });
    expect(col(posts, "price")).toMatchObject({ baseType: "decimal", precision: 10, scale: 2 });
    expect(col(posts, "metadata").baseType).toBe("json");
    expect(posts.uniques).toEqual([["author_id", "slug"]]);
    expect(posts.foreignKeys).toEqual([{ columns: ["author_id"], refTable: "users", refColumns: ["id"], onDelete: "CASCADE" }]);

    const comments = r.tables[2];
    expect(comments.foreignKeys).toEqual([
      { name: "fk_comments_post", columns: ["post_id"], refTable: "posts", refColumns: ["id"], onDelete: "CASCADE" },
      { name: "fk_comments_author", columns: ["author_id"], refTable: "users", refColumns: ["id"], onDelete: "SET NULL" },
    ]);
    expect(comments.indexes).toEqual([{ name: "idx_comments_post", columns: ["post_id"], unique: false }]);
  });

  it("handles quoted identifiers, schemas, IF NOT EXISTS and multi-word types", () => {
    const [t] = tables(`
      CREATE TABLE IF NOT EXISTS "public"."Order Items" (
        "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "qty" double precision NOT NULL,
        "at" timestamp(3) with time zone,
        "tags" text[] NOT NULL DEFAULT '{}'::text[],
        "note" character varying(40)
      );`);
    expect(t.schema).toBe("public");
    expect(t.name).toBe("Order Items");
    expect(col(t, "id")).toMatchObject({ baseType: "uuid", defaultValue: "gen_random_uuid()", primaryKey: true });
    expect(col(t, "qty")).toMatchObject({ baseType: "float", nullable: false });
    expect(col(t, "at")).toMatchObject({ baseType: "timestamp", precision: 3 });
    expect(col(t, "tags")).toMatchObject({ baseType: "text", array: true, defaultValue: "'{}'::text[]" });
    expect(col(t, "note")).toMatchObject({ baseType: "string", length: 40 });
  });

  it("supports composite primary keys, identity columns and table-level constraints", () => {
    const [t] = tables(`
      CREATE TABLE memberships (
        user_id int GENERATED ALWAYS AS IDENTITY,
        team_id int NOT NULL,
        role varchar(20) DEFAULT 'member',
        CONSTRAINT memberships_pk PRIMARY KEY (user_id, team_id),
        CONSTRAINT memberships_role_uq UNIQUE (team_id, role),
        FOREIGN KEY (team_id) REFERENCES teams ON DELETE CASCADE ON UPDATE RESTRICT,
        CHECK (role <> '')
      );`);
    expect(t.primaryKey).toEqual(["user_id", "team_id"]);
    expect(col(t, "user_id")).toMatchObject({ autoIncrement: true, primaryKey: true, nullable: false });
    expect(col(t, "team_id").primaryKey).toBe(true);
    expect(t.uniques).toEqual([["team_id", "role"]]);
    expect(t.foreignKeys[0]).toMatchObject({ columns: ["team_id"], refTable: "teams", refColumns: ["id"], onDelete: "CASCADE", onUpdate: "RESTRICT" });
  });

  it("applies ALTER TABLE ... ADD FOREIGN KEY / ADD COLUMN and CREATE UNIQUE INDEX", () => {
    const [a, b] = tables(`
      CREATE TABLE a (id serial primary key, code text);
      CREATE TABLE b (id serial primary key, a_id int);
      ALTER TABLE ONLY b ADD CONSTRAINT b_a_fk FOREIGN KEY (a_id) REFERENCES a (id) ON DELETE SET NULL;
      ALTER TABLE a ADD COLUMN extra jsonb NOT NULL DEFAULT '{}';
      CREATE UNIQUE INDEX a_code_idx ON a USING btree (code);
      CREATE INDEX CONCURRENTLY IF NOT EXISTS b_a_idx ON b (a_id);`);
    expect(b.foreignKeys).toEqual([{ name: "b_a_fk", columns: ["a_id"], refTable: "a", refColumns: ["id"], onDelete: "SET NULL" }]);
    expect(col(a, "extra")).toMatchObject({ baseType: "json", nullable: false });
    expect(a.indexes).toEqual([{ name: "a_code_idx", columns: ["code"], unique: true }]);
    expect(col(a, "code").unique).toBe(true);
    expect(b.indexes).toEqual([{ name: "b_a_idx", columns: ["a_id"], unique: false }]);
  });

  it("resolves CREATE TYPE enums declared before or after the table", () => {
    const [t] = tables(`
      CREATE TABLE jobs (id serial primary key, state job_state NOT NULL);
      CREATE TYPE job_state AS ENUM ('queued', 'done');`);
    expect(col(t, "state")).toMatchObject({ baseType: "enum", enumValues: ["queued", "done"], enumName: "job_state" });
  });
});

describe("parseDdl: MySQL and SQLite", () => {
  it("parses a mysqldump-style table", () => {
    const [t] = tables(`
      CREATE TABLE \`orders\` (
        \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
        \`user_id\` bigint NOT NULL,
        \`paid\` tinyint(1) NOT NULL DEFAULT '0',
        \`kind\` enum('web','app') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'web' COMMENT 'channel',
        \`total\` decimal(12,2) DEFAULT NULL,
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_user_kind\` (\`user_id\`,\`kind\`),
        KEY \`idx_user\` (\`user_id\`),
        CONSTRAINT \`fk_orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
      ) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4;`);
    expect(col(t, "id")).toMatchObject({ baseType: "int", autoIncrement: true, primaryKey: true, nullable: false });
    expect(col(t, "paid")).toMatchObject({ baseType: "boolean", defaultValue: "'0'" });
    expect(col(t, "kind")).toMatchObject({ baseType: "enum", enumValues: ["web", "app"], nullable: false, defaultValue: "'web'" });
    expect(col(t, "total")).toMatchObject({ baseType: "decimal", precision: 12, scale: 2, nullable: true });
    expect(col(t, "created_at").defaultValue).toBe("CURRENT_TIMESTAMP");
    expect(t.uniques).toEqual([["user_id", "kind"]]);
    expect(t.indexes).toEqual([
      { name: "uq_user_kind", columns: ["user_id", "kind"], unique: true },
      { name: "idx_user", columns: ["user_id"], unique: false },
    ]);
    expect(t.foreignKeys[0]).toMatchObject({ name: "fk_orders_user", columns: ["user_id"], refTable: "users" });
  });

  it("parses SQLite AUTOINCREMENT and bracketed identifiers", () => {
    const [t] = tables(`CREATE TABLE [notes] ([id] INTEGER PRIMARY KEY AUTOINCREMENT, [body] TEXT NOT NULL, [blob] BLOB) WITHOUT ROWID;`);
    expect(t.name).toBe("notes");
    expect(col(t, "id")).toMatchObject({ autoIncrement: true, primaryKey: true });
    expect(col(t, "blob").baseType).toBe("bytes");
  });
});

describe("parseDdl: tolerance and limits", () => {
  it("ignores comments and warns about unsupported statements instead of failing", () => {
    const r = parseDdl(`
      -- header comment
      SET search_path = public; /* block
      comment */
      DROP TABLE IF EXISTS t;
      CREATE TABLE t (id int primary key); -- trailing
      INSERT INTO t VALUES (1);`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tables).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/Skipped unsupported statements: SET SEARCH_PATH, DROP TABLE, INSERT INTO/);
  });

  it("warns when a foreign key targets a table that is not in the input", () => {
    const r = parseDdl(`CREATE TABLE a (id int primary key, b_id int REFERENCES b(id));`);
    expect(r.ok && r.warnings[0]).toMatch(/references b/);
  });

  it("reports empty input, missing tables and oversized input", () => {
    expect(parseDdl("   ")).toMatchObject({ ok: false });
    expect(parseDdl("SELECT 1;")).toMatchObject({ ok: false, error: "No CREATE TABLE statements found." });
    expect(parseDdl("x".repeat(DDL_LIMITS.maxChars + 1))).toMatchObject({ ok: false });
    expect(parseDdl("x".repeat(DDL_LIMITS.maxChars + 1))).toHaveProperty("error", expect.stringMatching(/too large/));
  });

  it("caps the number of tables", () => {
    const sql = Array.from({ length: DDL_LIMITS.maxTables + 5 }, (_, i) => `CREATE TABLE t${i} (id int);`).join("\n");
    const r = parseDdl(sql);
    expect(r.ok && r.tables.length).toBe(DDL_LIMITS.maxTables);
    expect(r.ok && r.warnings[0]).toMatch(/first 200 tables/);
  });

  it("never throws on hostile input", () => {
    for (const sql of ["CREATE TABLE (", "CREATE TABLE t (id int", "CREATE TABLE t ((((((", "CREATE TABLE \"unterminated (id int);", "CREATE TABLE t (id int DEFAULT 'x);", ");;;(", "CREATE TABLE t (__proto__ int, constructor text);"]) {
      expect(() => parseDdl(sql)).not.toThrow();
    }
  });
});

describe("parsePrismaSchema", () => {
  it("parses the bundled sample into the same model as the SQL sample", () => {
    const r = parsePrismaSchema(PRISMA_SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.tables.map((t) => t.name)).toEqual(["User", "Post", "Comment"]);
    const user = r.tables[0];
    expect(col(user, "id")).toMatchObject({ baseType: "int", primaryKey: true, autoIncrement: true, nullable: false });
    expect(col(user, "email")).toMatchObject({ unique: true, length: 255 });
    expect(col(user, "displayName").nullable).toBe(true);
    expect(col(user, "createdAt").defaultValue).toBe("now()");
    expect(user.columns.map((c) => c.name)).not.toContain("posts");
    const post = r.tables[1];
    expect(col(post, "status")).toMatchObject({ baseType: "enum", enumValues: ["DRAFT", "PUBLISHED", "ARCHIVED"], defaultValue: "'DRAFT'" });
    expect(col(post, "price")).toMatchObject({ baseType: "decimal", precision: 10, scale: 2, nullable: true });
    expect(post.uniques).toEqual([["authorId", "slug"]]);
    expect(post.foreignKeys).toEqual([{ name: undefined, columns: ["authorId"], refTable: "User", refColumns: ["id"], onDelete: "CASCADE", onUpdate: undefined }]);
    const comment = r.tables[2];
    expect(comment.foreignKeys.map((fk) => [fk.refTable, fk.onDelete])).toEqual([
      ["Post", "CASCADE"],
      ["User", "SET NULL"],
    ]);
    expect(comment.indexes).toEqual([{ name: undefined, columns: ["postId"], unique: false }]);
  });

  it("handles @@id, @@map, @map, scalar lists and dbgenerated defaults", () => {
    const r = parsePrismaSchema(`
      model Tag {
        postId Int @map("post_id")
        name   String @default(dbgenerated("'x'"))
        labels String[]
        @@id([postId, name])
        @@map("tags")
      }`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.tables[0];
    expect(t.name).toBe("tags");
    expect(t.primaryKey).toEqual(["post_id", "name"]);
    expect(col(t, "post_id").primaryKey).toBe(true);
    expect(col(t, "name").defaultValue).toBe("'x'");
    expect(col(t, "labels")).toMatchObject({ array: true, baseType: "string" });
  });

  it("rejects text without models", () => {
    expect(parsePrismaSchema("generator client { provider = \"prisma-client-js\" }")).toMatchObject({ ok: false });
    expect(parsePrismaSchema("")).toMatchObject({ ok: false });
  });
});

describe("findTable", () => {
  it("matches case-insensitively and ignores schema prefixes", () => {
    const t = tables(`CREATE TABLE app.Users (id int);`);
    expect(findTable(t, "users")?.name).toBe("Users");
    expect(findTable(t, "public.USERS")?.name).toBe("Users");
    expect(findTable(t, "nope")).toBeUndefined();
  });
});
