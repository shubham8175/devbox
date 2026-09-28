"use client";

import { useId, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Download } from "lucide-react";
import { DEFAULT_WORKFLOW_EXPRESSION, runJsonToCsvWorkflow, WORKFLOW_EXAMPLES, WORKFLOW_SAMPLE, type WorkflowResult, type WorkflowStep } from "@/lib/tools/workflow";
import type { Delimiter } from "@/lib/tools/csv-json";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const DELIM_NAME: Record<Delimiter, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };
const DELIMS: Array<{ value: Delimiter; label: string }> = [
  { value: ",", label: "Comma ," },
  { value: ";", label: "Semicolon ;" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe |" },
];

/** Builds a Blob from in-memory text and hands it to the browser's download flow. Nothing is uploaded. */
function downloadCsv(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

type StageId = "parse" | "select" | "convert";
type StageStatus = "idle" | "ok" | "error" | "skipped";
interface Stage {
  id: StageId;
  title: string;
  status: StageStatus;
  detail: string;
}

/** Input-limit errors are reported against the stage whose input they concern. */
function stageForError(result: Extract<WorkflowResult, { ok: false }>): StageId {
  if (result.step !== "input") return result.step as Exclude<WorkflowStep, "input">;
  return result.code === "expression-too-long" ? "select" : result.code === "invalid-delimiter" ? "convert" : "parse";
}

function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

function describeStages(result: WorkflowResult | null): Stage[] {
  const base: Array<Pick<Stage, "id" | "title">> = [
    { id: "parse", title: "Parse JSON" },
    { id: "select", title: "Select with JSONPath" },
    { id: "convert", title: "Convert to CSV" },
  ];
  if (!result)
    return base.map((s) => ({
      ...s,
      status: "idle",
      detail: "Waiting for input",
    }));

  const p = result.progress.parse;
  const parseDetail = !p
    ? ""
    : p.rootType === "object"
      ? `Object with ${plural(p.topLevelCount ?? 0, "key")}`
      : p.rootType === "array"
        ? `Array of ${plural(p.topLevelCount ?? 0, "item")}`
        : `A single ${p.rootType} value`;
  const sel = result.progress.select;
  const selectDetail = !sel ? "" : sel.unwrapped ? `1 match, an array of ${plural(sel.rowCount, "item")} → ${plural(sel.rowCount, "row")}` : `${plural(sel.matchCount, "match", "matches")} → ${plural(sel.rowCount, "row")}`;

  const failed = result.ok ? null : stageForError(result);
  const order: StageId[] = ["parse", "select", "convert"];
  const failedIndex = failed ? order.indexOf(failed) : order.length;
  return base.map((s, i) => {
    if (i < failedIndex) {
      const detail =
        s.id === "parse" ? parseDetail : s.id === "select" ? selectDetail : result.ok ? `${plural(result.rowCount, "row")} × ${result.columns.length ? plural(result.columns.length, "column") : "no header"}` : "";
      return { ...s, status: "ok", detail };
    }
    if (i === failedIndex) return { ...s, status: "error", detail: result.ok ? "" : result.error };
    return {
      ...s,
      status: "skipped",
      detail: "Skipped until the previous step succeeds",
    };
  });
}

const STAGE_ICON: Record<StageStatus, { Icon: typeof Circle; className: string; label: string }> = {
  idle: { Icon: Circle, className: "text-fg-subtle", label: "Waiting" },
  ok: { Icon: CheckCircle2, className: "text-success", label: "Done" },
  error: { Icon: AlertCircle, className: "text-danger", label: "Failed" },
  skipped: { Icon: Circle, className: "text-fg-subtle", label: "Skipped" },
};

export function WorkflowJsonCsvTool() {
  // All state lives in React memory only. Nothing is written to storage, the URL or the network.
  const [json, setJson] = useState("");
  const [jsonPath, setJsonPath] = useState(DEFAULT_WORKFLOW_EXPRESSION);
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const { toast } = useToast();
  const uid = useId();
  const exprId = `${uid}-expr`;
  const delimId = `${uid}-delim`;
  const jsonId = `${uid}-json`;
  const errorId = `${uid}-error`;

  const result = useMemo<WorkflowResult | null>(() => (json.trim() ? runJsonToCsvWorkflow({ json, jsonPath, delimiter }) : null), [json, jsonPath, delimiter]);
  const stages = useMemo(() => describeStages(result), [result]);
  const failedStage = result && !result.ok ? stageForError(result) : null;
  const csv = result?.ok ? result.csv : "";

  const noMatchHint = (() => {
    if (!result || result.ok || result.code !== "no-matches") return null;
    const p = result.progress.parse;
    if (!p) return null;
    if (p.rootType === "array") return `The root is an array of ${plural(p.topLevelCount ?? 0, "item")}, so paths start with $[*] rather than a key.`;
    if (p.rootType === "object")
      return p.topLevelKeys.length ? `Top-level keys in this document: ${p.topLevelKeys.map((k) => `"${k}"`).join(", ")}${(p.topLevelCount ?? 0) > p.topLevelKeys.length ? ", …" : ""}.` : "The root object has no keys.";
    return `The root is a single ${p.rootType} value; only $ can match it.`;
  })();

  const onDownload = () => {
    if (!csv) return;
    downloadCsv(csv, "workflow.csv");
    toast("Downloading workflow.csv", "info");
  };

  return (
    <div className="space-y-4">
      <OutputPanel title="Pipeline" description="Each step runs as you type. The first failing step stops the workflow.">
        <ol className="grid gap-2 sm:grid-cols-3" aria-label="Workflow steps">
          {stages.map((stage, i) => {
            const { Icon, className, label } = STAGE_ICON[stage.status];
            return (
              <li key={stage.id} className={cn("rounded-lg border bg-bg-elevated px-3 py-2.5", stage.status === "error" && "border-danger/60", stage.status === "ok" && "border-success/40")}>
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden="true" />
                  <span className="text-xs font-medium">
                    {i + 1}. {stage.title}
                  </span>
                  <Badge tone={stage.status === "ok" ? "success" : stage.status === "error" ? "danger" : "neutral"} className="ml-auto">
                    {label}
                  </Badge>
                </div>
                <p className={cn("mt-1 text-xs break-words", stage.status === "error" ? "text-danger" : "text-fg-muted")}>{stage.detail}</p>
              </li>
            );
          })}
        </ol>
        {/* Live region so screen readers hear the current error as soon as it appears; it is empty otherwise. */}
        <div aria-live="polite" aria-atomic="true" id={errorId} className="mt-3 empty:hidden">
          {result && !result.ok ? (
            <Alert tone="danger">
              <span className="font-medium">{stages.find((s) => s.status === "error")?.title}:</span> {result.error}
              {result.line ? ` (line ${result.line}${result.column ? `, column ${result.column}` : ""})` : ""}
              {noMatchHint ? <span className="mt-1 block text-fg-muted">{noMatchHint}</span> : null}
            </Alert>
          ) : null}
        </div>
      </OutputPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title="Step 1 · JSON input"
          description="Any JSON document. It stays in this tab's memory and is never stored or sent."
          actions={
            !json ? (
              <Button size="sm" variant="ghost" onClick={() => setJson(WORKFLOW_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setJson("")}>
                Clear
              </Button>
            )
          }
        >
          <Label htmlFor={jsonId} className="sr-only">
            JSON document
          </Label>
          <CodeTextarea
            id={jsonId}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"users": [{"id": 1, "name": "Ada"}]}'
            className="min-h-[420px]"
            invalid={failedStage === "parse"}
            aria-invalid={failedStage === "parse" || undefined}
            aria-describedby={failedStage === "parse" ? errorId : undefined}
          />
        </InputPanel>

        <div className="space-y-4">
          <InputPanel
            title="Step 2 · JSONPath selection"
            description="Pick the rows: a wildcard like $.users[*] selects one row per match, and a single array match like $.users is expanded into rows."
            actions={<CopyButton value={jsonPath} label="Copy expression" />}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor={exprId}>JSONPath expression</Label>
                <Input
                  id={exprId}
                  mono
                  value={jsonPath}
                  onChange={(e) => setJsonPath(e.target.value)}
                  placeholder={DEFAULT_WORKFLOW_EXPRESSION}
                  className="h-11 text-base"
                  invalid={failedStage === "select"}
                  aria-invalid={failedStage === "select" || undefined}
                  aria-describedby={failedStage === "select" ? errorId : undefined}
                />
              </div>
              <div className="sm:w-44">
                <Label htmlFor={delimId}>CSV delimiter</Label>
                <Select id={delimId} value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)} className="[&>select]:h-11">
                  {DELIMS.map((d) => (
                    <option key={d.label} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Example expressions">
              {WORKFLOW_EXAMPLES.map((ex) => (
                <button
                  key={ex.expr}
                  type="button"
                  onClick={() => setJsonPath(ex.expr)}
                  title={ex.label}
                  aria-label={`${ex.label}: ${ex.expr}`}
                  aria-pressed={ex.expr === jsonPath}
                  className={cn(
                    "rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring/40",
                    ex.expr === jsonPath && "border-accent text-accent-strong",
                  )}
                >
                  {ex.expr}
                </button>
              ))}
            </div>
          </InputPanel>

          <OutputPanel
            title="Step 3 · CSV output"
            description={
              result?.ok
                ? `${plural(result.rowCount, "row")} · ${result.columns.length ? plural(result.columns.length, "column") : "no header row"} · ${DELIM_NAME[result.delimiter]} delimited`
                : undefined
            }
            actions={
              <>
                <Button size="sm" onClick={onDownload} disabled={!csv} aria-label="Download CSV file">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download CSV
                </Button>
                <CopyButton value={csv} label="Copy CSV" variant="primary" />
              </>
            }
          >
            {!result ? (
              <EmptyState title="No CSV yet" description="Paste JSON on the left or load the sample to see the pipeline run." />
            ) : result.ok ? (
              <CodeTextarea readOnly value={result.csv} className="min-h-[220px] bg-surface" counter={false} aria-label="CSV output" />
            ) : (
              <EmptyState title={`Stopped at step ${stages.findIndex((s) => s.status === "error") + 1}`} description="Fix the error shown in the pipeline above to produce CSV." className="py-8" />
            )}
          </OutputPanel>
        </div>
      </div>
    </div>
  );
}
