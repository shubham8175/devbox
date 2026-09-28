"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ENV_SAMPLE, maskValue, parseEnv, type EnvIssue } from "@/lib/tools/env";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const TONE: Record<EnvIssue["severity"], "danger" | "warning" | "neutral"> = { error: "danger", warning: "warning", info: "neutral" };

export function EnvValidatorTool() {
  const [input, setInput] = useState("");
  const [showValues, setShowValues] = useState(false);
  const parsed = useMemo(() => (input.trim() ? parseEnv(input) : null), [input]);
  const errors = parsed?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnings = parsed?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const infos = parsed?.issues.filter((i) => i.severity === "info").length ?? 0;
  const report = parsed ? parsed.issues.map((i) => `line ${i.line} [${i.severity}] ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ""}`).join("\n") : "";

  return (
    <div className="space-y-4">
      <Alert tone="info">Parsed locally. Values are masked by default and never stored or logged. The report lists keys and line numbers, not values.</Alert>
      <InputPanel
        title=".env contents"
        actions={
          <>
            <Button size="sm" variant={showValues ? "secondary" : "ghost"} onClick={() => setShowValues((s) => !s)}>
              {showValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showValues ? "Hide values" : "Show values"}
            </Button>
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(ENV_SAMPLE)}>
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
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=..."} className="min-h-[220px]" data-1p-ignore="true" data-lpignore="true" style={showValues ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)} aria-label=".env contents" />
      </InputPanel>

      {!parsed ? (
        <EmptyState title="Paste a .env file" description="Checks keys, quoting, whitespace, duplicates and empty values." />
      ) : (
        <>
          <OutputPanel
            title="Findings"
            actions={
              <>
                <Badge tone={errors ? "danger" : "success"}>{errors} errors</Badge>
                <Badge tone={warnings ? "warning" : "success"}>{warnings} warnings</Badge>
                <Badge>{infos} notes</Badge>
                <CopyButton value={report} label="Copy report" />
              </>
            }
          >
            {parsed.issues.length === 0 ? (
              <Alert tone="success">No issues found. {parsed.map.size} keys parsed.</Alert>
            ) : (
              <ul className="space-y-1.5">
                {parsed.issues.map((i, idx) => (
                  <li key={idx} className={cn("rounded-lg border border-l-2 bg-bg-elevated px-3 py-2 text-sm", i.severity === "error" ? "border-l-danger" : i.severity === "warning" ? "border-l-warning" : "border-l-border-strong")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-fg-subtle">L{i.line}</span>
                      <Badge tone={TONE[i.severity]}>{i.severity}</Badge>
                      <span className="text-fg">{i.message}</span>
                    </div>
                    {i.suggestion ? <div className="mt-1 text-xs text-fg-muted">{i.suggestion}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </OutputPanel>

          <OutputPanel title="Parsed keys" description={`${parsed.map.size} unique · ${parsed.entries.length} definitions`}>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 text-right font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.entries.map((e, i) => {
                    const dup = parsed.duplicates.has(e.key);
                    const winner = parsed.map.get(e.key) === e;
                    return (
                      <tr key={i} className="bg-bg-elevated">
                        <td className="px-3 py-1.5 font-mono text-[11px] text-fg-subtle">{e.line}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-accent-strong">{e.key}</td>
                        <td className="break-all px-3 py-1.5 font-mono text-xs">{e.value === "" ? <span className="text-fg-subtle">(empty)</span> : showValues ? e.value : maskValue(e.value)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="inline-flex gap-1">
                            {e.exported ? <Badge>export</Badge> : null}
                            {e.quote ? <Badge>{e.quote === '"' ? "double-quoted" : "single-quoted"}</Badge> : null}
                            {dup ? <Badge tone={winner ? "warning" : "danger"}>{winner ? "wins" : "overridden"}</Badge> : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </OutputPanel>
        </>
      )}
    </div>
  );
}
