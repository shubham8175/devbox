"use client";

import { useMemo, useState } from "react";
import { AlignLeft, ArrowDownAZ, Minimize2 } from "lucide-react";
import { formatJson, minifyJson, parseJson, sortKeysDeep } from "@/lib/tools/json";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { CopyButton } from "@/components/copy-button";

const SAMPLE = `{"name":"devbox","version":1,"tags":["tools","local"],"private":true,"author":{"name":"you"}}`;

export function JsonTool() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<"2" | "4" | "tab">("2");

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);

  const apply = (fn: (text: string) => string | null) => {
    const next = fn(input);
    if (next !== null) setInput(next);
  };

  const indentValue = indent === "tab" ? "\t" : Number(indent);

  const format = () =>
    apply((t) => {
      const r = parseJson(t);
      return r.ok ? formatJson(r.value, indentValue) : null;
    });
  const minify = () =>
    apply((t) => {
      const r = parseJson(t);
      return r.ok ? minifyJson(r.value) : null;
    });
  const sort = () =>
    apply((t) => {
      const r = parseJson(t);
      return r.ok ? formatJson(sortKeysDeep(r.value), indentValue) : null;
    });

  const disabled = !parsed?.ok;

  return (
    <Card>
      <CardHeader
        title="JSON"
        description="Formats, minifies, validates and sorts entirely in your browser."
        actions={
          <>
            <Segmented
              size="sm"
              value={indent}
              onChange={setIndent}
              options={[
                { value: "2", label: "2 spaces" },
                { value: "4", label: "4" },
                { value: "tab", label: "Tab" },
              ]}
            />
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={format} disabled={disabled}>
          <AlignLeft className="h-3.5 w-3.5" /> Format
        </Button>
        <Button size="sm" onClick={minify} disabled={disabled}>
          <Minimize2 className="h-3.5 w-3.5" /> Minify
        </Button>
        <Button size="sm" onClick={sort} disabled={disabled}>
          <ArrowDownAZ className="h-3.5 w-3.5" /> Sort keys
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {!input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )}
          <CopyButton value={input} />
        </div>
      </div>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='{"paste": "your JSON here"}'
        className="min-h-[360px]"
        invalid={parsed ? !parsed.ok : false}
        aria-label="JSON input"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        {parsed ? (
          parsed.ok ? (
            <>
              <Badge tone="success">Valid JSON</Badge>
              <Badge>{parsed.rootType}</Badge>
              {parsed.topLevelCount !== null ? (
                <Badge>
                  {parsed.topLevelCount} top-level {parsed.rootType === "array" ? "items" : "keys"}
                </Badge>
              ) : null}
            </>
          ) : (
            <Badge tone="danger">Invalid JSON</Badge>
          )
        ) : (
          <Badge>Waiting for input</Badge>
        )}
        <span className="ml-auto font-mono">
          {input.length.toLocaleString()} chars · {input.split("\n").length.toLocaleString()} lines
        </span>
      </div>

      {parsed && !parsed.ok ? (
        <Alert tone="danger" className="mt-3">
          <span className="font-mono">{parsed.error}</span>
          {parsed.line ? (
            <span className="ml-1 opacity-80">
              (line {parsed.line}
              {parsed.column ? `, column ${parsed.column}` : ""})
            </span>
          ) : null}
        </Alert>
      ) : null}
    </Card>
  );
}
