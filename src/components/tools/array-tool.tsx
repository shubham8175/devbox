"use client";

import { useMemo, useState } from "react";
import { parseJson, type JsonValue } from "@/lib/tools/json";
import { ARRAY_SAMPLE, countDuplicates, extractProperty, filterEmpty, findDuplicateIds, groupBy, removeDuplicates, reverseArray, sortArray, stats } from "@/lib/tools/array";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Action = "dedupe" | "sort-asc" | "sort-desc" | "reverse" | "group" | "extract" | "filter-empty" | "count-dupes" | "dupe-ids";

const ACTIONS: Array<{ id: Action; label: string; needsPath?: boolean; hint: string }> = [
  { id: "dedupe", label: "Remove duplicates", hint: "By whole item, or by the property path if given" },
  { id: "sort-asc", label: "Sort A → Z", hint: "Natural sort by item or property" },
  { id: "sort-desc", label: "Sort Z → A", hint: "Reverse natural sort" },
  { id: "reverse", label: "Reverse", hint: "Reverse the order" },
  { id: "group", label: "Group by", needsPath: true, hint: "Object keyed by the property value" },
  { id: "extract", label: "Extract property", needsPath: true, hint: "Array of just that property" },
  { id: "filter-empty", label: "Filter empty", hint: "Drop null, empty strings, {} and []" },
  { id: "count-dupes", label: "Count duplicates", hint: "Which values repeat and how often" },
  { id: "dupe-ids", label: "Find duplicate IDs", hint: "Auto-detects id / _id / uuid / key" },
];

export function ArrayTool() {
  const [input, setInput] = useState("");
  const [path, setPath] = useState("");
  const [action, setAction] = useState<Action>("dedupe");

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);
  const arr = parsed?.ok && Array.isArray(parsed.value) ? (parsed.value as JsonValue[]) : null;
  const meta = ACTIONS.find((a) => a.id === action)!;

  const result = useMemo(() => {
    if (!arr) return null;
    const p = path.trim();
    if (meta.needsPath && !p) return { ok: false as const, error: "Enter a property path for this action, e.g. user.id" };
    try {
      let out: JsonValue;
      let summary = "";
      switch (action) {
        case "dedupe": {
          const r = removeDuplicates(arr, p);
          out = r;
          summary = `${arr.length - r.length} removed · ${r.length} left`;
          break;
        }
        case "sort-asc":
          out = sortArray(arr, p, "asc");
          summary = p ? `sorted by ${p}` : "sorted";
          break;
        case "sort-desc":
          out = sortArray(arr, p, "desc");
          summary = p ? `sorted by ${p}, descending` : "sorted descending";
          break;
        case "reverse":
          out = reverseArray(arr);
          summary = `${arr.length} items`;
          break;
        case "group": {
          const g = groupBy(arr, p);
          out = g;
          summary = `${Object.keys(g).length} groups`;
          break;
        }
        case "extract":
          out = extractProperty(arr, p);
          summary = `${arr.length} values (missing → null)`;
          break;
        case "filter-empty": {
          const r = filterEmpty(arr, p);
          out = r;
          summary = `${arr.length - r.length} removed · ${r.length} left`;
          break;
        }
        case "count-dupes": {
          const d = countDuplicates(arr, p);
          out = d.map((x) => ({ value: x.value ?? null, count: x.count, indexes: x.indexes }));
          summary = d.length ? `${d.length} repeated ${d.length === 1 ? "value" : "values"}` : "no duplicates";
          break;
        }
        case "dupe-ids": {
          const r = findDuplicateIds(arr, p);
          if (!r.key) return { ok: false as const, error: "Couldn't detect an id-like property. Enter a path such as id or user.id." };
          out = r.duplicates.map((x) => ({ [r.key!]: x.value ?? null, count: x.count, indexes: x.indexes }));
          summary = r.duplicates.length ? `${r.duplicates.length} duplicate ${r.key} ${r.duplicates.length === 1 ? "value" : "values"}` : `all ${r.key} values are unique`;
          break;
        }
      }
      return { ok: true as const, output: JSON.stringify(out, null, 2), summary };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Action failed." };
    }
  }, [arr, action, path, meta.needsPath]);

  const s = arr ? stats(arr) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InputPanel
        title="JSON array"
        description={s ? `${s.length} items · ${s.types.map(([t, n]) => `${n} ${t}`).join(", ")}` : undefined}
        className="lg:col-span-3"
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(ARRAY_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder='[{"id": 1}, {"id": 2}]' className="min-h-[300px]" invalid={parsed ? !parsed.ok || !Array.isArray(parsed.value) : false} aria-label="JSON array" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : parsed?.ok && !Array.isArray(parsed.value) ? (
          <Alert tone="danger" className="mt-2">
            The top-level value must be an array.
          </Alert>
        ) : null}
        <div className="mt-4">
          <Label htmlFor="arr-path" hint="dot / bracket notation">
            Property path {meta.needsPath ? "(required)" : "(optional)"}
          </Label>
          <Input id="arr-path" mono value={path} onChange={(e) => setPath(e.target.value)} placeholder="user.id · items[0].sku" className="max-w-sm" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAction(a.id)}
              title={a.hint}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                action === a.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </InputPanel>

      <OutputPanel
        title={meta.label}
        description={result?.ok ? result.summary : meta.hint}
        className="lg:col-span-2"
        actions={
          <>
            <Button size="sm" onClick={() => result?.ok && setInput(result.output)} disabled={!result?.ok || action === "group" || action === "count-dupes" || action === "dupe-ids"} title="Replace input with this output">
              Use as input
            </Button>
            <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
          </>
        }
      >
        {!arr ? (
          <EmptyState title="Paste a JSON array" description="Then pick an action. Paths like user.id reach into nested objects." />
        ) : result?.ok ? (
          <CodeTextarea readOnly value={result.output} className="min-h-[380px] bg-surface" counter={false} aria-label="Output" />
        ) : (
          <Alert tone="warning">{result?.error}</Alert>
        )}
        {arr ? (
          <div className="mt-3">
            <Badge>{arr.length} input items</Badge>
          </div>
        ) : null}
      </OutputPanel>
    </div>
  );
}
