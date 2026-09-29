import { describe, expect, it } from "vitest";
import { DDL_SAMPLE, parseDdl, type Table } from "@/lib/tools/ddl";
import { ORM_TARGETS, camelCase, dependencyOrder, generateOrm, pascalCase, plural, singular, type OrmOptions } from "@/lib/tools/sql-to-orm";

function tables(sql: string): Table[] {
  const r = parseDdl(sql);
  if (!r.ok) throw new Error(r.error);
  return r.tables;
}

const PG: OrmOptions = { dialect: "postgresql", naming: "camel" };
const MY: OrmOptions = { dialect: "mysql", naming: "camel" };
const sample = tables(DDL_SAMPLE);

const EDGE = tables(`
  CREATE TABLE teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
  CREATE TABLE memberships (
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_email varchar(255) NOT NULL,
    role varchar(20) NOT NULL DEFAULT 'member',
    invited_by_team_id uuid REFERENCES teams(id),
    mood ENUM('happy', 'meh') DEFAULT 'meh',
    PRIMARY KEY (team_id, user_email)
  );`);

describe("naming helpers", () => {
  it("converts between cases and singular/plural forms", () => {
    expect(camelCase("created_at")).toBe("createdAt");
    expect(camelCase("Order Items")).toBe("orderItems");
    expect(camelCase("2fa_codes")).toBe("_2faCodes");
    expect(pascalCase("user_profiles")).toBe("UserProfiles");
    expect(singular("UserProfiles")).toBe("UserProfile");
    expect(singular("categories")).toBe("category");
    expect(singular("addresses")).toBe("address");
    expect(singular("status")).toBe("status");
    expect(plural("post")).toBe("posts");
    expect(plural("category")).toBe("categories");
    expect(plural("users")).toBe("users");
  });

  it("orders referenced tables first", () => {
    const reordered = [sample[2], sample[1], sample[0]];
    expect(dependencyOrder(reordered).map((t) => t.name)).toEqual(["users", "posts", "comments"]);
  });
});

describe("generateOrm: prisma", () => {
  const { code, warnings, filename } = generateOrm(sample, "prisma", PG);

  it("emits datasource, enum, models with ids, defaults, uniques and maps", () => {
    expect(filename).toBe("schema.prisma");
    expect(warnings).toEqual([]);
    expect(code).toContain('provider = "postgresql"');
    expect(code).toContain("enum PostStatus {\n  draft\n  published\n  archived\n}");
    expect(code).toContain("id          Int       @id @default(autoincrement())");
    expect(code).toContain("email       String    @unique @db.VarChar(255)");
    expect(code).toContain('displayName String?   @map("display_name") @db.VarChar(80)');
    expect(code).toContain("isAdmin     Boolean   @default(false)");
    expect(code).toContain('createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)');
    expect(code).toContain('updatedAt   DateTime  @updatedAt @map("updated_at")');
    expect(code).toContain("status      PostStatus @default(draft)");
    expect(code).toContain("price       Decimal?   @db.Decimal(10, 2)");
    expect(code).toContain("@@unique([authorId, slug])");
    expect(code).toContain("@@index([postId])");
    expect(code).toContain('@@map("users")');
  });

  it("writes relations in both directions with onDelete", () => {
    expect(code).toContain("author      User       @relation(fields: [authorId], references: [id], onDelete: Cascade)");
    expect(code).toContain("posts       Post[]");
    expect(code).toContain("author    User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)");
    expect(code).toMatch(/comments\s+Comment\[\]/);
  });

  it("handles composite keys, nullable and duplicate FKs to one table, inline enums and uuid ids", () => {
    const out = generateOrm(EDGE, "prisma", PG).code;
    expect(out).toContain("@@id([teamId, userEmail])");
    expect(out).toMatch(/id\s+String\s+@id @default\(uuid\(\)\) @db\.Uuid/);
    expect(out).toContain("enum MembershipMood {\n  happy\n  meh\n}");
    expect(out).toMatch(/mood\s+MembershipMood\?\s+@default\(meh\)/);
    // two FKs to teams => named relations, nullable one gets `?`
    expect(out).toMatch(/team\s+Team\s+@relation\("Membership_team_id", fields: \[teamId\], references: \[id\], onDelete: Cascade\)/);
    expect(out).toMatch(/invitedByTeam\s+Team\?\s+@relation\("Membership_invited_by_team_id", fields: \[invitedByTeamId\], references: \[id\]\)/);
    expect(out).toMatch(/memberships\s+Membership\[\] @relation\("Membership_team_id"\)/);
    expect(out).toMatch(/membershipsAsInvitedByTeam\s+Membership\[\] @relation\("Membership_invited_by_team_id"\)/);
  });

  it("keeps column names and pluralised model names in preserve mode", () => {
    const out = generateOrm(sample, "prisma", { dialect: "mysql", naming: "preserve" }).code;
    expect(out).toContain("model Users {");
    expect(out).toMatch(/display_name\s+String\?/);
    expect(out).not.toContain(" @map(");
    expect(out).toContain('@@map("users")');
    expect(out).not.toContain("@db.Timestamptz");
  });
});

describe("generateOrm: drizzle", () => {
  it("emits pgTable with serial, varchar length, references and relations", () => {
    const { code, filename } = generateOrm(sample, "drizzle", PG);
    expect(filename).toBe("schema.ts");
    expect(code).toContain('from "drizzle-orm/pg-core"');
    expect(code).toContain('export const postStatusEnum = pgEnum("post_status", ["draft", "published", "archived"]);');
    expect(code).toContain('id: serial("id").primaryKey(),');
    expect(code).toContain('email: varchar("email", { length: 255 }).notNull().unique(),');
    expect(code).toContain('createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),');
    expect(code).toContain('authorId: integer("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),');
    expect(code).toContain('status: postStatusEnum("status").notNull().default("draft"),');
    expect(code).toContain("}, (t) => [unique().on(t.authorId, t.slug)]);");
    expect(code).toContain('(t) => [index("idx_comments_post").on(t.postId)]');
    expect(code).toContain("author: one(users, { fields: [posts.authorId], references: [users.id] }),");
    expect(code).toContain("comments: many(comments),");
    expect(code.indexOf("export const users")).toBeLessThan(code.indexOf("export const posts"));
  });

  it("switches to mysqlTable with autoincrement and mysqlEnum", () => {
    const { code } = generateOrm(sample, "drizzle", MY);
    expect(code).toContain('from "drizzle-orm/mysql-core"');
    expect(code).toContain('id: int("id").autoincrement().primaryKey(),');
    expect(code).toContain('status: mysqlEnum("status", ["draft", "published", "archived"]).notNull().default("draft"),');
    expect(code).not.toContain("pgEnum");
  });

  it("emits composite primary keys and uuid defaults", () => {
    const { code } = generateOrm(EDGE, "drizzle", PG);
    expect(code).toContain("primaryKey({ columns: [t.teamId, t.userEmail] })");
    expect(code).toContain('id: uuid("id").primaryKey().defaultRandom(),');
    expect(code).toContain('invitedByTeamId: uuid("invited_by_team_id").references(() => teams.id),');
  });
});

describe("generateOrm: typeorm", () => {
  it("emits entities with generated ids, columns, date columns and relations", () => {
    const { code, filename } = generateOrm(sample, "typeorm", PG);
    expect(filename).toBe("entities.ts");
    expect(code).toContain('@Entity({ name: "users" })');
    expect(code).toContain("@PrimaryGeneratedColumn()\n  id!: number;");
    expect(code).toContain('@PrimaryGeneratedColumn({ type: "bigint" })\n  id!: string;');
    expect(code).toContain('@Column({ type: "varchar", length: 255, unique: true })\n  email!: string;');
    expect(code).toContain('@Column({ type: "varchar", name: "display_name", length: 80, nullable: true })\n  displayName!: string | null;');
    expect(code).toContain('@CreateDateColumn({ name: "created_at", type: "timestamptz" })');
    expect(code).toContain('@UpdateDateColumn({ name: "updated_at", type: "timestamptz" })');
    expect(code).toContain('@Column({ type: "enum", enum: ["draft", "published", "archived"], default: "draft" })\n  status!: PostStatus;');
    expect(code).toContain('@ManyToOne(() => User, (user) => user.posts, { nullable: false, onDelete: "CASCADE" })\n  @JoinColumn({ name: "author_id", referencedColumnName: "id" })\n  author!: User;');
    expect(code).toContain("@OneToMany(() => Post, (post) => post.author)\n  posts!: Post[];");
    expect(code).toContain('@Unique(["authorId", "slug"])');
    expect(code).toContain('@Index(["postId"])');
  });

  it("uses PrimaryColumn for composite keys and uuid generation", () => {
    const { code } = generateOrm(EDGE, "typeorm", PG);
    expect(code).toContain('@PrimaryGeneratedColumn("uuid")');
    expect(code).toContain('@PrimaryColumn({ type: "uuid", name: "team_id" })\n  teamId!: string;');
    expect(code).toContain('@PrimaryColumn({ type: "varchar", name: "user_email", length: 255 })\n  userEmail!: string;');
  });
});

describe("generateOrm: mongoose", () => {
  it("emits schemas with refs, enums, timestamps and compound indexes", () => {
    const { code, filename } = generateOrm(sample, "mongoose", PG);
    expect(filename).toBe("models.ts");
    expect(code).toContain("email: { type: String, required: true, unique: true, maxlength: 255 },");
    expect(code).toContain("// id: MongoDB provides _id instead of an auto-increment key");
    expect(code).toContain('authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },');
    expect(code).toContain('status: { type: String, required: true, enum: ["draft", "published", "archived"], default: "draft" },');
    expect(code).toContain('{ timestamps: true, collection: "posts" },');
    expect(code).toContain("postSchema.index({ authorId: 1, slug: 1 }, { unique: true });");
    expect(code).toContain('export const PostModel = model<Post>("Post", postSchema);');
    expect(code).not.toContain("createdAt:");
  });

  it("maps snake_case timestamps explicitly in preserve mode", () => {
    const { code } = generateOrm(sample, "mongoose", { dialect: "postgresql", naming: "preserve" }).code.includes('timestamps: { createdAt: "created_at", updatedAt: "updated_at" }') ? { code: "ok" } : { code: "missing" };
    expect(code).toBe("ok");
  });
});

describe("generateOrm: typescript", () => {
  it("emits interfaces and enum unions with key notes", () => {
    const { code, filename } = generateOrm(sample, "typescript", PG);
    expect(filename).toBe("types.ts");
    expect(code).toContain('export type PostStatus = "draft" | "published" | "archived";');
    expect(code).toContain("/** Table: users */\nexport interface User {");
    expect(code).toContain("id: number;                 // PK");
    expect(code).toContain("authorId: number;         // FK → users.id");
    expect(code).toContain("displayName: string | null;");
    expect(code).toContain("metadata: unknown;");
  });
});

describe("generateOrm: general", () => {
  it("is deterministic and covers every target", () => {
    for (const t of ORM_TARGETS) {
      const a = generateOrm(sample, t.id, PG).code;
      const b = generateOrm(sample, t.id, PG).code;
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(50);
      expect(a.endsWith("\n")).toBe(true);
    }
  });

  it("warns about unresolved references and unmapped types instead of failing", () => {
    const t = tables(`CREATE TABLE a (id int primary key, b_id int REFERENCES b(id), geo geography(Point, 4326));`);
    const { code, warnings } = generateOrm(t, "prisma", PG);
    expect(warnings.some((w) => /references b/.test(w))).toBe(true);
    expect(warnings.some((w) => /geography/.test(w))).toBe(true);
    expect(code).toContain('Unsupported("geography(Point, 4326)")');
  });

  it("quotes field names that are not identifiers in preserve mode", () => {
    const t = tables(`CREATE TABLE "t" ("first name" text, "id" int primary key);`);
    expect(generateOrm(t, "typescript", { dialect: "postgresql", naming: "preserve" }).code).toContain('"first name": string | null;');
    expect(generateOrm(t, "prisma", { dialect: "postgresql", naming: "preserve" }).code).toContain('first_name String? @map("first name")');
  });
});
