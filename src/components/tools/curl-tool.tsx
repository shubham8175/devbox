"use client";

import { useMemo, useState } from "react";
import { CURL_SAMPLE, parseCurl, toAxios, toFetch } from "@/lib/tools/curl";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/empty-state";

type Target = "fetch" | "axios" | "node";

const METHOD_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "neutral"> = {
  GET: "success",
  POST: "accent",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "danger",
};

export function CurlTool() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<Target>("fetch");

  const parsed = useMemo(() => (input.trim() ? parseCurl(input) : null), [input]);
  const code = useMemo(() => {
    if (!parsed?.ok) return "";
    if (target === "axios") return toAxios(parsed.value);
    return toFetch(parsed.value, target === "node");
  }, [parsed, target]);

  return (
    <div className="space-y-4">
      <InputPanel
          title="cURL command"
          description="Supports -X, -H, -d/--data*, --json, -F, -u, -A, -e, -b, -G, -I, -L, --compressed and line continuations."
          actions={
            !input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(CURL_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )
          }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="curl -X POST https://api.example.com/items -H 'Content-Type: application/json' -d '{&quot;a&quot;:1}'" className="min-h-[140px]" invalid={parsed ? !parsed.ok : false} aria-label="cURL command" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-3">
            {parsed.error}
          </Alert>
        ) : null}
      </InputPanel>

      {parsed?.ok ? (
        <>
          <Card className="shadow-card">
            <CardHeader title="Request" actions={<Badge tone={METHOD_TONE[parsed.value.method] ?? "neutral"}>{parsed.value.method}</Badge>} />
            <OutputGrid>
              <OutputRow label="URL" value={parsed.value.url} className="sm:col-span-2" />
              <OutputRow label="Method" value={parsed.value.method} />
              <OutputRow label="Body type" value={parsed.value.bodyType ?? "none"} mono={false} copyable={false} />
              {parsed.value.auth ? <OutputRow label="Basic auth user" value={parsed.value.auth.user} /> : null}
              {parsed.value.body !== null ? <OutputRow label="Body" value={parsed.value.body} className="sm:col-span-2" /> : null}
            </OutputGrid>
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Headers ({parsed.value.headers.length})</div>
              {parsed.value.headers.length ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {parsed.value.headers.map((h, i) => (
                    <OutputRow key={`${h.name}-${i}`} label={h.name} value={h.value} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-subtle">No headers.</p>
              )}
            </div>
            {parsed.value.formFields.length ? (
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Form fields</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {parsed.value.formFields.map((f, i) => (
                    <OutputRow key={`${f.name}-${i}`} label={`${f.name}${f.file ? " (file)" : ""}`} value={f.value} />
                  ))}
                </div>
              </div>
            ) : null}
            {parsed.value.warnings.length ? (
              <Alert tone="warning" className="mt-3">
                <ul className="list-disc space-y-0.5 pl-4">
                  {parsed.value.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </Card>

          <OutputPanel
              title="Generated code"
              actions={
                <>
                  <Segmented
                    size="sm"
                    value={target}
                    onChange={setTarget}
                    options={[
                      { value: "fetch", label: "fetch" },
                      { value: "axios", label: "Axios" },
                      { value: "node", label: "Node fetch" },
                    ]}
                  />
                  <CopyButton value={code} label="Copy code" variant="primary" />
                </>
              }
          >
            <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{code}</pre>
          </OutputPanel>
        </>
      ) : !input ? (
        <EmptyState title="Paste a cURL command" description="Copy one from your browser's Network tab (Copy as cURL) or API docs." />
      ) : null}
    </div>
  );
}
