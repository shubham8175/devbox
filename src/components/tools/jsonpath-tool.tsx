"use client";

import { useMemo, useState } from "react";
import { parseJson } from "@/lib/tools/json";
import { JSONPATH_EXAMPLES, JSONPATH_SAMPLE, queryJsonPath } from "@/lib/tools/jsonpath";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

export function JsonpathTool() {
  const [input, setInput] = useState("");
  const [expr, setExpr] = useState("$.users[*].name");

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);
  const result = useMemo(() => (parsed?.ok ? queryJsonPath(parsed.value, expr) : null), [parsed, expr]);
  const valuesJson = result?.ok ? JSON.stringify(result.matches.map((m) => m.value), null, 2) : "";

  return (
    <div className="space-y-4">
      <InputPanel
        title="Expression"
        description="A safe JSONPath subset: child, index, slice, wildcard, union, recursive descent (..) and filters. No code is evaluated."
        actions={<CopyButton value={expr} label="Copy expression" />}
      >
        <Label htmlFor="jp-expr">JSONPath</Label>
        <Input id="jp-expr" mono value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="$.users[?(@.active)].email" className="h-11 text-base" invalid={result ? !result.ok : false} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {JSONPATH_EXAMPLES.map((ex) => (
            <button key={ex.expr} type="button" onClick={() => setExpr(ex.expr)} title={ex.label} className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
              {ex.expr}
            </button>
          ))}
        </div>
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </InputPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title="JSON"
          actions={
            !input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(JSONPATH_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )
          }
        >
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"users": [{"name": "Ada"}]}' className="min-h-[320px]" invalid={parsed ? !parsed.ok : false} aria-label="JSON document" />
          {parsed && !parsed.ok ? (
            <Alert tone="danger" className="mt-2">
              {parsed.error}
            </Alert>
          ) : null}
        </InputPanel>

        <OutputPanel
          title="Matches"
          actions={
            <>
              {result?.ok ? <Badge tone={result.matches.length ? "accent" : "neutral"}>{result.matches.length} {result.matches.length === 1 ? "match" : "matches"}</Badge> : null}
              <CopyButton value={valuesJson} label="Copy values" variant="primary" />
            </>
          }
        >
          {!parsed?.ok ? (
            <EmptyState title="Paste a JSON document" description="Matches and their paths appear here as you type." />
          ) : !result?.ok ? (
            <EmptyState title="Fix the expression" description="See the error above." className="py-8" />
          ) : result.matches.length === 0 ? (
            <EmptyState title="No matches" description="The expression is valid but selected nothing." className="py-8" />
          ) : (
            <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {result.matches.slice(0, 500).map((m, i) => {
                const v = JSON.stringify(m.value);
                return (
                  <li key={`${m.path}-${i}`} className="rounded-lg border bg-bg-elevated px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-accent-strong">{m.path}</span>
                      <CopyButton value={v} iconOnly />
                    </div>
                    <div className="mt-1 break-all font-mono text-xs">{v.length > 300 ? `${v.slice(0, 297)}…` : v}</div>
                  </li>
                );
              })}
              {result.matches.length > 500 ? <li className="text-xs text-fg-subtle">…and {result.matches.length - 500} more (copy values to get all)</li> : null}
            </ul>
          )}
        </OutputPanel>
      </div>
    </div>
  );
}
