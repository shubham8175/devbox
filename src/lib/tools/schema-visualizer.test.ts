import { describe, expect, it } from "vitest";
import { DDL_SAMPLE, PRISMA_SAMPLE, parseDdl, parsePrismaSchema, type Table } from "@/lib/tools/ddl";
import { buildSchemaGraph, layoutGraph, orderByDependency, schemaStats, toMermaid } from "@/lib/tools/schema-visualizer";

function tables(sql: string): Table[] {
  const r = parseDdl(sql);
  if (!r.ok) throw new Error(r.error);
  return r.tables;
}

const sample = tables(DDL_SAMPLE);

describe("buildSchemaGraph", () => {
  it("creates a node per table with key flags and an edge per foreign key column", () => {
    const g = buildSchemaGraph(sample);
    expect(g.nodes.map((n) => n.id)).toEqual(["users", "posts", "comments"]);
    const posts = g.nodes[1];
    expect(posts.columns.find((c) => c.name === "id")).toMatchObject({ pk: true, fk: false, nullable: false });
    expect(posts.columns.find((c) => c.name === "author_id")).toMatchObject({ pk: false, fk: true, nullable: false, type: "INTEGER" });
    expect(g.nodes[0].columns.find((c) => c.name === "email")?.unique).toBe(true);
    expect(g.edges).toEqual([
      { from: "posts", fromColumn: "author_id", to: "users", toColumn: "id", kind: "many-to-one", nullable: false, onDelete: "CASCADE" },
      { from: "comments", fromColumn: "post_id", to: "posts", toColumn: "id", kind: "many-to-one", nullable: false, onDelete: "CASCADE" },
      { from: "comments", fromColumn: "author_id", to: "users", toColumn: "id", kind: "many-to-one", nullable: true, onDelete: "SET NULL" },
    ]);
    expect(g.unresolved).toEqual([]);
  });

  it("reports foreign keys to tables missing from the input", () => {
    const g = buildSchemaGraph(tables("CREATE TABLE a (id int primary key, b_id int REFERENCES b(id));"));
    expect(g.edges).toEqual([]);
    expect(g.unresolved).toEqual(["a.b_id → b"]);
  });

  it("works for Prisma input too", () => {
    const r = parsePrismaSchema(PRISMA_SAMPLE);
    if (!r.ok) throw new Error(r.error);
    const g = buildSchemaGraph(r.tables);
    expect(g.edges.map((e) => `${e.from}.${e.fromColumn}->${e.to}`)).toEqual(["Post.authorId->User", "Comment.postId->Post", "Comment.authorId->User"]);
  });
});

describe("layoutGraph", () => {
  it("places referenced tables first and lays them out on a grid", () => {
    const g = buildSchemaGraph(sample);
    const l = layoutGraph(g.nodes, g.edges, { perRow: 2, columnWidth: 200, rowHeight: 20, headerHeight: 30, gapX: 50, gapY: 40, padding: 10 });
    expect(l.boxes.map((b) => b.id)).toEqual(["users", "posts", "comments"]);
    expect(l.boxes[0]).toMatchObject({ x: 10, y: 10, width: 200, height: 30 + 6 * 20 });
    expect(l.boxes[1]).toMatchObject({ x: 260, y: 10, height: 30 + 11 * 20 });
    // second row starts after the tallest box in row one plus the gap
    expect(l.boxes[2]).toMatchObject({ x: 10, y: 10 + 250 + 40 });
    expect(l.width).toBe(10 * 2 + 200 * 2 + 50);
    expect(l.height).toBe(l.boxes[2].y + l.boxes[2].height + 10);
  });

  it("is deterministic and independent of input order", () => {
    const g = buildSchemaGraph(sample);
    const a = layoutGraph(g.nodes, g.edges);
    const b = layoutGraph(g.nodes, g.edges);
    expect(a).toEqual(b);
    const shuffled = buildSchemaGraph([sample[2], sample[0], sample[1]]);
    const c = layoutGraph(shuffled.nodes, shuffled.edges);
    expect(c.boxes.map((x) => x.id)).toEqual(["users", "posts", "comments"]);
  });

  it("routes every edge as an orthogonal polyline ending at the referencing table's column row", () => {
    const g = buildSchemaGraph(sample);
    const l = layoutGraph(g.nodes, g.edges, { perRow: 3 });
    expect(l.edges).toHaveLength(3);
    for (const e of l.edges) {
      expect(e.points).toHaveLength(4);
      for (let i = 1; i < e.points.length; i++) {
        const same = e.points[i].x === e.points[i - 1].x || e.points[i].y === e.points[i - 1].y;
        expect(same).toBe(true);
      }
      const from = l.boxes.find((b) => b.id === e.from)!;
      const last = e.points[e.points.length - 1];
      expect(last.y).toBe(from.y + l.headerHeight + (from.rows[e.fromColumn] + 0.5) * l.rowHeight);
    }
  });

  it("handles self references and an empty graph", () => {
    const g = buildSchemaGraph(tables("CREATE TABLE nodes (id int primary key, parent_id int REFERENCES nodes(id));"));
    const l = layoutGraph(g.nodes, g.edges);
    expect(l.edges[0].points[0].x).toBe(l.boxes[0].x + l.boxes[0].width);
    expect(l.edges[0].points[3].x).toBe(l.boxes[0].x + l.boxes[0].width);
    const empty = layoutGraph([], []);
    expect(empty.boxes).toEqual([]);
    expect(empty.width).toBeGreaterThan(0);
  });

  it("orderByDependency tolerates cycles", () => {
    const g = buildSchemaGraph(tables("CREATE TABLE a (id int primary key, b_id int REFERENCES b(id)); CREATE TABLE b (id int primary key, a_id int REFERENCES a(id));"));
    expect(orderByDependency(g.nodes, g.edges).map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("schemaStats", () => {
  it("counts tables, columns, relations and orphans", () => {
    expect(schemaStats(sample)).toEqual({ tables: 3, columns: 22, relations: 3, orphans: 0, orphanNames: [] });
    const withOrphan = [...sample, ...tables("CREATE TABLE settings (key text primary key, value text);")];
    expect(schemaStats(withOrphan)).toMatchObject({ tables: 4, orphans: 1, orphanNames: ["settings"] });
  });
});

describe("toMermaid", () => {
  it("emits an erDiagram with typed attributes, key markers and relations", () => {
    const m = toMermaid(sample);
    expect(m.startsWith("erDiagram\n")).toBe(true);
    expect(m).toContain("  users {\n    SERIAL id PK\n    VARCHAR(255) email UK\n");
    expect(m).toContain('    VARCHAR(80) display_name "nullable"');
    expect(m).toContain("    INTEGER author_id FK\n");
    expect(m).toContain('  users ||--o{ posts : "author_id"');
    expect(m).toContain('  users |o--o{ comments : "author_id"');
    expect(m.endsWith("\n")).toBe(true);
  });

  it("sanitises names and types that Mermaid cannot parse", () => {
    const m = toMermaid(tables(`CREATE TABLE "order items" ("first name" character varying(20), amount numeric(10, 2), id int primary key);`));
    expect(m).toContain("  order_items {");
    expect(m).toContain("character_varying(20) first_name");
    expect(m).toContain("numeric(10_2) amount");
    expect(m).not.toMatch(/\(10, 2\)/);
  });
});
