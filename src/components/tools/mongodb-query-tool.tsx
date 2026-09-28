"use client";

import { useMemo, useState } from "react";
import { MONGO_EXAMPLES, normalizeMongo } from "@/lib/tools/mongodb-query";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type View = "shell" | "json";

const KIND_LABEL = { find: "find query", aggregate: "aggregation pipeline", document: "document", unknown: "" } as const;

export function MongodbQueryTool() {
  const [input, setInput] = useState("");
  const [view, setView] = useState<View>("shell");

  const result = useMemo(() => (input.trim() ? normalizeMongo(input) : null), [input]);
  const output = result?.ok ? (view === "shell" ? result.shell : result.json) : "";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Query"
        description="Shell syntax is fine: unquoted keys, single quotes, trailing commas, comments, ObjectId(), ISODate(), NumberLong()."
        actions={
          input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          ) : null
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MONGO_EXAMPLES.map((ex) => (
            <button key={ex.label} type="button" onClick={() => setInput(ex.code)} className="rounded-md border bg-bg-elevated px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
              {ex.label}
            </button>
          ))}
        </div>
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="db.orders.find({ status: 'paid', total: { $gte: 100 } })" className="min-h-[340px]" invalid={result ? !result.ok : false} aria-label="MongoDB query" />
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-2">
            {result.error}
            {result.position !== undefined && result.position >= 0 ? <span className="ml-1 opacity-80">(at character {result.position + 1})</span> : null}
          </Alert>
        ) : result?.ok ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="success">Valid {KIND_LABEL[result.kind]}</Badge>
            {result.collection ? <Badge>collection: {result.collection}</Badge> : null}
          </div>
        ) : null}
      </InputPanel>

      <OutputPanel
        title="Formatted"
        description={view === "shell" ? "mongosh-style with wrappers preserved." : "Strict JSON (MongoDB Extended JSON for ObjectId, dates, longs)."}
        actions={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "shell", label: "Shell" },
                { value: "json", label: "Strict JSON" },
              ]}
            />
            <CopyButton value={output} variant="primary" />
          </>
        }
      >
        {output ? (
          <pre className="max-h-[520px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{output}</pre>
        ) : (
          <EmptyState title="Paste a query or pipeline" description="Pick an example above to see find, aggregate, $match, $group, $lookup and $project." />
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">Formatting only. Nothing connects to a database.</p>
      </OutputPanel>
    </div>
  );
}
