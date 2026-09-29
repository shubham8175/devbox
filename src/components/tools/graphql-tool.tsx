"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { AlignLeft, Minimize2 } from "lucide-react";
import { analyzeGraphql, formatGraphql, GRAPHQL_SAMPLE, GRAPHQL_SCHEMA_SAMPLE, minifyGraphql, type PrettierModule } from "@/lib/tools/graphql";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Mode = "format" | "minify";
type Result = { ok: true; output: string } | { ok: false; error: string };

export function GraphqlTool() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("format");
  const [prettier, setPrettier] = useState<PrettierModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Keyed by source text so a stale result is ignored instead of being reset inside the effect.
  const [formatted, setFormatted] = useState<{ source: string; result: Result } | null>(null);

  // Lazy-load Prettier and its GraphQL plugin only on this route.
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("prettier/standalone"), import("prettier/plugins/graphql")])
      .then(([p, graphqlPlugin]) => {
        if (!cancelled) setPrettier({ format: (src) => p.format(src, { parser: "graphql", plugins: [graphqlPlugin] }) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The GraphQL formatter failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const debouncedInput = useDebounced(input, 250);

  // Prettier is async, so the formatted output lives in state; results for other inputs are discarded.
  useEffect(() => {
    if (mode !== "format" || !prettier || !debouncedInput.trim()) return;
    let cancelled = false;
    const source = debouncedInput;
    formatGraphql(prettier, source).then((result) => {
      if (!cancelled) setFormatted({ source, result });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, prettier, debouncedInput]);
  const formatResult = formatted && formatted.source === debouncedInput ? formatted.result : null;

  const minified = useMemo<Result | null>(() => {
    if (mode !== "minify" || !debouncedInput.trim()) return null;
    try {
      return { ok: true, output: minifyGraphql(debouncedInput) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not minify this document." };
    }
  }, [mode, debouncedInput]);

  const result = mode === "format" ? formatResult : minified;
  const analysis = useMemo(() => (debouncedInput.trim() ? analyzeGraphql(debouncedInput) : null), [debouncedInput]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title="GraphQL"
          description="Queries, mutations, fragments or SDL schemas. Nothing is sent anywhere."
          actions={
            !input ? (
              <Select value="" onChange={(e) => setInput(e.target.value === "schema" ? GRAPHQL_SCHEMA_SAMPLE : GRAPHQL_SAMPLE)} aria-label="Load sample" className="w-40">
                <option value="" disabled>
                  Load sample…
                </option>
                <option value="query">Query + fragment</option>
                <option value="schema">Schema (SDL)</option>
              </Select>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )
          }
        >
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"query GetUser($id: ID!) {\n  user(id: $id) { id name }\n}"} className="min-h-[360px]" invalid={result ? !result.ok : false} aria-label="GraphQL input" />
          {result && !result.ok ? (
            <Alert tone="danger" className="mt-2">
              {result.error}
            </Alert>
          ) : null}
        </InputPanel>

        <OutputPanel
          title={mode === "format" ? "Formatted" : "Minified"}
          actions={
            <>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "format", label: "Format" },
                  { value: "minify", label: "Minify" },
                ]}
              />
              <Button size="sm" onClick={() => result?.ok && setInput(result.output)} disabled={!result?.ok} title="Replace input with output">
                {mode === "format" ? <AlignLeft className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />} Apply
              </Button>
              <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
            </>
          }
        >
          {loadError && mode === "format" ? (
            <Alert tone="danger">{loadError}</Alert>
          ) : !input.trim() ? (
            <EmptyState title="Paste GraphQL to format" description="Operations are pretty-printed with Prettier; Minify strips comments, commas and whitespace for sending over the wire." />
          ) : mode === "format" && (!prettier || (!formatResult && !loadError)) ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-4 w-40 skeleton" />
              <div className="h-[340px] skeleton" />
              <p className="text-xs text-fg-subtle">{prettier ? "Formatting…" : "Loading formatter…"}</p>
            </div>
          ) : result?.ok ? (
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{result.output}</pre>
          ) : (
            <EmptyState title="Fix the document to see output" className="py-8" />
          )}
          {result?.ok ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{result.output.length.toLocaleString()} chars</Badge>
              {mode === "minify" && input.length ? <Badge tone="success">{Math.round((1 - result.output.length / input.length) * 100)}% smaller</Badge> : null}
            </div>
          ) : null}
        </OutputPanel>
      </div>

      {analysis ? (
        <Card className="shadow-card">
          <CardHeader title="Analysis" description="Structure of the document, from a light tokenizer (not a full validator)." actions={analysis.ok ? <Badge tone="accent">{analysis.kind}</Badge> : <Badge tone="danger">error</Badge>} />
          {!analysis.ok ? (
            <Alert tone="danger">{analysis.error}</Alert>
          ) : (
            <div className="space-y-3">
              {analysis.warnings.length ? (
                <Alert tone="warning">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {analysis.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert tone="success">No issues found.</Alert>
              )}
              {analysis.operations.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {analysis.operations.map((op, i) => (
                    <div key={`${op.name}-${i}`} className="rounded-lg border bg-bg-elevated p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={op.type === "mutation" ? "warning" : op.type === "subscription" ? "accent" : "success"}>{op.type}</Badge>
                        <span className="font-mono font-semibold text-fg">{op.name || "(anonymous)"}</span>
                        <Badge>depth {op.depth}</Badge>
                      </div>
                      <div className="mt-2 text-fg-muted">
                        Root fields: <span className="font-mono text-fg">{op.rootFields.join(", ") || "—"}</span>
                      </div>
                      {op.variables.length ? (
                        <ul className="mt-1 space-y-0.5 font-mono">
                          {op.variables.map((v) => (
                            <li key={v.name}>
                              <span className="text-accent-strong">${v.name}</span>: {v.type}
                              {v.hasDefault ? <span className="text-fg-subtle"> = default</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {op.fragmentsUsed.length ? <div className="mt-1 text-fg-muted">Fragments: <span className="font-mono text-fg">{op.fragmentsUsed.join(", ")}</span></div> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {analysis.fragments.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.fragments.map((f, i) => (
                    <Badge key={`${f.name}-${i}`} className="font-mono">
                      fragment {f.name} on {f.on}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {analysis.schemaTypes.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.schemaTypes.map((s, i) => (
                    <Badge key={`${s.name}-${i}`} tone="neutral" className="font-mono">
                      {s.kind} {s.name}
                      {s.fieldCount ? ` · ${s.fieldCount}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
