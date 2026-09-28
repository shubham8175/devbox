"use client";

import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import * as T from "@/lib/tools/text";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const OPS: Array<{ label: string; fn: (t: string) => string }> = [
  { label: "Remove duplicates", fn: T.removeDuplicateLines },
  { label: "Unique only", fn: T.uniqueOnlyLines },
  { label: "Sort A → Z", fn: T.sortAZ },
  { label: "Sort Z → A", fn: T.sortZA },
  { label: "Numeric sort", fn: T.sortNumeric },
  { label: "Reverse lines", fn: T.reverseLines },
  { label: "Shuffle", fn: T.shuffleLines },
  { label: "Trim lines", fn: T.trimLines },
  { label: "Remove empty lines", fn: T.removeEmptyLines },
  { label: "Collapse spaces", fn: T.collapseSpaces },
  { label: "LF → CRLF", fn: T.toCRLF },
  { label: "CRLF → LF", fn: T.toLF },
];

export function TextTool() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const stats = useMemo(() => T.textStats(text), [text]);
  const eol = /\r\n/.test(text) ? "CRLF" : text.includes("\n") ? "LF" : "—";

  const apply = (fn: (t: string) => string, label?: string) => {
    const next = fn(text);
    if (next === text) {
      setLastResult(label ? `${label}: no change` : null);
      return;
    }
    setHistory((h) => [...h.slice(-19), text]);
    setText(next);
    setLastResult(label ? `${label} applied` : null);
  };
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setText(h[h.length - 1]);
      return h.slice(0, -1);
    });
    setLastResult(null);
  };

  const preview = useMemo(() => (find ? T.findReplace(text, find, replace, { regex, caseSensitive }) : null), [text, find, replace, regex, caseSensitive]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <InputPanel
          title="Text"
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={undo} disabled={!history.length} title="Undo last operation">
                <Undo2 className="h-3.5 w-3.5" /> Undo{history.length ? ` (${history.length})` : ""}
              </Button>
              {!text ? (
                <Button size="sm" variant="ghost" onClick={() => setText(T.TEXT_SAMPLE)}>
                  Load sample
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => apply(() => "", "Clear")}>
                  Clear
                </Button>
              )}
              <CopyButton value={text} variant="primary" />
            </>
          }
        >
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lines of text…" className="min-h-[360px]" aria-label="Text" />
          {lastResult ? <p className="mt-2 text-xs text-fg-subtle">{lastResult}</p> : null}
        </InputPanel>

        <OutputPanel title="Statistics">
          <OutputGrid className="sm:grid-cols-3">
            <OutputRow label="Characters" value={stats.chars.toLocaleString()} copyable={false} />
            <OutputRow label="Excluding spaces" value={stats.charsNoSpaces.toLocaleString()} copyable={false} />
            <OutputRow label="Words" value={stats.words.toLocaleString()} copyable={false} />
            <OutputRow label="Lines" value={stats.lines.toLocaleString()} hint={`${stats.nonEmptyLines.toLocaleString()} non-empty`} copyable={false} />
            <OutputRow label="UTF-8 bytes" value={stats.bytes.toLocaleString()} copyable={false} />
            <OutputRow label="Line endings" value={eol} copyable={false} />
          </OutputGrid>
        </OutputPanel>
      </div>

      <div className="space-y-4">
        <OutputPanel title="Line operations" description="Each button transforms the text in place. Undo is available.">
          <div className="grid grid-cols-2 gap-1.5">
            {OPS.map((op) => (
              <Button key={op.label} size="sm" onClick={() => apply(op.fn, op.label)} disabled={!text} className="justify-start">
                {op.label}
              </Button>
            ))}
          </div>
        </OutputPanel>

        <OutputPanel title="Prefix / suffix">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tt-prefix">Prefix</Label>
              <Input id="tt-prefix" mono value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="- " />
            </div>
            <div>
              <Label htmlFor="tt-suffix">Suffix</Label>
              <Input id="tt-suffix" mono value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder=";" />
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" onClick={() => apply((t) => T.addPrefix(t, prefix), "Prefix")} disabled={!text || !prefix}>
              Add prefix
            </Button>
            <Button size="sm" onClick={() => apply((t) => T.addSuffix(t, suffix), "Suffix")} disabled={!text || !suffix}>
              Add suffix
            </Button>
          </div>
        </OutputPanel>

        <OutputPanel title="Find & replace">
          <div className="space-y-2">
            <div>
              <Label htmlFor="tt-find">Find</Label>
              <Input id="tt-find" mono value={find} onChange={(e) => setFind(e.target.value)} placeholder={regex ? "(\\d+) items" : "apple"} invalid={preview ? !preview.ok : false} />
            </div>
            <div>
              <Label htmlFor="tt-replace">Replace with</Label>
              <Input id="tt-replace" mono value={replace} onChange={(e) => setReplace(e.target.value)} placeholder={regex ? "$1 things" : "orange"} />
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-fg-muted">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} className="accent-accent" /> Regex
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="accent-accent" /> Case sensitive
              </label>
            </div>
            {preview && !preview.ok ? <Alert tone="danger">{preview.error}</Alert> : null}
            <Button size="sm" variant="primary" onClick={() => preview?.ok && apply(() => preview.text, "Replace")} disabled={!preview?.ok || preview.count === 0} className="w-full">
              Replace {preview?.ok ? `${preview.count} match${preview.count === 1 ? "" : "es"}` : ""}
            </Button>
          </div>
        </OutputPanel>
      </div>
    </div>
  );
}
