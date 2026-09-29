"use client";

import { useMemo, useRef, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { Wand2 } from "lucide-react";
import { parseJson } from "@/lib/tools/json";
import {
  detectDraft,
  generateSchemaFromJson,
  JSON_SCHEMA_DATA_SAMPLE,
  JSON_SCHEMA_SAMPLE,
  MAX_REPORTED_ERRORS,
  SCHEMA_DRAFTS,
  validateJsonSchema,
  type SchemaDraft,
  type SchemaValidationError,
} from "@/lib/tools/json-schema";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type DraftChoice = SchemaDraft | "auto";

export function JsonSchemaTool() {
  const [schema, setSchema] = useState("");
  const [data, setData] = useState("");
  const [draftChoice, setDraftChoice] = useState<DraftChoice>("auto");
  const dataRef = useRef<HTMLTextAreaElement>(null);

  const debouncedSchema = useDebounced(schema, 250);
  const debouncedData = useDebounced(data, 250);

  const detected = useMemo(() => {
    if (!debouncedSchema.trim()) return null;
    const parsed = parseJson(debouncedSchema);
    return parsed.ok ? detectDraft(parsed.value) : null;
  }, [debouncedSchema]);
  // Validation is interpreted in the browser (no eval), so no library to load.
  const result = useMemo(() => {
    if (!debouncedSchema.trim() || !debouncedData.trim()) return null;
    return validateJsonSchema(debouncedSchema, debouncedData, { draft: draftChoice });
  }, [debouncedSchema, debouncedData, draftChoice]);

  const canInfer = useMemo(() => debouncedData.trim() !== "" && parseJson(debouncedData).ok, [debouncedData]);
  const inferSchema = () => {
    const parsed = parseJson(data);
    if (parsed.ok) setSchema(JSON.stringify(generateSchemaFromJson(parsed.value), null, 2));
  };

  /** Focus the data textarea on a given 1-based line so the user can fix the value. */
  const jumpToLine = (line: number) => {
    const ta = dataRef.current;
    if (!ta) return;
    const lines = ta.value.split("\n");
    let start = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) start += lines[i].length + 1;
    const end = start + (lines[line - 1]?.length ?? 0);
    ta.focus();
    ta.setSelectionRange(start, end);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, (line - 3) * lineHeight);
  };

  const dataParseError = result && !result.ok && result.side === "data" ? result.error : null;
  const schemaParseError = result && !result.ok && result.side === "schema" ? result.error : null;
  const errorsText = result?.ok ? result.errors.map((e) => e.formatted).join("\n") : "";
  const hasInput = Boolean(schema.trim() && data.trim());

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title="Schema"
          description="JSON Schema draft-07, 2019-09 or 2020-12."
          actions={
            !schema ? (
              <Button size="sm" variant="ghost" onClick={() => setSchema(JSON_SCHEMA_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setSchema("")}>
                Clear
              </Button>
            )
          }
        >
          <div className="mb-3">
            <Label htmlFor="schema-draft">Draft</Label>
            <Select id="schema-draft" value={draftChoice} onChange={(e) => setDraftChoice(e.target.value as DraftChoice)} className="w-64">
              <option value="auto">Auto{detected ? ` (${SCHEMA_DRAFTS.find((d) => d.id === detected.draft)?.label ?? detected.draft})` : ""}</option>
              {SCHEMA_DRAFTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <CodeTextarea value={schema} onChange={(e) => setSchema(e.target.value)} placeholder='{ "type": "object", "properties": { ... } }' className="min-h-[360px]" invalid={!!schemaParseError} aria-label="JSON Schema" />
          {schemaParseError ? (
            <Alert tone="danger" className="mt-2">
              {schemaParseError}
            </Alert>
          ) : null}
        </InputPanel>

        <InputPanel
          title="Data"
          description="The JSON document to validate."
          actions={
            <>
              <Button size="sm" onClick={inferSchema} disabled={!canInfer} title="Generate a draft 2020-12 schema from this document">
                <Wand2 className="h-3.5 w-3.5" /> Infer schema from data
              </Button>
              {!data ? (
                <Button size="sm" variant="ghost" onClick={() => setData(JSON_SCHEMA_DATA_SAMPLE)}>
                  Load sample
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setData("")}>
                  Clear
                </Button>
              )}
            </>
          }
        >
          <CodeTextarea ref={dataRef} value={data} onChange={(e) => setData(e.target.value)} placeholder='{ "id": "...", "name": "..." }' className="min-h-[360px] lg:min-h-[424px]" invalid={!!dataParseError} aria-label="JSON data" />
          {dataParseError ? (
            <Alert tone="danger" className="mt-2">
              {dataParseError}
            </Alert>
          ) : null}
        </InputPanel>
      </div>

      <OutputPanel
        title="Result"
        description={result?.ok ? result.draft.note : "Nothing leaves this page and nothing is stored."}
        actions={
          <>
            {result?.ok ? (
              result.schemaErrors ? (
                <Badge tone="danger">Schema invalid</Badge>
              ) : result.valid ? (
                <Badge tone="success">Valid</Badge>
              ) : (
                <Badge tone="danger">
                  {result.errors.length >= MAX_REPORTED_ERRORS ? `${MAX_REPORTED_ERRORS}+` : result.errors.length} error{result.errors.length === 1 ? "" : "s"}
                </Badge>
              )
            ) : null}
            <CopyButton value={errorsText} label="Copy errors" />
          </>
        }
      >
        {!hasInput ? (
          <EmptyState title="Paste a schema and a document" description="Errors are listed with their JSON path, the failing keyword and the line in the data." />
        ) : !result || !result.ok ? (
          <EmptyState title="Fix the inputs to validate" className="py-8" />
        ) : result.schemaErrors ? (
          <Alert tone="danger">
            <strong>The schema itself is invalid.</strong>
            <ul className="mt-1 list-disc pl-4">
              {result.schemaErrors.map((e, i) => (
                <li key={i} className="font-mono">
                  {e}
                </li>
              ))}
            </ul>
          </Alert>
        ) : result.valid ? (
          <Alert tone="success">The document satisfies every constraint in the schema.</Alert>
        ) : (
          <ul className="space-y-1.5">
            {result.errors.map((e, i) => (
              <ErrorCard key={`${e.instancePath}-${e.keyword}-${i}`} error={e} onJump={jumpToLine} />
            ))}
          </ul>
        )}
        {result?.ok ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>{result.stats.keywords.length} keywords</Badge>
            <Badge>{result.stats.propertyCount} properties</Badge>
            <Badge>{result.stats.requiredCount} required</Badge>
            {result.stats.keywords.length ? <span className="font-mono text-[11px] text-fg-subtle">{result.stats.keywords.join(" · ")}</span> : null}
          </div>
        ) : null}
      </OutputPanel>
    </div>
  );
}

function ErrorCard({ error, onJump }: { error: SchemaValidationError; onJump: (line: number) => void }) {
  const line = error.line;
  return (
    <li className="rounded-lg border border-l-2 border-l-danger bg-bg-elevated px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger">{error.keyword}</Badge>
        <span className="min-w-0 break-all font-mono text-xs text-fg">{error.instancePath || "(root)"}</span>
        {line ? (
          <button type="button" onClick={() => onJump(line)} className="cursor-pointer" title="Jump to this line in the data" aria-label={`Jump to line ${line}`}>
            <Badge tone="accent">line {line}</Badge>
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-fg">{error.message}</p>
      {error.suggestion ? <p className="mt-0.5 text-xs text-fg-muted">{error.suggestion}</p> : null}
      <p className="mt-0.5 break-all font-mono text-[11px] text-fg-subtle">schema {error.schemaPath}</p>
    </li>
  );
}
