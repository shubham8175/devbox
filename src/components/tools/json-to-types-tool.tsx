"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { parseJson } from "@/lib/tools/json";
import { generateTypes, JSON_TO_TYPES_SAMPLE } from "@/lib/tools/json-to-types";
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

type Output = "interface" | "type" | "zod";

function downloadText(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function JsonToTypesTool() {
  const [input, setInput] = useState("");
  const [rootName, setRootName] = useState("Root");
  const [output, setOutput] = useState<Output>("interface");

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);
  const generated = useMemo(() => (parsed?.ok ? generateTypes(parsed.value, rootName) : null), [parsed, rootName]);
  const code = generated ? (output === "interface" ? generated.interfaces : output === "type" ? generated.types : generated.zod) : "";
  const filename = `${(rootName || "types").replace(/[^A-Za-z0-9_-]/g, "") || "types"}.${output === "zod" ? "schema.ts" : "ts"}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="JSON"
        description="An object or an array of objects. Keys missing from some items become optional."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(JSON_TO_TYPES_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <div className="mb-3">
          <Label htmlFor="jt-root">Root type name</Label>
          <Input id="jt-root" mono value={rootName} onChange={(e) => setRootName(e.target.value)} placeholder="Root" className="max-w-xs" />
        </div>
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"id": 1, "name": "John"}' className="min-h-[360px]" invalid={parsed ? !parsed.ok : false} aria-label="JSON input" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : null}
      </InputPanel>

      <OutputPanel
        title="Generated"
        description={generated ? `${generated.names.length} ${generated.names.length === 1 ? "type" : "types"}` : undefined}
        actions={
          <>
            <Segmented
              size="sm"
              value={output}
              onChange={setOutput}
              options={[
                { value: "interface", label: "Interface" },
                { value: "type", label: "Type" },
                { value: "zod", label: "Zod" },
              ]}
            />
          </>
        }
      >
        {code ? (
          <>
            <pre className="max-h-[520px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{code}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge>{filename}</Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={() => downloadText(code, filename)}>
                  <Download className="h-3.5 w-3.5" /> Download .ts
                </Button>
                <CopyButton value={code} label="Copy" variant="primary" />
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="Paste JSON to generate types" description="Nested objects get their own named types; arrays of objects are merged into one shape." />
        )}
      </OutputPanel>
    </div>
  );
}
