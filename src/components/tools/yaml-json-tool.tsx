"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Download } from "lucide-react";
import { JSON_SAMPLE_FOR_YAML, YAML_SAMPLE, jsonToYaml, yamlToJson, type YamlModule } from "@/lib/tools/yaml-json";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Mode = "yaml-json" | "json-yaml";

function download(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function YamlJsonTool() {
  const [mode, setMode] = useState<Mode>("yaml-json");
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<"2" | "4">("2");
  const [yaml, setYaml] = useState<YamlModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load the YAML library only on this route.
  useEffect(() => {
    let cancelled = false;
    import("yaml")
      .then((m) => {
        if (!cancelled) setYaml({ parse: (src, opts) => m.parse(src, opts), stringify: (v, opts) => m.stringify(v, opts) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The YAML library failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => {
    if (!yaml || !input.trim()) return null;
    return mode === "yaml-json" ? yamlToJson(yaml, input, Number(indent)) : jsonToYaml(yaml, input, Number(indent));
  }, [yaml, input, mode, indent]);

  const swap = () => {
    if (result?.ok && result.output) {
      setInput(result.output);
      setMode(mode === "yaml-json" ? "json-yaml" : "yaml-json");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={mode === "yaml-json" ? "YAML" : "JSON"}
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "yaml-json", label: "YAML → JSON" },
                { value: "json-yaml", label: "JSON → YAML" },
              ]}
            />
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(mode === "yaml-json" ? YAML_SAMPLE : JSON_SAMPLE_FOR_YAML)}>
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
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "yaml-json" ? "key: value\nlist:\n  - a\n  - b" : '{"key": "value"}'} className="min-h-[380px]" invalid={result ? !result.ok : false} aria-label="Input" />
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-2">
            <span className="font-mono">{result.error}</span>
            {result.line ? (
              <span className="ml-1 opacity-80">
                (line {result.line}
                {result.column ? `, column ${result.column}` : ""})
              </span>
            ) : null}
          </Alert>
        ) : null}
        {result?.ok ? (
          <div className="mt-2">
            <Badge tone="success">Valid {mode === "yaml-json" ? "YAML" : "JSON"}</Badge>
          </div>
        ) : null}
      </InputPanel>

      <OutputPanel
        title={mode === "yaml-json" ? "JSON" : "YAML"}
        actions={
          <>
            <Segmented
              size="sm"
              value={indent}
              onChange={setIndent}
              options={[
                { value: "2", label: "2 spaces" },
                { value: "4", label: "4" },
              ]}
            />
            <Button size="sm" onClick={swap} disabled={!result?.ok || !result.output}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
            </Button>
            <Button size="sm" onClick={() => download(result?.output ?? "", mode === "yaml-json" ? "converted.json" : "converted.yaml")} disabled={!result?.ok || !result.output}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
          </>
        }
      >
        {loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !yaml ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-[340px] skeleton" />
            <p className="text-xs text-fg-subtle">Loading YAML parser…</p>
          </div>
        ) : !result ? (
          <EmptyState title="Nothing to convert yet" description="Paste on the left; the output updates live." />
        ) : result.ok ? (
          <CodeTextarea readOnly value={result.output} className="min-h-[380px] bg-surface" counter={false} aria-label="Output" />
        ) : (
          <EmptyState title="Fix the input to see output" className="py-8" />
        )}
      </OutputPanel>
    </div>
  );
}
