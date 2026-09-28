"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { AlignLeft, Minimize2 } from "lucide-react";
import { SQL_DIALECTS, SQL_SAMPLE, minifySql, tokenizeSql, type SqlDialect, type SqlFormatterModule, type SqlTokenType } from "@/lib/tools/sql";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

const TOKEN_CLASS: Record<SqlTokenType, string> = {
  keyword: "text-accent-strong font-semibold",
  function: "text-warning",
  string: "text-success",
  number: "text-warning",
  comment: "text-fg-subtle italic",
  operator: "text-fg-muted",
  punct: "text-fg-muted",
  ident: "",
  ws: "",
};

export function SqlTool() {
  const [input, setInput] = useState("");
  const [dialect, setDialect] = useState<SqlDialect>("postgresql");
  const [keywordCase, setKeywordCase] = useState<"upper" | "lower" | "preserve">("upper");
  const [mode, setMode] = useState<"format" | "minify">("format");
  const [formatter, setFormatter] = useState<SqlFormatterModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load sql-formatter only on this route.
  useEffect(() => {
    let cancelled = false;
    import("sql-formatter")
      .then((m) => {
        if (!cancelled) setFormatter({ format: (sql, opts) => m.format(sql, opts as Parameters<typeof m.format>[1]) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The SQL formatter failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const debouncedInput = useDebounced(input, 250);
  const result = useMemo(() => {
    if (!debouncedInput.trim()) return null;
    if (mode === "minify") return { ok: true as const, output: minifySql(debouncedInput) };
    if (!formatter) return null;
    try {
      return { ok: true as const, output: formatter.format(debouncedInput, { language: dialect, keywordCase, tabWidth: 2, linesBetweenQueries: 2 }) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message.split("\n")[0] : "Could not format this SQL." };
    }
  }, [debouncedInput, mode, formatter, dialect, keywordCase]);

  const tokens = useMemo(() => (result?.ok ? tokenizeSql(result.output) : []), [result]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="SQL"
        description="Formatting only. Nothing is executed."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(SQL_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="sql-dialect">Dialect</Label>
            <Select id="sql-dialect" value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)} className="w-48">
              {SQL_DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Keywords</Label>
            <Segmented
              size="sm"
              value={keywordCase}
              onChange={setKeywordCase}
              options={[
                { value: "upper", label: "UPPER" },
                { value: "lower", label: "lower" },
                { value: "preserve", label: "As is" },
              ]}
            />
          </div>
        </div>
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="select * from users where id = 1" className="min-h-[360px]" invalid={result ? !result.ok : false} aria-label="SQL input" />
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
        {loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !input.trim() ? (
          <EmptyState title="Paste SQL to format" description="SELECT, INSERT, UPDATE, DELETE, JOINs, GROUP BY, window functions and CTEs are supported." />
        ) : mode === "format" && !formatter ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-[340px] skeleton" />
            <p className="text-xs text-fg-subtle">Loading formatter…</p>
          </div>
        ) : result?.ok ? (
          <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">
            {tokens.map((t, i) => (
              <span key={i} className={TOKEN_CLASS[t.type]}>
                {t.text}
              </span>
            ))}
          </pre>
        ) : (
          <EmptyState title="Fix the SQL to see output" className="py-8" />
        )}
        {result?.ok ? (
          <div className="mt-3">
            <Badge>{result.output.length.toLocaleString()} chars</Badge>
          </div>
        ) : null}
      </OutputPanel>
    </div>
  );
}
