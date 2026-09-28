"use client";

import { useMemo, useState } from "react";

/** Text files are parsed synchronously in the browser; keep them modest. */
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
import { Download } from "lucide-react";
import { parseJson } from "@/lib/tools/json";
import { CSV_SAMPLE, csvToJson, jsonToCsv, type Delimiter } from "@/lib/tools/csv-json";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/ui/toast";

type Mode = "csv-json" | "json-csv";

const DELIMS: Array<{ value: Delimiter | "auto"; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: ",", label: "Comma ," },
  { value: ";", label: "Semicolon ;" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe |" },
];
const DELIM_NAME: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

function download(text: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function CsvJsonTool() {
  const [mode, setMode] = useState<Mode>("csv-json");
  const [input, setInput] = useState("");
  const [delimiter, setDelimiter] = useState<Delimiter | "auto">("auto");
  const [header, setHeader] = useState(true);
  const [infer, setInfer] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  const result = useMemo(() => {
    if (!input.trim()) return null;
    if (mode === "csv-json") {
      const r = csvToJson(input, { delimiter, header, infer });
      return { ok: r.ok, output: r.ok ? JSON.stringify(r.data, null, 2) : "", error: r.error, meta: r.ok ? `${r.rows.length} rows · ${r.headers.length || (r.rows[0]?.length ?? 0)} columns · ${DELIM_NAME[r.delimiter]} delimited` : "", warnings: r.warnings };
    }
    const p = parseJson(input);
    if (!p.ok) return { ok: false, output: "", error: p.error, meta: "", warnings: [] };
    const r = jsonToCsv(p.value, delimiter === "auto" ? "," : delimiter);
    return { ok: r.ok, output: r.csv, error: r.error, meta: r.ok ? `${r.csv ? r.csv.split("\n").length - (r.columns.length ? 1 : 0) : 0} rows · ${r.columns.length} columns` : "", warnings: [] };
  }, [input, mode, delimiter, header, infer]);

  const onFile = async (file: File) => {
    if (file.size > MAX_TEXT_FILE_BYTES) {
      toast(`That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB; files up to ${MAX_TEXT_FILE_BYTES / (1024 * 1024)} MB can be loaded here.`, "error");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast("Could not read that file.", "error");
      return;
    }
    setInput(text);
    setFileName(file.name);
    if (/\.json$/i.test(file.name)) setMode("json-csv");
    else if (/\.(csv|tsv|txt)$/i.test(file.name)) setMode("csv-json");
    toast(`Loaded ${file.name}`, "info");
  };

  const swap = () => {
    if (result?.ok && result.output) {
      setInput(result.output);
      setMode(mode === "csv-json" ? "json-csv" : "csv-json");
    }
  };

  const outName = mode === "csv-json" ? "data.json" : "data.csv";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title={mode === "csv-json" ? "CSV" : "JSON"}
          description={fileName ? `From ${fileName}` : mode === "csv-json" ? "Quoted fields, embedded commas and newlines are handled (RFC 4180)." : "An array of flat objects. Nested values are JSON-stringified into the cell."}
          actions={
            <>
              <Segmented
                size="sm"
                value={mode}
                onChange={(m) => {
                  setMode(m);
                  setFileName(null);
                }}
                options={[
                  { value: "csv-json", label: "CSV → JSON" },
                  { value: "json-csv", label: "JSON → CSV" },
                ]}
              />
              {!input ? (
                <Button size="sm" variant="ghost" onClick={() => setInput(mode === "csv-json" ? CSV_SAMPLE : JSON.stringify(csvToJson(CSV_SAMPLE).data, null, 2))}>
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInput("");
                    setFileName(null);
                  }}
                >
                  Clear
                </Button>
              )}
            </>
          }
        >
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "csv-json" ? "id,name\n1,Ada" : '[{"id":1,"name":"Ada"}]'} className="min-h-[300px]" invalid={result ? !result.ok : false} aria-label="Input" />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="csv-delim">Delimiter</Label>
              <Select id="csv-delim" value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter | "auto")}>
                {DELIMS.map((d) => (
                  <option key={d.label} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            {mode === "csv-json" ? (
              <>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg-muted cursor-pointer">
                  <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} className="accent-accent" /> First row is header
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg-muted cursor-pointer">
                  <input type="checkbox" checked={infer} onChange={(e) => setInfer(e.target.checked)} className="accent-accent" /> Infer numbers & booleans
                </label>
              </>
            ) : null}
          </div>
          <Dropzone onFile={onFile} accept=".csv,.tsv,.txt,.json,text/csv,application/json" compact className="mt-3" title="Drop a .csv or .json file" description="or click to upload · read locally" paste={false} />
        </InputPanel>

        <OutputPanel
          title={mode === "csv-json" ? "JSON" : "CSV"}
          description={result?.ok ? result.meta : undefined}
          actions={
            <>
              <Button size="sm" onClick={swap} disabled={!result?.ok || !result.output}>
                Swap
              </Button>
              <Button size="sm" onClick={() => download(result?.output ?? "", outName, mode === "csv-json" ? "application/json" : "text/csv")} disabled={!result?.ok || !result.output}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <CopyButton value={result?.ok ? result.output : ""} variant="primary" />
            </>
          }
        >
          {!result ? (
            <EmptyState title="Nothing to convert yet" description="Paste or drop a file on the left." />
          ) : result.ok ? (
            <>
              <CodeTextarea readOnly value={result.output} className="min-h-[300px] bg-surface" counter={false} aria-label="Output" />
              {result.warnings.length ? (
                <Alert tone="warning" className="mt-3">
                  <ul className="list-disc pl-4">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </>
          ) : (
            <Alert tone="danger">{result.error}</Alert>
          )}
        </OutputPanel>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-fg-subtle">
        <Badge>Files are read with FileReader and never uploaded</Badge>
      </div>
    </div>
  );
}
