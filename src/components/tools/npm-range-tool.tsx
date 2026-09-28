"use client";

import { useMemo, useState } from "react";
import { RANGE_EXAMPLES, explainRange } from "@/lib/tools/npm-range";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function NpmRangeTool() {
  const [input, setInput] = useState("^5.2.1");
  const result = useMemo(() => explainRange(input), [input]);

  return (
    <div className="space-y-4">
      <InputPanel title="Version range" description="Paste a value from package.json dependencies.">
        <Label htmlFor="npm-range">Range</Label>
        <Input id="npm-range" mono value={input} onChange={(e) => setInput(e.target.value)} placeholder="^5.2.1" invalid={!result.ok && !!input.trim()} className="h-11 text-base" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RANGE_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                input === ex ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {ex}
            </button>
          ))}
        </div>
        {!result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </InputPanel>

      {result.ok ? (
        <>
          <OutputPanel title="Meaning" actions={<Badge tone="accent">{result.kind}</Badge>}>
            <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
              <div className="text-base font-medium">{result.summary}</div>
              {result.details.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
                  {result.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <OutputGrid className="mt-3">
              <OutputRow label="Normalized range" value={result.normalized} />
              <OutputRow label="Lowest allowed version" value={result.minVersion ?? ""} placeholder="—" />
            </OutputGrid>
          </OutputPanel>

          <div className="grid gap-4 md:grid-cols-2">
            <OutputPanel title="Allowed examples" actions={<CopyButton value={result.allowed.join("\n")} />}>
              <div className="flex flex-wrap gap-1.5">
                {result.allowed.map((v) => (
                  <Badge key={v} tone="success" className="font-mono text-xs">
                    {v}
                  </Badge>
                ))}
                {!result.allowed.length ? <span className="text-xs text-fg-subtle">None of the sample versions match.</span> : null}
              </div>
            </OutputPanel>
            <OutputPanel title="Not allowed examples">
              <div className="flex flex-wrap gap-1.5">
                {result.disallowed.map((v) => (
                  <Badge key={v} tone="danger" className="font-mono text-xs">
                    {v}
                  </Badge>
                ))}
                {!result.disallowed.length ? <span className="text-xs text-fg-subtle">Every sample version matches.</span> : null}
              </div>
            </OutputPanel>
          </div>
        </>
      ) : null}

      <OutputPanel title="Cheat sheet">
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            ["1.2.3", "Exact version only"],
            ["^1.2.3", "≥1.2.3 <2.0.0 — minor + patch updates (npm default)"],
            ["^0.2.3", "≥0.2.3 <0.3.0 — patch only, because major is 0"],
            ["^0.0.3", "Exactly 0.0.3"],
            ["~1.2.3", "≥1.2.3 <1.3.0 — patch updates only"],
            ["1.2.x / 1.2.*", "Any patch of 1.2"],
            ["1.x / 1", "Any minor or patch of 1"],
            ["* / x / (empty)", "Anything"],
            [">=1.2.0 <2.0.0", "Both conditions (AND)"],
            ["^1 || ^2", "Either side (OR)"],
            ["1.2.3 - 2.3.4", "Inclusive hyphen range"],
            ["latest / next", "Dist-tags resolve at install time, not ranges"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-start gap-3 rounded-lg border bg-bg-elevated px-3 py-2">
              <span className="shrink-0 font-mono text-accent-strong">{k}</span>
              <span className="text-fg-muted">{v}</span>
            </div>
          ))}
        </div>
      </OutputPanel>
    </div>
  );
}
