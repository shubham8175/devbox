"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { OPENAPI_SAMPLE, parseOpenApi, type OpenApiDoc, type Operation, type SchemaSummary } from "@/lib/tools/openapi";
import type { YamlModule } from "@/lib/tools/yaml-json";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Tone = "success" | "accent" | "warning" | "danger" | "neutral";
const METHOD_TONE: Record<string, Tone> = { GET: "success", POST: "accent", PUT: "warning", PATCH: "warning", DELETE: "danger" };
const UNTAGGED = "Untagged";

const PRE = "overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed";
const TH = "px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle";
const TD = "px-2 py-1.5 align-top text-xs";

function ParamTable({ op }: { op: Operation }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr className="border-b">
            <th className={TH}>Name</th>
            <th className={TH}>In</th>
            <th className={TH}>Type</th>
            <th className={TH}>Description</th>
          </tr>
        </thead>
        <tbody>
          {op.parameters.map((p) => (
            <tr key={`${p.in}:${p.name}`} className="border-b last:border-0">
              <td className={cn(TD, "font-mono")}>
                {p.name}
                {p.required ? <span className="text-danger">*</span> : null}
              </td>
              <td className={cn(TD, "text-fg-muted")}>{p.in}</td>
              <td className={cn(TD, "font-mono text-accent-strong")}>{p.type}</td>
              <td className={cn(TD, "text-fg-muted")}>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</div>;
}

function OperationRow({ op, open, onToggle }: { op: Operation; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border bg-bg-elevated">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
        <Badge tone={METHOD_TONE[op.method] ?? "neutral"} className="w-16 justify-center">
          {op.method}
        </Badge>
        <span className={cn("min-w-0 break-all font-mono text-xs text-fg", op.deprecated && "line-through opacity-70")}>{op.path}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{op.summary}</span>
        {op.deprecated ? <Badge tone="warning">deprecated</Badge> : null}
        {op.security.length ? <Badge title={op.security.join(", ")}>auth</Badge> : null}
      </button>
      {open ? (
        <div className="space-y-4 border-t px-3 py-3">
          {op.description || op.operationId ? (
            <p className="text-xs text-fg-muted">
              {op.operationId ? <span className="mr-2 font-mono text-fg">{op.operationId}</span> : null}
              {op.description}
            </p>
          ) : null}
          {op.parameters.length ? (
            <div>
              <SectionLabel>Parameters</SectionLabel>
              <ParamTable op={op} />
            </div>
          ) : null}
          {op.requestBody ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <SectionLabel>{`Request body${op.requestBody.required ? " (required)" : ""}`}</SectionLabel>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {op.requestBody.contentTypes.map((ct) => (
                    <Badge key={ct}>{ct}</Badge>
                  ))}
                </div>
                <pre className={PRE}>{op.requestBody.schema || "(no schema)"}</pre>
              </div>
              {op.requestBody.example ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <SectionLabel>Example</SectionLabel>
                    <CopyButton value={op.requestBody.example} className="-mt-1.5" />
                  </div>
                  <pre className={PRE}>{op.requestBody.example}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {op.responses.length ? (
            <div>
              <SectionLabel>Responses</SectionLabel>
              <div className="space-y-2">
                {op.responses.map((r) => (
                  <div key={r.status} className="rounded-lg border bg-surface p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.status.startsWith("2") ? "success" : r.status.startsWith("4") || r.status.startsWith("5") ? "danger" : "neutral"}>{r.status}</Badge>
                      <span className="text-xs text-fg-muted">{r.description}</span>
                      {r.contentTypes.map((ct) => (
                        <span key={ct} className="font-mono text-[11px] text-fg-subtle">
                          {ct}
                        </span>
                      ))}
                    </div>
                    {r.schema ? <pre className={cn(PRE, "mt-2")}>{r.schema}</pre> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SchemaRow({ schema, open, onToggle }: { schema: SchemaSummary; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border bg-bg-elevated">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />}
        <span className="font-mono text-xs font-semibold text-fg">{schema.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">{schema.type}</span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t px-3 py-3 lg:grid-cols-2">
          <pre className={PRE}>{schema.rendered}</pre>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SectionLabel>Example</SectionLabel>
              <CopyButton value={schema.example} className="-mt-1.5" />
            </div>
            <pre className={PRE}>{schema.example}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OpenapiTool() {
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(true);
  const [filter, setFilter] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [yaml, setYaml] = useState<YamlModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load the YAML parser only on this route; JSON specs work before it arrives.
  useEffect(() => {
    let cancelled = false;
    import("yaml")
      .then((m) => {
        if (!cancelled) setYaml({ parse: (src, opts) => m.parse(src, opts), stringify: (v, opts) => m.stringify(v, opts) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The YAML parser failed to load; JSON specs still work.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doc = useMemo(() => (input.trim() ? parseOpenApi(input, yaml ?? undefined) : null), [input, yaml]);
  const parsed: OpenApiDoc | null = doc?.ok ? doc : null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups = useMemo(() => {
    if (!parsed) return [];
    const q = filter.trim().toLowerCase();
    const ops = parsed.operations.filter((op) => {
      if (tag && !(op.tags.length ? op.tags.includes(tag) : tag === UNTAGGED)) return false;
      if (!q) return true;
      return `${op.method} ${op.path} ${op.summary} ${op.operationId} ${op.description}`.toLowerCase().includes(q);
    });
    const byTag = new Map<string, Operation[]>();
    const order = [...parsed.tags.map((t) => t.name), UNTAGGED];
    for (const op of ops) {
      for (const t of op.tags.length ? op.tags : [UNTAGGED]) byTag.set(t, [...(byTag.get(t) ?? []), op]);
    }
    return order.filter((t) => byTag.has(t)).map((t) => ({ tag: t, description: parsed.tags.find((x) => x.name === t)?.description ?? "", ops: byTag.get(t) ?? [] }));
  }, [parsed, filter, tag]);

  const tagChips = parsed ? [...parsed.tags.map((t) => t.name), ...(parsed.operations.some((o) => !o.tags.length) ? [UNTAGGED] : [])] : [];

  return (
    <div className="space-y-4">
      {editing || !parsed ? (
        <InputPanel
          title="Spec"
          description="OpenAPI 3.x or Swagger 2.0, as JSON or YAML. Parsed locally; nothing is uploaded."
          actions={
            <>
              {parsed ? (
                <Button size="sm" onClick={() => setEditing(false)}>
                  Done
                </Button>
              ) : null}
              {!input ? (
                <Button size="sm" variant="ghost" onClick={() => setInput(OPENAPI_SAMPLE)}>
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
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"openapi: 3.0.0\ninfo:\n  title: My API\npaths: …"} className="min-h-[260px]" invalid={doc ? !doc.ok : false} aria-label="OpenAPI document" />
          {doc && !doc.ok ? (
            <Alert tone="danger" className="mt-2">
              {doc.error}
            </Alert>
          ) : null}
          {loadError ? (
            <Alert tone="warning" className="mt-2">
              {loadError}
            </Alert>
          ) : null}
        </InputPanel>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2">
          <span className="text-xs text-fg-muted">
            {input.length.toLocaleString()} chars · {parsed.version}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit spec
          </Button>
        </div>
      )}

      {!parsed ? (
        !input ? (
          <EmptyState title="Paste a spec to browse it" description="Endpoints are grouped by tag; click one to see its parameters, body, responses and an example." />
        ) : null
      ) : (
        <>
          <Card className="shadow-card">
            <CardHeader title={parsed.info.title || "Untitled API"} description={parsed.info.description} actions={<Badge tone="accent">{parsed.version}</Badge>} />
            <div className="grid gap-2 sm:grid-cols-2">
              <OutputRow label="API version" value={parsed.info.version} />
              <OutputRow label="Operations" value={`${parsed.operations.length}`} copyable={false} />
              {parsed.servers.map((s) => (
                <OutputRow key={s} label="Server" value={s} className="sm:col-span-2" />
              ))}
            </div>
            {parsed.securitySchemes.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {parsed.securitySchemes.map((s) => (
                  <Badge key={s.name} title={s.description}>
                    {s.name}: {s.type}
                    {s.detail ? ` · ${s.detail}` : ""}
                  </Badge>
                ))}
              </div>
            ) : null}
            {parsed.warnings.length ? (
              <Alert tone="warning" className="mt-3">
                <ul className="list-disc space-y-0.5 pl-4">
                  {parsed.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </Card>

          <Card className="shadow-card">
            <CardHeader
              title="Endpoints"
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(parsed.operations.map((o) => o.id)))}>
                    Expand all
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
                    Collapse
                  </Button>
                </>
              }
            />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by path, method, summary or operationId" aria-label="Filter endpoints" />
            {tagChips.length > 1 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tagChips.map((t) => (
                  <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t} className="cursor-pointer">
                    <Badge tone={tag === t ? "accent" : "neutral"}>{t}</Badge>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-3 space-y-4">
              {groups.length ? (
                groups.map((g) => (
                  <div key={g.tag}>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <h3 className="text-sm font-semibold text-fg">{g.tag}</h3>
                      {g.description ? <span className="text-xs text-fg-subtle">{g.description}</span> : null}
                    </div>
                    <div className="space-y-1.5">
                      {g.ops.map((op) => (
                        <OperationRow key={op.id} op={op} open={expanded.has(op.id)} onToggle={() => toggle(op.id)} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No endpoints match" className="py-8" />
              )}
            </div>
          </Card>

          {parsed.schemas.length ? (
            <Card className="shadow-card">
              <CardHeader title="Schemas" description={`${parsed.schemas.length} in components`} />
              <div className="space-y-1.5">
                {parsed.schemas.map((s) => (
                  <SchemaRow key={s.name} schema={s} open={expanded.has(`schema:${s.name}`)} onToggle={() => toggle(`schema:${s.name}`)} />
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
