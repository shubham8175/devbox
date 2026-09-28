"use client";

import { useMemo, useState } from "react";
import { fromCodePointInput, inspectText, UNICODE_LIMIT } from "@/lib/tools/unicode";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const EXAMPLES = ["🔥", "👨‍👩‍👧", "é", "日本語", "Ω≈ç√", "Z̷̢a̶l̸g̵o̷"];

export function UnicodeTool() {
  const [input, setInput] = useState("");
  const [cpInput, setCpInput] = useState("");

  const result = useMemo(() => (input ? inspectText(input) : null), [input]);
  const cpChar = fromCodePointInput(cpInput);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <InputPanel title="Text" className="lg:col-span-2" actions={input ? <Button size="sm" variant="ghost" onClick={() => setInput("")}>Clear</Button> : null}>
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or paste any text, emoji or symbol" className="min-h-[100px] font-sans text-base" aria-label="Text to inspect" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setInput(ex)} className="rounded-md border bg-bg-elevated px-2 py-0.5 text-sm transition-colors hover:border-border-strong cursor-pointer" title={`Inspect ${ex}`}>
                {ex}
              </button>
            ))}
          </div>
        </InputPanel>
        <InputPanel title="From code point" description="U+1F525, 0x1F525 or 1F525">
          <Label htmlFor="uni-cp">Code point</Label>
          <Input id="uni-cp" mono value={cpInput} onChange={(e) => setCpInput(e.target.value)} placeholder="U+1F525" invalid={!!cpInput.trim() && cpChar === null} />
          {cpChar ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg border bg-bg-elevated text-2xl">{cpChar}</span>
              <Button size="sm" onClick={() => setInput((s) => s + cpChar)}>
                Append to text
              </Button>
              <CopyButton value={cpChar} iconOnly />
            </div>
          ) : cpInput.trim() ? (
            <Alert tone="danger" className="mt-3">
              Not a valid code point (0–10FFFF).
            </Alert>
          ) : null}
        </InputPanel>
      </div>

      {!result ? (
        <EmptyState title="Nothing to inspect" description="Each character will be broken down into its code point, UTF-8 bytes and UTF-16 units." />
      ) : (
        <>
          <OutputPanel title="Totals" actions={result.summary.truncated ? <Badge tone="warning">Showing first {UNICODE_LIMIT} characters</Badge> : null}>
            <OutputGrid className="sm:grid-cols-4">
              <OutputRow label="Graphemes" value={String(result.summary.graphemes)} hint="what a user sees" copyable={false} />
              <OutputRow label="Code points" value={String(result.summary.codePoints)} hint="Array.from(str).length" copyable={false} />
              <OutputRow label="UTF-16 units" value={String(result.summary.utf16Units)} hint="str.length in JS" copyable={false} />
              <OutputRow label="UTF-8 bytes" value={String(result.summary.utf8Bytes)} hint="on the wire / in files" copyable={false} />
            </OutputGrid>
            {result.summary.graphemes !== result.summary.codePoints ? (
              <Alert tone="info" className="mt-3">
                Some visible characters are made of several code points (combining marks, emoji sequences). Length checks and substring operations can split them.
              </Alert>
            ) : null}
          </OutputPanel>

          <OutputPanel title="Characters" actions={<CopyButton value={result.chars.map((c) => `${c.char}\t${c.uPlus}\t${c.utf8}\t${c.jsEscape}`).join("\n")} label="Copy table" />}>
            <div className="max-h-[520px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Char</th>
                    <th className="px-3 py-2 font-medium">Code point</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">UTF-8</th>
                    <th className="px-3 py-2 font-medium">UTF-16</th>
                    <th className="px-3 py-2 font-medium">JS escape</th>
                    <th className="px-3 py-2 font-medium">HTML</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.chars.map((c) => (
                    <tr key={c.index} className="bg-bg-elevated">
                      <td className="px-3 py-1.5 text-lg">{c.category === "Control" || c.category === "Format (invisible)" || c.category === "Space" || c.category === "Separator" ? <span className="text-xs text-fg-subtle">{c.category === "Space" ? "␠" : "␀"}</span> : c.char}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        <span className="text-accent-strong">{c.uPlus}</span> <span className="text-fg-subtle">({c.cp})</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-fg-muted">{c.category}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                        {c.utf8} <span className="text-fg-subtle">({c.utf8Bytes}B)</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                        {c.utf16}
                        {c.utf16Units > 1 ? <span className="text-fg-subtle"> (surrogate pair)</span> : null}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">{c.jsEscape}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{c.htmlEntity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OutputPanel>
        </>
      )}
    </div>
  );
}
