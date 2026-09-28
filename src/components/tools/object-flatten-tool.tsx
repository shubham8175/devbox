"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { parseJson, type JsonValue } from "@/lib/tools/json";
import { DEFAULT_FLATTEN, FLATTEN_SAMPLE, UNFLATTEN_SAMPLE, flatten, unflatten } from "@/lib/tools/object-flatten";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Mode = "flatten" | "unflatten";

export function ObjectFlattenTool() {
  const [mode, setMode] = useState<Mode>("flatten");
  const [input, setInput] = useState("");
  const [separator, setSeparator] = useState(".");
  const [brackets, setBrackets] = useState(false);
  const [keepEmpty, setKeepEmpty] = useState(true);

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);
  const result = useMemo(() => {
    if (!parsed?.ok) return null;
    const opts = { ...DEFAULT_FLATTEN, separator: separator || ".", brackets, keepEmpty };
    try {
      if (mode === "flatten") {
        const flat = flatten(parsed.value, opts);
        return { ok: true as const, output: JSON.stringify(flat, null, 2), count: Object.keys(flat).length };
      }
      if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return { ok: false as const, error: "Unflatten expects an object whose keys are paths." };
      const nested = unflatten(parsed.value as Record<string, JsonValue>, opts);
      return { ok: true as const, output: JSON.stringify(nested, null, 2), count: Object.keys(parsed.value).length };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Conversion failed." };
    }
  }, [parsed, mode, separator, brackets, keepEmpty]);

  const swap = () => {
    if (result?.ok) {
      setInput(result.output);
      setMode(mode === "flatten" ? "unflatten" : "flatten");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={mode === "flatten" ? "Nested JSON" : "Flat JSON"}
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "flatten", label: "Flatten" },
                { value: "unflatten", label: "Unflatten" },
              ]}
            />
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(mode === "flatten" ? FLATTEN_SAMPLE : UNFLATTEN_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )}
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="fl-sep">Separator</Label>
            <Input id="fl-sep" mono value={separator} onChange={(e) => setSeparator(e.target.value)} maxLength={3} className="w-20" placeholder="." />
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={brackets} onChange={(e) => setBrackets(e.target.checked)} className="accent-accent" /> Array indexes as <span className="font-mono">[0]</span>
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={keepEmpty} onChange={(e) => setKeepEmpty(e.target.checked)} className="accent-accent" /> Keep empty {"{}"} / []
          </label>
        </div>
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "flatten" ? '{"user": {"name": "John"}}' : '{"user.name": "John"}'} className="min-h-[320px]" invalid={parsed ? !parsed.ok : false} aria-label="Input" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : result && !result.ok ? (
          <Alert tone="danger" className="mt-2">
            {result.error}
          </Alert>
        ) : null}
      </InputPanel>

      <OutputPanel
        title={mode === "flatten" ? "Flat" : "Nested"}
        description={result?.ok ? `${result.count} ${mode === "flatten" ? "paths" : "keys processed"}` : undefined}
        actions={
          <>
            <Button size="sm" onClick={swap} disabled={!result?.ok}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
            </Button>
            <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
          </>
        }
      >
        {result?.ok ? (
          <CodeTextarea readOnly value={result.output} className="min-h-[380px] bg-surface" counter={false} aria-label="Output" />
        ) : (
          <EmptyState title="Waiting for JSON" description={<>Example: <span className="font-mono">{`{"user":{"name":"John"}}`}</span> ⇄ <span className="font-mono">{`{"user.name":"John"}`}</span></>} />
        )}
        <div className="mt-3">
          <Badge>Numeric segments become array indexes when unflattening</Badge>
        </div>
      </OutputPanel>
    </div>
  );
}
