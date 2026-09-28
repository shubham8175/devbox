"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { GitCompare } from "lucide-react";
import { parseJson } from "@/lib/tools/json";
import { diffJson, previewValue, summarizeDiff, type DiffEntry, type DiffKind } from "@/lib/tools/json-diff";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SAMPLE_A = `{
  "user": { "name": "Ada", "role": "admin", "age": 36 },
  "items": [
    { "sku": "A1", "price": 10 },
    { "sku": "B2", "price": 20 }
  ],
  "active": true
}`;
const SAMPLE_B = `{
  "user": { "name": "Ada", "role": "owner", "email": "ada@example.com" },
  "items": [
    { "sku": "A1", "price": 10 },
    { "sku": "B2", "price": 25 },
    { "sku": "C3", "price": 5 }
  ],
  "active": true
}`;

const KIND_META: Record<DiffKind, { label: string; tone: "success" | "danger" | "warning" | "neutral"; row: string }> = {
  added: { label: "Added", tone: "success", row: "border-l-success" },
  removed: { label: "Removed", tone: "danger", row: "border-l-danger" },
  changed: { label: "Changed", tone: "warning", row: "border-l-warning" },
  unchanged: { label: "Unchanged", tone: "neutral", row: "border-l-border-strong" },
};

/** Each entry is a DOM row; very large diffs are truncated in the view (the summary still counts everything). */
const MAX_RENDERED_ENTRIES = 1000;

export function JsonDiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [showUnchanged, setShowUnchanged] = useState(false);

  const debouncedA = useDebounced(a, 200);
  const debouncedB = useDebounced(b, 200);
  const parsedA = useMemo(() => (debouncedA.trim() ? parseJson(debouncedA) : null), [debouncedA]);
  const parsedB = useMemo(() => (debouncedB.trim() ? parseJson(debouncedB) : null), [debouncedB]);

  const entries = useMemo<DiffEntry[] | null>(() => {
    if (parsedA?.ok && parsedB?.ok) return diffJson(parsedA.value, parsedB.value);
    return null;
  }, [parsedA, parsedB]);

  const summary = entries ? summarizeDiff(entries) : null;
  const allVisible = entries?.filter((e) => showUnchanged || e.kind !== "unchanged") ?? [];
  const visible = allVisible.slice(0, MAX_RENDERED_ENTRIES);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <JsonInput
          id="json-a"
          label="JSON A"
          value={a}
          onChange={setA}
          error={parsedA && !parsedA.ok ? parsedA.error : null}
        />
        <JsonInput
          id="json-b"
          label="JSON B"
          value={b}
          onChange={setB}
          error={parsedB && !parsedB.ok ? parsedB.error : null}
        />
      </div>

      <Card>
        <CardHeader
          title="Differences"
          description="Paths use dot and bracket notation, e.g. items[2].price."
          actions={
            <>
              {!a && !b ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setA(SAMPLE_A);
                    setB(SAMPLE_B);
                  }}
                >
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setA("");
                    setB("");
                  }}
                >
                  Clear both
                </Button>
              )}
              <Button size="sm" onClick={() => setShowUnchanged((s) => !s)} disabled={!entries}>
                {showUnchanged ? "Hide unchanged" : "Show unchanged"}
              </Button>
            </>
          }
        />

        {summary ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(KIND_META) as DiffKind[]).map((k) => (
              <Badge key={k} tone={KIND_META[k].tone}>
                {summary[k]} {KIND_META[k].label.toLowerCase()}
              </Badge>
            ))}
            {summary.added + summary.removed + summary.changed === 0 ? (
              <Badge tone="success">Documents are identical</Badge>
            ) : null}
          </div>
        ) : null}

        {!entries ? (
          <EmptyState
            icon={GitCompare}
            title="Waiting for two valid JSON documents"
            description="Paste JSON into both inputs above to see what changed."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="No differences" description="Both documents are structurally identical." />
        ) : (
          <ul className="space-y-1.5">
            {visible.map((e, i) => {
              const meta = KIND_META[e.kind];
              return (
                <li
                  key={`${e.path}-${i}`}
                  className={cn("rounded-lg border border-l-2 bg-bg-elevated px-3 py-2 text-sm", meta.row)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="min-w-0 break-all font-mono text-xs text-fg">{e.path}</span>
                  </div>
                  <div className="mt-1.5 grid gap-1 font-mono text-xs sm:grid-cols-2">
                    {e.kind !== "added" ? (
                      <div className={cn("break-all rounded-md px-2 py-1", e.kind === "unchanged" ? "bg-surface-hover text-fg-muted" : "bg-danger-soft text-danger")}>
                        {e.kind !== "unchanged" ? "− " : ""}
                        {previewValue(e.before)}
                      </div>
                    ) : (
                      <div />
                    )}
                    {e.kind !== "removed" && e.kind !== "unchanged" ? (
                      <div className="break-all rounded-md bg-success-soft px-2 py-1 text-success">+ {previewValue(e.after)}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {allVisible.length > visible.length ? (
              <li className="px-3 py-2 text-xs text-fg-subtle">Showing the first {MAX_RENDERED_ENTRIES.toLocaleString()} of {allVisible.length.toLocaleString()} entries.</li>
            ) : null}
          </ul>
        )}
      </Card>
    </div>
  );
}

function JsonInput({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <Card>
      <Label htmlFor={id} hint={`${value.length.toLocaleString()} chars`}>
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="{ ... }"
        className="min-h-[220px]"
        invalid={!!error}
      />
      {error ? (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </Card>
  );
}
