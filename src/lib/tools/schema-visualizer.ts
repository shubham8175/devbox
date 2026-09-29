import type { Table } from "@/lib/tools/ddl";
import { findTable } from "@/lib/tools/ddl";

export interface GraphColumn {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  nullable: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  schema?: string;
  columns: GraphColumn[];
}

export interface GraphEdge {
  from: string;
  fromColumn: string;
  to: string;
  toColumn: string;
  kind: "many-to-one";
  nullable: boolean;
  onDelete?: string;
}

export interface SchemaGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Foreign keys whose target table is not in the input */
  unresolved: string[];
}

function lc(s: string): string {
  return s.toLowerCase();
}

/** Turn the table model into nodes (tables) and edges (one edge per FK column pair). */
export function buildSchemaGraph(tables: Table[]): SchemaGraph {
  const nodes: GraphNode[] = tables.map((t) => {
    const fkCols = new Set(t.foreignKeys.flatMap((fk) => fk.columns.map(lc)));
    return {
      id: t.name,
      name: t.name,
      schema: t.schema,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type || c.baseType, pk: c.primaryKey, fk: fkCols.has(lc(c.name)), unique: c.unique && !c.primaryKey, nullable: c.nullable })),
    };
  });
  const edges: GraphEdge[] = [];
  const unresolved: string[] = [];
  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      const target = findTable(tables, fk.refTable);
      if (!target) {
        unresolved.push(`${t.name}.${fk.columns.join(", ")} → ${fk.refTable}`);
        continue;
      }
      fk.columns.forEach((col, i) => {
        const nullable = t.columns.find((c) => lc(c.name) === lc(col))?.nullable ?? true;
        edges.push({ from: t.name, fromColumn: col, to: target.name, toColumn: fk.refColumns[i] ?? fk.refColumns[0] ?? "id", kind: "many-to-one", nullable, onDelete: fk.onDelete });
      });
    }
  }
  return { nodes, edges, unresolved };
}

export interface LayoutOptions {
  columnWidth?: number;
  rowHeight?: number;
  headerHeight?: number;
  gapX?: number;
  gapY?: number;
  /** Tables per row; defaults to roughly the square root of the table count (2–4) */
  perRow?: number;
  padding?: number;
}

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Row index (in the table) for each column, by column name */
  rows: Record<string, number>;
}

export interface LayoutEdge extends GraphEdge {
  /** Polyline points in SVG coordinates; the last point is at the referencing (many) side */
  points: Array<{ x: number; y: number }>;
}

export interface SchemaLayout {
  boxes: LayoutBox[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  columnWidth: number;
  rowHeight: number;
  headerHeight: number;
}

/** Referenced tables first, stable on ties; cycles fall back to input order. */
export function orderByDependency(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const remaining = [...nodes];
  const done: GraphNode[] = [];
  const doneIds = new Set<string>();
  while (remaining.length) {
    const idx = remaining.findIndex((n) => edges.filter((e) => e.from === n.id && e.to !== n.id).every((e) => doneIds.has(e.to)));
    const next = remaining.splice(idx < 0 ? 0 : idx, 1)[0];
    done.push(next);
    doneIds.add(next.id);
  }
  return done;
}

/** Deterministic grid layout: dependency-ordered tables placed left-to-right in rows of N. */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], opts: LayoutOptions = {}): SchemaLayout {
  const columnWidth = opts.columnWidth ?? 240;
  const rowHeight = opts.rowHeight ?? 22;
  const headerHeight = opts.headerHeight ?? 30;
  const gapX = opts.gapX ?? 80;
  const gapY = opts.gapY ?? 60;
  const padding = opts.padding ?? 24;
  const ordered = orderByDependency(nodes, edges);
  const perRow = Math.max(1, opts.perRow ?? Math.min(4, Math.max(2, Math.ceil(Math.sqrt(ordered.length)))));

  const boxes: LayoutBox[] = [];
  const byId = new Map<string, LayoutBox>();
  let y = padding;
  for (let r = 0; r * perRow < ordered.length; r++) {
    const rowNodes = ordered.slice(r * perRow, (r + 1) * perRow);
    let rowMax = 0;
    rowNodes.forEach((n, i) => {
      const height = headerHeight + Math.max(1, n.columns.length) * rowHeight;
      const rows: Record<string, number> = Object.create(null);
      n.columns.forEach((c, j) => (rows[c.name] = j));
      const box: LayoutBox = { id: n.id, x: padding + i * (columnWidth + gapX), y, width: columnWidth, height, rows };
      boxes.push(box);
      byId.set(n.id, box);
      rowMax = Math.max(rowMax, height);
    });
    y += rowMax + gapY;
  }
  const width = padding * 2 + Math.min(perRow, ordered.length) * columnWidth + Math.max(0, Math.min(perRow, ordered.length) - 1) * gapX;
  const height = Math.max(padding * 2, y - gapY + padding);

  const rowY = (box: LayoutBox, col: string) => box.y + headerHeight + ((box.rows[col] ?? 0) + 0.5) * rowHeight;
  const layoutEdges: LayoutEdge[] = edges.flatMap((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) return [];
    const y1 = rowY(to, e.toColumn);
    const y2 = rowY(from, e.fromColumn);
    let points: Array<{ x: number; y: number }>;
    if (from === to) {
      // Self reference: loop out of the right edge and back in.
      const x = from.x + from.width;
      points = [
        { x, y: y1 },
        { x: x + gapX / 3, y: y1 },
        { x: x + gapX / 3, y: y2 },
        { x, y: y2 },
      ];
    } else if (Math.abs(from.x - to.x) < 1) {
      // Same column: route along the right side.
      const x = to.x + to.width;
      const bend = x + gapX / 2;
      points = [
        { x, y: y1 },
        { x: bend, y: y1 },
        { x: bend, y: y2 },
        { x, y: y2 },
      ];
    } else {
      const leftToRight = to.x < from.x;
      const xStart = leftToRight ? to.x + to.width : to.x;
      const xEnd = leftToRight ? from.x : from.x + from.width;
      const mid = (xStart + xEnd) / 2;
      points = [
        { x: xStart, y: y1 },
        { x: mid, y: y1 },
        { x: mid, y: y2 },
        { x: xEnd, y: y2 },
      ];
    }
    return [{ ...e, points }];
  });

  return { boxes, edges: layoutEdges, width, height, columnWidth, rowHeight, headerHeight };
}

export interface SchemaStats {
  tables: number;
  columns: number;
  relations: number;
  /** Tables with no incoming or outgoing relation */
  orphans: number;
  orphanNames: string[];
}

export function schemaStats(tables: Table[]): SchemaStats {
  const graph = buildSchemaGraph(tables);
  const connected = new Set<string>();
  for (const e of graph.edges) {
    connected.add(lc(e.from));
    connected.add(lc(e.to));
  }
  const orphanNames = tables.filter((t) => !connected.has(lc(t.name))).map((t) => t.name);
  return {
    tables: tables.length,
    columns: tables.reduce((n, t) => n + t.columns.length, 0),
    relations: tables.reduce((n, t) => n + t.foreignKeys.length, 0),
    orphans: orphanNames.length,
    orphanNames,
  };
}

function mermaidName(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `t_${cleaned || "x"}`;
}

function mermaidType(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_()[\]-]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `t_${cleaned || "x"}`;
}

/** Mermaid `erDiagram` text for the tables (copy into docs, GitHub, Notion…). */
export function toMermaid(tables: Table[]): string {
  const graph = buildSchemaGraph(tables);
  const lines = ["erDiagram"];
  for (const n of graph.nodes) {
    lines.push(`  ${mermaidName(n.id)} {`);
    for (const c of n.columns) {
      const keys = [c.pk ? "PK" : "", c.fk ? "FK" : "", c.unique ? "UK" : ""].filter(Boolean).join(", ");
      const note = c.nullable && !c.pk ? ' "nullable"' : "";
      lines.push(`    ${mermaidType(c.type)} ${mermaidName(c.name)}${keys ? ` ${keys}` : ""}${note}`);
    }
    lines.push("  }");
  }
  for (const e of graph.edges) {
    const oneSide = e.nullable ? "|o" : "||";
    lines.push(`  ${mermaidName(e.to)} ${oneSide}--o{ ${mermaidName(e.from)} : "${mermaidName(e.fromColumn)}"`);
  }
  return lines.join("\n") + "\n";
}
