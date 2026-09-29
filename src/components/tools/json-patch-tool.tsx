"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { ArrowRight } from "lucide-react";
import { parseJson, type JsonValue } from "@/lib/tools/json";
import {
  applyJsonPatch,
  applyMergePatch,
  generateJsonPatch,
  generateMergePatch,
  JSON_PATCH_SAMPLE_FROM,
  JSON_PATCH_SAMPLE_TO,
  parsePatch,
} from "@/lib/tools/json-patch";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Mode = "generate" | "apply";
type Format = "json-patch" | "merge-patch";

type Outcome = { ok: true; output: string; count: number; verified?: boolean } | { ok: false; error: string; failedIndex?: number };

function countOps(format: Format, value: JsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (format === "merge-patch" && value && typeof value === "object") return Object.keys(value).length;
  return 1;
}

export function JsonPatchTool() {
  const [mode, setMode] = useState<Mode>("generate");
  const [format, setFormat] = useState<Format>("json-patch");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [doc, setDoc] = useState("");
  const [patch, setPatch] = useState("");

  const dBefore = useDebounced(before, 200);
  const dAfter = useDebounced(after, 200);
  const dDoc = useDebounced(doc, 200);
  const dPatch = useDebounced(patch, 200);

  const parsedBefore = useMemo(() => (dBefore.trim() ? parseJson(dBefore) : null), [dBefore]);
  const parsedAfter = useMemo(() => (dAfter.trim() ? parseJson(dAfter) : null), [dAfter]);
  const parsedDoc = useMemo(() => (dDoc.trim() ? parseJson(dDoc) : null), [dDoc]);
  const parsedPatch = useMemo(() => {
    if (!dPatch.trim()) return null;
    return format === "json-patch" ? parsePatch(dPatch) : parseJson(dPatch);
  }, [dPatch, format]);

  const outcome = useMemo<Outcome | null>(() => {
    if (mode === "generate") {
      if (!parsedBefore?.ok || !parsedAfter?.ok) return null;
      if (format === "json-patch") {
        const ops = generateJsonPatch(parsedBefore.value, parsedAfter.value);
        const check = applyJsonPatch(parsedBefore.value, ops);
        return { ok: true, output: JSON.stringify(ops, null, 2), count: ops.length, verified: check.ok && JSON.stringify(check.result) === JSON.stringify(parsedAfter.value) };
      }
      const mp = generateMergePatch(parsedBefore.value, parsedAfter.value);
      const check = applyMergePatch(parsedBefore.value, mp);
      return { ok: true, output: JSON.stringify(mp, null, 2), count: countOps(format, mp), verified: check.ok && JSON.stringify(check.result) === JSON.stringify(parsedAfter.value) };
    }
    if (!parsedDoc?.ok || !parsedPatch?.ok) return null;
    if (format === "json-patch") {
      if (!("ops" in parsedPatch)) return null;
      const r = applyJsonPatch(parsedDoc.value, parsedPatch.ops);
      return r.ok ? { ok: true, output: JSON.stringify(r.result, null, 2), count: r.applied } : { ok: false, error: r.error, failedIndex: r.failedIndex };
    }
    if (!("value" in parsedPatch)) return null;
    const r = applyMergePatch(parsedDoc.value, parsedPatch.value);
    return r.ok ? { ok: true, output: JSON.stringify(r.result, null, 2), count: countOps(format, parsedPatch.value) } : { ok: false, error: r.error };
  }, [mode, format, parsedBefore, parsedAfter, parsedDoc, parsedPatch]);

  const inputsEmpty = mode === "generate" ? !before && !after : !doc && !patch;
  const loadSample = () => {
    if (mode === "generate") {
      setBefore(JSON_PATCH_SAMPLE_FROM);
      setAfter(JSON_PATCH_SAMPLE_TO);
    } else {
      const a = JSON.parse(JSON_PATCH_SAMPLE_FROM) as JsonValue;
      const b = JSON.parse(JSON_PATCH_SAMPLE_TO) as JsonValue;
      setDoc(JSON_PATCH_SAMPLE_FROM);
      setPatch(JSON.stringify(format === "json-patch" ? generateJsonPatch(a, b) : generateMergePatch(a, b), null, 2));
    }
  };
  const clear = () => {
    if (mode === "generate") {
      setBefore("");
      setAfter("");
    } else {
      setDoc("");
      setPatch("");
    }
  };
  /** Carry a generated patch over to Apply mode with the "before" document. */
  const applyGenerated = () => {
    if (!outcome?.ok) return;
    setDoc(before);
    setPatch(outcome.output);
    setMode("apply");
  };

  const patchError = parsedPatch && !parsedPatch.ok ? parsedPatch.error : null;
  const unit = format === "json-patch" ? "operation" : "key";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={mode === "generate" ? "Documents" : "Document & patch"}
        description={format === "json-patch" ? "RFC 6902: an ordered list of add / remove / replace / move / copy / test operations." : "RFC 7386: an object merged into the document; null deletes a key, arrays are replaced whole."}
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "generate", label: "Generate" },
                { value: "apply", label: "Apply" },
              ]}
            />
            {inputsEmpty ? (
              <Button size="sm" variant="ghost" onClick={loadSample}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
            )}
          </>
        }
      >
        <div className="mb-3">
          <Label>Format</Label>
          <Segmented
            size="sm"
            value={format}
            onChange={setFormat}
            options={[
              { value: "json-patch", label: "JSON Patch (RFC 6902)" },
              { value: "merge-patch", label: "Merge Patch (RFC 7386)" },
            ]}
          />
        </div>
        {mode === "generate" ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="patch-before">Before</Label>
              <CodeTextarea id="patch-before" value={before} onChange={(e) => setBefore(e.target.value)} placeholder='{ "name": "old" }' className="min-h-[190px]" invalid={!!parsedBefore && !parsedBefore.ok} aria-label="Before document" />
              {parsedBefore && !parsedBefore.ok ? (
                <Alert tone="danger" className="mt-2">
                  {parsedBefore.error}
                </Alert>
              ) : null}
            </div>
            <div>
              <Label htmlFor="patch-after">After</Label>
              <CodeTextarea id="patch-after" value={after} onChange={(e) => setAfter(e.target.value)} placeholder='{ "name": "new" }' className="min-h-[190px]" invalid={!!parsedAfter && !parsedAfter.ok} aria-label="After document" />
              {parsedAfter && !parsedAfter.ok ? (
                <Alert tone="danger" className="mt-2">
                  {parsedAfter.error}
                </Alert>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="patch-doc">Document</Label>
              <CodeTextarea id="patch-doc" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder='{ "name": "old" }' className="min-h-[190px]" invalid={!!parsedDoc && !parsedDoc.ok} aria-label="Document" />
              {parsedDoc && !parsedDoc.ok ? (
                <Alert tone="danger" className="mt-2">
                  {parsedDoc.error}
                </Alert>
              ) : null}
            </div>
            <div>
              <Label htmlFor="patch-ops">Patch</Label>
              <CodeTextarea id="patch-ops" value={patch} onChange={(e) => setPatch(e.target.value)} placeholder={format === "json-patch" ? '[{ "op": "replace", "path": "/name", "value": "new" }]' : '{ "name": "new", "obsolete": null }'} className="min-h-[190px]" invalid={!!patchError} aria-label="Patch" />
              {patchError ? (
                <Alert tone="danger" className="mt-2">
                  {patchError}
                </Alert>
              ) : null}
            </div>
          </div>
        )}
      </InputPanel>

      <OutputPanel
        title={mode === "generate" ? "Patch" : "Result"}
        actions={
          <>
            {outcome?.ok ? (
              <Badge tone="accent">
                {outcome.count} {unit}
                {outcome.count === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {outcome?.ok && outcome.verified ? <Badge tone="success">Round-trip verified</Badge> : null}
            {mode === "generate" ? (
              <Button size="sm" onClick={applyGenerated} disabled={!outcome?.ok} title="Open this patch in Apply mode">
                Apply it <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <CopyButton value={outcome?.ok ? outcome.output : ""} variant="primary" />
          </>
        }
      >
        {outcome?.ok ? (
          <pre className="max-h-[620px] overflow-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{outcome.output}</pre>
        ) : outcome ? (
          <Alert tone="danger">
            {outcome.failedIndex !== undefined ? <strong>Failed at operation {outcome.failedIndex}. </strong> : null}
            {outcome.error}
            <div className="mt-1 opacity-80">The document was left unchanged (patches apply atomically).</div>
          </Alert>
        ) : (
          <EmptyState
            title={mode === "generate" ? "Paste two documents" : "Paste a document and a patch"}
            description={mode === "generate" ? "The patch that turns Before into After appears here, verified by re-applying it." : "The patched document appears here; a failing operation reports its index."}
          />
        )}
      </OutputPanel>
    </div>
  );
}
