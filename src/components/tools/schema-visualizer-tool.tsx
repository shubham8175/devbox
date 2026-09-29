"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { DDL_SAMPLE, PRISMA_SAMPLE, parseDdl, parsePrismaSchema } from "@/lib/tools/ddl";
import { buildSchemaGraph, layoutGraph, schemaStats, toMermaid, type SchemaLayout } from "@/lib/tools/schema-visualizer";
import { downloadBlob } from "@/lib/tools/canvas";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Source = "sql" | "prisma";
type View = "diagram" | "mermaid";

export function SchemaVisualizerTool() {
  const [source, setSource] = useState<Source>("sql");
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>("diagram");

  const debounced = useDebounced(input, 200);
  const parsed = useMemo(() => {
    if (!debounced.trim()) return null;
    return source === "sql" ? parseDdl(debounced) : parsePrismaSchema(debounced);
  }, [debounced, source]);

  const model = useMemo(() => {
    if (!parsed?.ok) return null;
    const graph = buildSchemaGraph(parsed.tables);
    const layout = layoutGraph(graph.nodes, graph.edges);
    return { graph, layout, stats: schemaStats(parsed.tables), mermaid: toMermaid(parsed.tables) };
  }, [parsed]);

  const downloadSvg = () => {
    const svg = document.getElementById("schema-visualizer-svg");
    if (!svg) return;
    // Serialised from the rendered element; nothing is uploaded.
    const text = new XMLSerializer().serializeToString(svg);
    downloadBlob(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), "schema.svg");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <InputPanel
        className="xl:col-span-2"
        title={source === "sql" ? "SQL DDL" : "Prisma schema"}
        description={source === "sql" ? "CREATE TABLE statements with primary and foreign keys." : "model and enum blocks, including @relation fields."}
        actions={
          <>
            <Segmented
              size="sm"
              value={source}
              onChange={(s) => {
                setSource(s);
                setInput("");
              }}
              options={[
                { value: "sql", label: "SQL DDL" },
                { value: "prisma", label: "Prisma" },
              ]}
            />
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(source === "sql" ? DDL_SAMPLE : PRISMA_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )}
          </>
        }
      >
        <CodeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={source === "sql" ? "CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);" : "model User {\n  id    Int    @id @default(autoincrement())\n  email String @unique\n}"}
          className="min-h-[480px]"
          invalid={parsed ? !parsed.ok : false}
          aria-label="Schema input"
        />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : null}
        {parsed?.ok && parsed.warnings.length ? (
          <Alert tone="info" className="mt-2">
            <ul className="list-disc space-y-0.5 pl-4">
              {parsed.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {model ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="success">{model.stats.tables} tables</Badge>
            <Badge>{model.stats.columns} columns</Badge>
            <Badge>{model.stats.relations} relations</Badge>
            {model.stats.orphans ? <Badge tone="warning">{model.stats.orphans} without relations</Badge> : null}
            {model.graph.unresolved.length ? <Badge tone="warning">{model.graph.unresolved.length} unresolved references</Badge> : null}
          </div>
        ) : null}
        <p className="mt-3 text-[11px] text-fg-subtle">Parsed in your browser. Nothing leaves this page and nothing is stored.</p>
      </InputPanel>

      <OutputPanel
        className="xl:col-span-3"
        title={view === "diagram" ? "Entity relationship diagram" : "Mermaid erDiagram"}
        description={view === "diagram" ? "PK primary key, FK foreign key, ? nullable. Lines end at the referencing (many) side." : "Paste into GitHub, Notion or any Mermaid renderer."}
        actions={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "diagram", label: "Diagram" },
                { value: "mermaid", label: "Mermaid" },
              ]}
            />
            {view === "diagram" ? (
              <Button size="sm" onClick={downloadSvg} disabled={!model} title="Download SVG">
                <Download className="h-3.5 w-3.5" /> SVG
              </Button>
            ) : (
              <CopyButton value={model?.mermaid ?? ""} variant="primary" />
            )}
          </>
        }
      >
        {!model ? (
          <EmptyState title="Paste a schema to draw it" description="Tables become boxes with their columns; foreign keys become lines between them." />
        ) : view === "mermaid" ? (
          <pre className="max-h-[600px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">{model.mermaid}</pre>
        ) : (
          <div className="overflow-auto rounded-lg border bg-bg-elevated">
            <SchemaSvg layout={model.layout} nodes={model.graph.nodes} />
          </div>
        )}
        {model && model.graph.unresolved.length ? (
          <Alert tone="warning" className="mt-3">
            References to tables not in the input: {model.graph.unresolved.join(", ")}.
          </Alert>
        ) : null}
      </OutputPanel>
    </div>
  );
}

function SchemaSvg({ layout, nodes }: { layout: SchemaLayout; nodes: ReturnType<typeof buildSchemaGraph>["nodes"] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { headerHeight, rowHeight } = layout;
  return (
    <svg
      id="schema-visualizer-svg"
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label="Entity relationship diagram"
      className="block text-fg"
      style={{ minWidth: layout.width }}
    >
      <defs>
        <marker id="schema-many" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M1 1 L9 5 L1 9" className="fill-none stroke-fg-muted" strokeWidth="1.25" />
        </marker>
      </defs>
      {layout.edges.map((e, i) => (
        <polyline
          key={`${e.from}.${e.fromColumn}-${e.to}.${e.toColumn}-${i}`}
          points={e.points.map((p) => `${p.x},${p.y}`).join(" ")}
          className="fill-none stroke-fg-muted"
          strokeWidth="1.25"
          strokeDasharray={e.nullable ? "4 3" : undefined}
          markerEnd="url(#schema-many)"
        />
      ))}
      {layout.edges.map((e, i) => (
        <circle key={`dot-${i}`} cx={e.points[0].x} cy={e.points[0].y} r="3" className="fill-accent stroke-none" />
      ))}
      {layout.boxes.map((box) => {
        const node = byId.get(box.id);
        if (!node) return null;
        return (
          <g key={box.id} transform={`translate(${box.x} ${box.y})`}>
            <rect width={box.width} height={box.height} rx="8" className="fill-surface stroke-border" strokeWidth="1" />
            <path d={`M0 ${headerHeight} H${box.width}`} className="stroke-border" strokeWidth="1" />
            <text x={12} y={headerHeight / 2 + 4} className="fill-fg" fontSize="12" fontWeight="600" fontFamily="var(--font-mono), ui-monospace, monospace">
              {node.schema ? `${node.schema}.${node.name}` : node.name}
            </text>
            {node.columns.map((c, j) => {
              const y = headerHeight + j * rowHeight + rowHeight / 2 + 4;
              const tag = c.pk ? "PK" : c.fk ? "FK" : c.unique ? "UQ" : "";
              return (
                <g key={c.name}>
                  {tag ? (
                    <text x={10} y={y} fontSize="9" fontWeight="600" fontFamily="var(--font-mono), ui-monospace, monospace" className={c.pk ? "fill-accent" : "fill-fg-muted"}>
                      {tag}
                    </text>
                  ) : null}
                  <text x={32} y={y} fontSize="11" fontFamily="var(--font-mono), ui-monospace, monospace" className="fill-fg">
                    {c.name}
                    {c.nullable ? "?" : ""}
                  </text>
                  <text x={box.width - 10} y={y} fontSize="10" textAnchor="end" fontFamily="var(--font-mono), ui-monospace, monospace" className="fill-fg-subtle">
                    {c.type.length > 18 ? `${c.type.slice(0, 17)}…` : c.type}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
