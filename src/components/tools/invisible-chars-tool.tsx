"use client";

import { useMemo, useState } from "react";
import { Eraser, Sparkles } from "lucide-react";
import { INVISIBLE_SAMPLE, normalizeWhitespace, removeInvisible, scanInvisible, segmentInvisible } from "@/lib/tools/invisible-chars";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function InvisibleCharsTool() {
  const [input, setInput] = useState("");
  const [includeBenign, setIncludeBenign] = useState(false);

  const scan = useMemo(() => scanInvisible(input, includeBenign), [input, includeBenign]);
  const segments = useMemo(() => segmentInvisible(input.slice(0, 20_000)), [input]);
  const cleaned = useMemo(() => removeInvisible(input), [input]);
  const normalized = useMemo(() => normalizeWhitespace(input), [input]);
  const suspicious = scan.suspicious.length;

  const summary = useMemo(() => {
    const byCp = new Map<number, { name: string; hex: string; count: number }>();
    for (const f of scan.findings) {
      const e = byCp.get(f.cp);
      if (e) e.count++;
      else byCp.set(f.cp, { name: f.name, hex: f.hex, count: 1 });
    }
    return Array.from(byCp.values()).sort((a, b) => b.count - a.count);
  }, [scan]);

  return (
    <div className="space-y-4">
      <InputPanel
        title="Text"
        description="Paste code, config, identifiers or copied text that “looks right but doesn't work”."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(INVISIBLE_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste text to scan…" className="min-h-[140px]" aria-label="Text to scan" />
        {input ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={suspicious ? "danger" : "success"}>{suspicious ? `${suspicious} suspicious character${suspicious === 1 ? "" : "s"}` : "No hidden characters"}</Badge>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
              <input type="checkbox" checked={includeBenign} onChange={(e) => setIncludeBenign(e.target.checked)} className="accent-accent" /> Also list normal spaces, tabs and newlines
            </label>
          </div>
        ) : null}
      </InputPanel>

      {!input ? (
        <EmptyState title="Nothing scanned yet" description="Zero-width spaces, non-breaking spaces, BOMs and bidi controls will be listed with their positions." />
      ) : (
        <>
          <OutputPanel title="Visualised" description="Every invisible character is shown as a marker. Hover for details.">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">
              {segments.map((s, i) =>
                s.finding ? (
                  <span
                    key={i}
                    title={`${s.finding.hex} ${s.finding.name} — line ${s.finding.line}, col ${s.finding.col}`}
                    className={cn(
                      "mx-px inline-block rounded px-1 align-baseline text-[10px] font-semibold leading-4",
                      s.finding.benign ? "ws-mark bg-surface-hover" : "bg-danger-soft text-danger",
                    )}
                  >
                    {s.finding.cp === 0x0a ? (
                      <>
                        {s.finding.glyph}
                        {"\n"}
                      </>
                    ) : (
                      s.finding.glyph
                    )}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
              {input.length > 20_000 ? <span className="text-fg-subtle">… (preview limited to 20,000 characters)</span> : null}
            </pre>
          </OutputPanel>

          <OutputPanel
            title="Findings"
            description={`${scan.findings.length} occurrence${scan.findings.length === 1 ? "" : "s"}`}
            actions={<CopyButton value={scan.findings.map((f) => `${f.line}:${f.col} ${f.hex} ${f.name}`).join("\n")} label="Copy list" />}
          >
            {summary.length ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {summary.map((s) => (
                  <Badge key={s.hex} tone={/SPACE$|TAB|LINE FEED/.test(s.name) && !/ZERO|NO-BREAK|IDEOGRAPHIC|EN |EM |THIN|HAIR/.test(s.name) ? "neutral" : "danger"}>
                    {s.hex} {s.name.toLowerCase()} ×{s.count}
                  </Badge>
                ))}
              </div>
            ) : null}
            {scan.findings.length === 0 ? (
              <Alert tone="success">Nothing suspicious. {includeBenign ? "" : "Tick the checkbox above to include ordinary whitespace."}</Alert>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">Position</th>
                      <th className="px-3 py-2 font-medium">Code point</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Suggestion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {scan.findings.slice(0, 500).map((f, i) => (
                      <tr key={i} className="bg-bg-elevated">
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-fg-muted">
                          {f.line}:{f.col} <span className="text-fg-subtle">(#{f.index})</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-accent-strong">{f.hex}</td>
                        <td className={cn("px-3 py-1.5 text-xs", f.benign ? "text-fg-muted" : "text-fg")}>{f.name}</td>
                        <td className="px-3 py-1.5 text-xs text-fg-muted">{f.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scan.findings.length > 500 ? <div className="px-3 py-2 text-xs text-fg-subtle">Showing first 500 of {scan.findings.length}.</div> : null}
              </div>
            )}
          </OutputPanel>

          <OutputPanel
            title="Cleanup"
            description="Apply a fix to the input above, or copy the cleaned text."
            actions={
              <>
                <Button size="sm" onClick={() => setInput(cleaned)} disabled={cleaned === input}>
                  <Eraser className="h-3.5 w-3.5" /> Remove invisible
                </Button>
                <Button size="sm" onClick={() => setInput(normalized)} disabled={normalized === input}>
                  <Sparkles className="h-3.5 w-3.5" /> Normalize whitespace
                </Button>
                <CopyButton value={cleaned} label="Copy cleaned" variant="primary" />
              </>
            }
          >
            <p className="text-xs text-fg-muted">
              <span className="font-medium text-fg">Remove invisible</span> drops zero-width and bidi characters, turns exotic spaces into normal spaces and CRLF into LF, keeping ordinary spaces, tabs and newlines.{" "}
              <span className="font-medium text-fg">Normalize whitespace</span> additionally collapses runs of spaces, trims line ends and squeezes blank lines.
            </p>
          </OutputPanel>
        </>
      )}
    </div>
  );
}
