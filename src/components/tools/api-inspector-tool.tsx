"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parseJson, type JsonValue } from "@/lib/tools/json";
import { inspectJson, typeOf, type InspectionReport } from "@/lib/tools/api-inspector";
import { humanSize } from "@/lib/tools/file-size";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const SAMPLE = JSON.stringify(
  {
    data: {
      users: [
        { id: 1, name: "Ada", email: "ada@example.com", tags: ["admin"], profile: { bio: "", avatar: null } },
        { id: 2, name: "Grace", email: "", tags: [], profile: { bio: "Compiler pioneer", avatar: null } },
        { id: 1, name: "Ada (dup)", email: "ada2@example.com", tags: ["dev"], profile: { bio: "", avatar: "https://…" } },
      ],
      pagination: { page: 1, perPage: 50, total: 3, next: null },
    },
    meta: { requestId: "req_9f8e7d", cached: false, timings: { db: 12.4, render: 3.1 } },
  },
  null,
  2,
);

export function ApiInspectorTool() {
  const [input, setInput] = useState("");
  const debouncedInput = useDebounced(input, 200);
  const parsed = useMemo(() => (debouncedInput.trim() ? parseJson(debouncedInput) : null), [debouncedInput]);
  const report = useMemo(() => (parsed?.ok ? inspectJson(parsed.value, debouncedInput) : null), [parsed, debouncedInput]);

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Response JSON"
          actions={
            !input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )
          }
        />
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"data": [...]}' className="min-h-[180px]" invalid={parsed ? !parsed.ok : false} aria-label="JSON response" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-3">
            {parsed.error}
          </Alert>
        ) : null}
      </Card>

      {report && parsed?.ok ? (
        <>
          <Card className="shadow-card">
            <CardHeader title="Overview" actions={<Badge>{report.rootType} root</Badge>} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Size" value={humanSize(report.bytes, "binary")} hint={`${humanSize(report.minifiedBytes, "binary")} minified`} />
              <Stat label="Max depth" value={String(report.depth)} />
              <Stat label="Keys" value={report.keys.toLocaleString()} hint={`${report.uniqueKeys} unique`} />
              <Stat label="Arrays" value={report.arrays.toLocaleString()} hint={report.emptyArrays ? `${report.emptyArrays} empty` : undefined} />
              <Stat label="Nulls" value={report.nulls.toLocaleString()} tone={report.nulls ? "warning" : undefined} />
              <Stat label="Empty strings" value={report.emptyStrings.toLocaleString()} tone={report.emptyStrings ? "warning" : undefined} />
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Value types</div>
              <TypeBar types={report.types} />
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader title="Duplicate IDs" description="Repeated id / _id / uuid / key values inside the same array." actions={<Badge tone={report.duplicateIds.length ? "danger" : "success"}>{report.duplicateIds.length}</Badge>} />
              {report.duplicateIds.length ? (
                <ul className="space-y-1 text-xs">
                  {report.duplicateIds.slice(0, 20).map((d, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border bg-bg-elevated px-2 py-1.5 font-mono">
                      <span className="text-fg-muted">{d.path}</span>
                      <span className="text-danger">
                        {d.key}={d.value}
                      </span>
                      <span className="ml-auto text-fg-subtle">×{d.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-subtle">No duplicate identifiers detected.</p>
              )}
            </Card>
            <Card className="shadow-card">
              <CardHeader title="Large arrays" description={`Arrays with 100+ items.`} actions={<Badge tone={report.largeArrays.length ? "warning" : "success"}>{report.largeArrays.length}</Badge>} />
              {report.largeArrays.length ? (
                <ul className="space-y-1 text-xs">
                  {report.largeArrays.slice(0, 20).map((a, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md border bg-bg-elevated px-2 py-1.5 font-mono">
                      <span className="text-fg-muted">{a.path}</span>
                      <span className="ml-auto text-warning">{a.length.toLocaleString()} items</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-subtle">No large arrays.</p>
              )}
            </Card>
            <PathList title="Null values" paths={report.nullPaths} total={report.nulls} />
            <PathList title="Empty strings" paths={report.emptyStringPaths} total={report.emptyStrings} />
          </div>

          <Card className="shadow-card">
            <CardHeader title="Browse" description="Expand nodes to explore the structure. Click a path to copy it." />
            <div className="max-h-[520px] overflow-auto rounded-lg border bg-bg-elevated p-2 font-mono text-xs">
              <TreeNode value={parsed.value} path="" name="(root)" depth={0} defaultOpen />
            </div>
          </Card>
        </>
      ) : !input ? (
        <EmptyState title="Paste an API response" description="Get size, depth, type breakdown, nulls, duplicates and a browsable tree." />
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" }) {
  return (
    <div className={cn("rounded-lg border bg-bg-elevated px-3 py-2", tone === "warning" && "border-warning/30")}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg", tone === "warning" && "text-warning")}>{value}</div>
      {hint ? <div className="text-[11px] text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  object: "bg-accent",
  array: "bg-accent-strong",
  string: "bg-success",
  number: "bg-warning",
  boolean: "bg-fg-muted",
  null: "bg-danger",
};

function TypeBar({ types }: { types: InspectionReport["types"] }) {
  const total = Object.values(types).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-hover">
        {Object.entries(types).map(([k, v]) => (v ? <div key={k} className={TYPE_COLORS[k]} style={{ width: `${(v / total) * 100}%` }} title={`${k}: ${v}`} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        {Object.entries(types).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", TYPE_COLORS[k])} />
            {k} <span className="font-mono text-fg">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PathList({ title, paths, total }: { title: string; paths: string[]; total: number }) {
  return (
    <Card className="shadow-card">
      <CardHeader title={title} actions={<Badge tone={total ? "warning" : "success"}>{total}</Badge>} />
      {paths.length ? (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-fg-muted">
          {paths.map((p) => (
            <li key={p} className="truncate">
              {p}
            </li>
          ))}
          {total > paths.length ? <li className="text-fg-subtle">…and {total - paths.length} more</li> : null}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">None.</p>
      )}
    </Card>
  );
}

function TreeNode({ value, path, name, depth, defaultOpen }: { value: JsonValue; path: string; name: string; depth: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen || depth < 1);
  const t = typeOf(value);
  const isContainer = t === "object" || t === "array";
  const entries: Array<[string, JsonValue]> = isContainer
    ? Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as [string, JsonValue])
      : Object.entries(value as Record<string, JsonValue>)
    : [];
  const childPath = (key: string) => (Array.isArray(value) ? `${path}[${key}]` : path ? (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}["${key}"]`) : key);

  const summary = isContainer ? (Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`) : null;

  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      <div className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-hover">
        {isContainer ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-4 w-4 items-center justify-center text-fg-subtle cursor-pointer" aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <CopyButton value={path || "(root)"} iconOnly className="hidden h-5 w-5 group-hover:inline-flex" label="Copy path" toastMessage="Path copied" />
        <span className="text-accent-strong">{name}</span>
        <span className="text-fg-subtle">:</span>
        {isContainer ? (
          <span className="text-fg-subtle">
            {summary}
            {!open && entries.length ? " …" : ""}
          </span>
        ) : (
          <Leaf value={value} />
        )}
      </div>
      {isContainer && open
        ? entries.slice(0, 200).map(([k, v]) => <TreeNode key={k} value={v} path={childPath(k)} name={Array.isArray(value) ? k : k} depth={depth + 1} />)
        : null}
      {isContainer && open && entries.length > 200 ? <div className="pl-5 text-fg-subtle">…{entries.length - 200} more items</div> : null}
    </div>
  );
}

function Leaf({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-danger">null</span>;
  if (typeof value === "string") return <span className="break-all text-success">&quot;{value.length > 120 ? `${value.slice(0, 117)}…` : value}&quot;</span>;
  if (typeof value === "number") return <span className="text-warning">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="text-fg-muted">{String(value)}</span>;
  return null;
}
