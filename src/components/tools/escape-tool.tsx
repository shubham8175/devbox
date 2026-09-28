"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { ESCAPE_MODES, escapeText, unescapeText, visualizeWhitespace, type EscapeMode } from "@/lib/tools/escape";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Direction = "escape" | "unescape";

/** The whitespace view renders one element per character, so it is capped. */
const WS_VIEW_MAX = 20_000;

export function EscapeTool() {
  const [mode, setMode] = useState<EscapeMode>("json");
  const [direction, setDirection] = useState<Direction>("escape");
  const [input, setInput] = useState("");
  const [showWs, setShowWs] = useState(false);

  const result = useMemo(() => {
    if (!input) return { ok: true, output: "" };
    return direction === "escape" ? escapeText(mode, input) : unescapeText(mode, input);
  }, [mode, direction, input]);

  const hint = ESCAPE_MODES.find((m) => m.id === mode)?.hint;
  const wsSource = result.ok && result.output ? result.output : input;

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title={`${direction === "escape" ? "Escape" : "Unescape"} · ${ESCAPE_MODES.find((m) => m.id === mode)?.label}`}
          description={hint}
          actions={
            <Segmented
              size="sm"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "escape", label: "Escape" },
                { value: "unescape", label: "Unescape" },
              ]}
            />
          }
        />
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ESCAPE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                mode === m.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="esc-in" hint={`${input.length.toLocaleString()} chars`}>
              Input
            </Label>
            <Textarea id="esc-in" value={input} onChange={(e) => setInput(e.target.value)} placeholder={direction === "escape" ? 'He said "hi"\n\tand left <b>early</b> & happy — 日本' : mode === "json" ? 'He said \\"hi\\"\\n' : mode === "html" ? "&lt;b&gt;bold&lt;/b&gt; &amp; &copy;" : mode === "url" ? "a%20b%26c" : "\\u65e5\\u672c"} className="min-h-[220px]" invalid={!result.ok} />
          </div>
          <div>
            <Label htmlFor="esc-out" hint={`${result.output.length.toLocaleString()} chars`}>
              Output
            </Label>
            <Textarea id="esc-out" readOnly value={result.output} placeholder="Output" className="min-h-[220px] bg-surface" />
          </div>
        </div>
        {!result.ok && result.error ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (result.ok && result.output) {
                setInput(result.output);
                setDirection(direction === "escape" ? "unescape" : "escape");
              }
            }}
            disabled={!result.ok || !result.output}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setInput("")} disabled={!input}>
            Clear
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={showWs} onChange={(e) => setShowWs(e.target.checked)} className="accent-accent" /> Show whitespace
          </label>
          <div className="ml-auto">
            <CopyButton value={result.ok ? result.output : ""} label="Copy output" variant="primary" />
          </div>
        </div>
      </Card>

      {showWs ? (
        <Card className="shadow-card">
          <CardHeader title="Whitespace view" description="¶ newline · → tab · · space · ⍽ non-breaking space · ␍ carriage return" />
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">
            {wsSource ? visualizeWhitespace(wsSource.slice(0, WS_VIEW_MAX)).map((s, i) => (s.mark ? <span key={i} className="ws-mark">{s.text}</span> : <span key={i}>{s.text}</span>)) : <span className="text-fg-subtle">Type something to visualise its whitespace.</span>}
            {wsSource.length > WS_VIEW_MAX ? <span className="text-fg-subtle"> … (showing the first {WS_VIEW_MAX.toLocaleString()} characters)</span> : null}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
