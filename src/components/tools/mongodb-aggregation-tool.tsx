"use client";

import { useMemo, useState } from "react";
import { AGGREGATION_SAMPLE, explainPipeline } from "@/lib/tools/mongodb-aggregation";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type View = "stages" | "formatted";

export function MongodbAggregationTool() {
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>("stages");

  const result = useMemo(() => (input.trim() ? explainPipeline(input) : null), [input]);
  const warnings = result?.ok ? result.hints.filter((h) => h.level === "warning") : [];
  const infos = result?.ok ? result.hints.filter((h) => h.level === "info") : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Pipeline"
        description="Paste a pipeline array or a full db.collection.aggregate([...]) call. Shell syntax is fine: unquoted keys, single quotes, ISODate(), ObjectId()."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(AGGREGATION_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'[\n  { $match: { status: "paid" } },\n  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },\n  { $sort: { total: -1 } },\n]'}
          className="min-h-[380px]"
          invalid={result ? !result.ok : false}
          aria-label="Aggregation pipeline"
        />
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-2">
            {result.error}
            {result.position !== undefined && result.position >= 0 ? <span className="ml-1 opacity-80">(at character {result.position + 1})</span> : null}
          </Alert>
        ) : result?.ok ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="success">
              {result.stageCount} {result.stageCount === 1 ? "stage" : "stages"}
            </Badge>
            {result.collection ? <Badge>collection: {result.collection}</Badge> : null}
            {result.fieldsUsed.length ? <Badge>{result.fieldsUsed.length} fields referenced</Badge> : null}
            {warnings.length ? <Badge tone="warning">{warnings.length} performance {warnings.length === 1 ? "hint" : "hints"}</Badge> : null}
          </div>
        ) : null}
        <p className="mt-3 text-[11px] text-fg-subtle">Nothing is executed against a database. Analysis runs in your browser.</p>
      </InputPanel>

      <OutputPanel
        title={view === "stages" ? "Explanation" : "Formatted pipeline"}
        actions={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "stages", label: "Stages" },
                { value: "formatted", label: "Formatted" },
              ]}
            />
            <CopyButton value={result?.ok ? result.formatted : ""} variant="primary" />
          </>
        }
      >
        {!result ? (
          <EmptyState title="Paste a pipeline to explain it" description="Each stage is described in plain English, and patterns that stop MongoDB using an index or that scan more than needed are flagged." />
        ) : !result.ok ? (
          <EmptyState title="Fix the pipeline to see the explanation" className="py-8" />
        ) : view === "formatted" ? (
          <pre className="max-h-[560px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">{result.formatted}</pre>
        ) : (
          <div className="space-y-4">
            {warnings.length || infos.length ? (
              <div className="space-y-2">
                {warnings.map((h, i) => (
                  <Alert key={`w${i}`} tone="warning">
                    {h.stage !== null ? <span className="mr-1 font-mono">stage {h.stage + 1}:</span> : null}
                    {h.message}
                  </Alert>
                ))}
                {infos.map((h, i) => (
                  <Alert key={`i${i}`} tone="info">
                    {h.stage !== null ? <span className="mr-1 font-mono">stage {h.stage + 1}:</span> : null}
                    {h.message}
                  </Alert>
                ))}
              </div>
            ) : (
              <Alert tone="success">No performance concerns found in this pipeline.</Alert>
            )}
            <ol className="space-y-2">
              {result.stages.map((s) => (
                <li key={s.index} className={cn("rounded-lg border bg-bg-elevated p-3", s.tone === "warning" && "border-warning/40")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-hover font-mono text-[11px] text-fg-muted">{s.index + 1}</span>
                    <Badge tone={s.tone === "warning" ? "warning" : "accent"} className="font-mono">
                      {s.operator}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-fg">{s.summary}</p>
                  {s.details.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.details.map((d) => (
                        <span key={d} className="rounded border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        )}
      </OutputPanel>
    </div>
  );
}
