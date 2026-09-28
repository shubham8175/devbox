"use client";

import { useMemo, useState } from "react";
import { AlignLeft, ArrowLeftRight, Minimize2 } from "lucide-react";
import { DEFAULT_XML_OPTIONS, JSON_SAMPLE_FOR_XML, XML_SAMPLE, formatXml, jsonToXml, minifyXml, parseXml, xmlToJson } from "@/lib/tools/xml-json";
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
import { useHydrated } from "@/hooks/use-hydrated";

type Mode = "xml-json" | "json-xml";

export function XmlJsonTool() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<Mode>("xml-json");
  const [input, setInput] = useState("");
  const [rootName, setRootName] = useState("root");
  const [infer, setInfer] = useState(false);

  const opts = useMemo(() => ({ ...DEFAULT_XML_OPTIONS, infer }), [infer]);

  const result = useMemo(() => {
    if (!hydrated || !input.trim()) return null;
    return mode === "xml-json" ? xmlToJson(input, opts) : jsonToXml(input, rootName, opts);
  }, [hydrated, input, mode, opts, rootName]);

  const valid = useMemo(() => (hydrated && mode === "xml-json" && input.trim() ? parseXml(input) : null), [hydrated, mode, input]);

  const apply = (fn: (s: string) => { ok: boolean; output: string; error?: string }) => {
    const r = fn(input);
    if (r.ok) setInput(r.output);
  };

  const swap = () => {
    if (result?.ok && result.output) {
      setInput(result.output);
      setMode(mode === "xml-json" ? "json-xml" : "xml-json");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title={mode === "xml-json" ? "XML" : "JSON"}
          actions={
            <>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "xml-json", label: "XML → JSON" },
                  { value: "json-xml", label: "JSON → XML" },
                ]}
              />
              {!input ? (
                <Button size="sm" variant="ghost" onClick={() => setInput(mode === "xml-json" ? XML_SAMPLE : JSON_SAMPLE_FOR_XML)}>
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
          {mode === "xml-json" ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => apply(formatXml)} disabled={!valid?.ok}>
                <AlignLeft className="h-3.5 w-3.5" /> Format XML
              </Button>
              <Button size="sm" onClick={() => apply(minifyXml)} disabled={!valid?.ok}>
                <Minimize2 className="h-3.5 w-3.5" /> Minify
              </Button>
              {valid ? valid.ok ? <Badge tone="success">Well-formed XML</Badge> : <Badge tone="danger">Invalid XML</Badge> : null}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                <input type="checkbox" checked={infer} onChange={(e) => setInfer(e.target.checked)} className="accent-accent" /> Infer numbers & booleans
              </label>
            </div>
          ) : (
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="xml-root" hint="empty = use single top-level key">
                  Root element
                </Label>
                <Input id="xml-root" mono value={rootName} onChange={(e) => setRootName(e.target.value)} placeholder="root" className="w-48" />
              </div>
            </div>
          )}
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "xml-json" ? "<root><item id=\"1\">text</item></root>" : '{"root": {"item": {"@id": "1", "#text": "text"}}}'} className="min-h-[340px]" invalid={result ? !result.ok : false} aria-label="Input" />
          {result && !result.ok ? (
            <Alert tone="danger" className="mt-2">
              {result.error}
            </Alert>
          ) : null}
        </InputPanel>

        <OutputPanel
          title={mode === "xml-json" ? "JSON" : "XML"}
          actions={
            <>
              <Button size="sm" onClick={swap} disabled={!result?.ok || !result.output}>
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
              </Button>
              <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
            </>
          }
        >
          {!result ? (
            <EmptyState title="Nothing to convert yet" description="Paste on the left; conversion happens as you type." />
          ) : result.ok ? (
            <CodeTextarea readOnly value={result.output} className="min-h-[380px] bg-surface" counter={false} aria-label="Output" />
          ) : (
            <EmptyState title="Fix the input to see output" className="py-8" />
          )}
        </OutputPanel>
      </div>

      <Alert tone="info">
        <strong>How the mapping works.</strong> Attributes become <span className="font-mono">@name</span> keys, text inside an element that also has attributes or children becomes <span className="font-mono">#text</span>, repeated sibling elements become arrays, and elements with nothing inside become empty strings. Namespaces are kept as part of the tag name. Comments and processing instructions are dropped when converting to JSON (but preserved by Format XML). Because JSON has no attribute concept, XML → JSON → XML is lossless only when you keep the <span className="font-mono">@</span>/<span className="font-mono">#text</span> conventions.
      </Alert>
    </div>
  );
}
