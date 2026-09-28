"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { diffEnv, ENV_SAMPLE, maskValue, parseEnv, type EnvParseResult } from "@/lib/tools/env";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Mode = "keys" | "values";

const SAMPLE_B = `DATABASE_URL="postgres://app:prod-secret@db.internal:5432/app"
DB_POOL_SIZE=50
JWT_SECRET=
SENTRY_DSN=https://abc@sentry.io/1
API_BASE_URL=https://api.example.com
DEBUG=false`;

export function EnvDiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mode, setMode] = useState<Mode>("keys");
  const [showValues, setShowValues] = useState(false);

  const parsedA = useMemo(() => (a.trim() ? parseEnv(a) : null), [a]);
  const parsedB = useMemo(() => (b.trim() ? parseEnv(b) : null), [b]);
  const diff = useMemo(() => (parsedA && parsedB ? diffEnv(parsedA, parsedB) : null), [parsedA, parsedB]);
  const differing = diff ? diff.inBoth.filter((k) => !k.same) : [];

  const val = (p: EnvParseResult | null, key: string) => {
    const v = p?.map.get(key)?.value ?? "";
    return showValues ? v : maskValue(v);
  };

  const report = diff
    ? [
        `Missing from A (${diff.missingFromA.length}): ${diff.missingFromA.join(", ") || "-"}`,
        `Missing from B (${diff.missingFromB.length}): ${diff.missingFromB.join(", ") || "-"}`,
        `In both (${diff.inBoth.length})${mode === "values" ? `, differing values: ${differing.map((d) => d.key).join(", ") || "-"}` : ""}`,
        `Empty in A: ${diff.emptyA.join(", ") || "-"}`,
        `Empty in B: ${diff.emptyB.join(", ") || "-"}`,
      ].join("\n")
    : "";

  return (
    <div className="space-y-4">
      <Alert tone="info">Values are hidden by default and compared only when you switch to value mode. Nothing is stored or sent anywhere.</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        <InputPanel title="Environment A" description="e.g. .env.development" actions={!a ? <Button size="sm" variant="ghost" onClick={() => setA(ENV_SAMPLE)}>Load sample</Button> : <Button size="sm" variant="ghost" onClick={() => setA("")}>Clear</Button>}>
          <Label htmlFor="env-a" hint={parsedA ? `${parsedA.map.size} keys` : undefined}>
            Contents
          </Label>
          <Textarea id="env-a" value={a} onChange={(e) => setA(e.target.value)} placeholder="KEY=value" className="min-h-[220px]" data-1p-ignore="true" data-lpignore="true" style={showValues ? undefined : { WebkitTextSecurity: "disc" } as React.CSSProperties} />
        </InputPanel>
        <InputPanel title="Environment B" description="e.g. .env.production" actions={!b ? <Button size="sm" variant="ghost" onClick={() => setB(SAMPLE_B)}>Load sample</Button> : <Button size="sm" variant="ghost" onClick={() => setB("")}>Clear</Button>}>
          <Label htmlFor="env-b" hint={parsedB ? `${parsedB.map.size} keys` : undefined}>
            Contents
          </Label>
          <Textarea id="env-b" value={b} onChange={(e) => setB(e.target.value)} placeholder="KEY=value" className="min-h-[220px]" data-1p-ignore="true" data-lpignore="true" style={showValues ? undefined : { WebkitTextSecurity: "disc" } as React.CSSProperties} />
        </InputPanel>
      </div>

      <OutputPanel
        title="Comparison"
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "keys", label: "Keys only" },
                { value: "values", label: "Keys + values" },
              ]}
            />
            <Button size="sm" variant={showValues ? "secondary" : "ghost"} onClick={() => setShowValues((s) => !s)}>
              {showValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showValues ? "Hide values" : "Show values"}
            </Button>
            <CopyButton value={report} label="Copy summary" />
          </>
        }
      >
        {!diff ? (
          <EmptyState title="Paste both environment files" description="Keys are compared; values stay masked until you reveal them." />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={diff.missingFromA.length ? "danger" : "success"}>{diff.missingFromA.length} missing from A</Badge>
              <Badge tone={diff.missingFromB.length ? "danger" : "success"}>{diff.missingFromB.length} missing from B</Badge>
              <Badge>{diff.inBoth.length} in both</Badge>
              {mode === "values" ? <Badge tone={differing.length ? "warning" : "success"}>{differing.length} differing values</Badge> : null}
              {diff.emptyA.length + diff.emptyB.length ? <Badge tone="warning">{diff.emptyA.length + diff.emptyB.length} empty</Badge> : null}
              {diff.duplicatesA.length + diff.duplicatesB.length ? <Badge tone="warning">{diff.duplicatesA.length + diff.duplicatesB.length} duplicated</Badge> : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <KeyList title="Missing from A" tone="danger" keys={diff.missingFromA} render={(k) => (mode === "values" ? val(parsedB, k) : undefined)} note="Only in B" />
              <KeyList title="Missing from B" tone="danger" keys={diff.missingFromB} render={(k) => (mode === "values" ? val(parsedA, k) : undefined)} note="Only in A" />
              <KeyList title="Empty values" tone="warning" keys={Array.from(new Set([...diff.emptyA.map((k) => `${k} (A)`), ...diff.emptyB.map((k) => `${k} (B)`)]))} />
              <KeyList title="Duplicate keys" tone="warning" keys={Array.from(new Set([...diff.duplicatesA.map((k) => `${k} (A)`), ...diff.duplicatesB.map((k) => `${k} (B)`)]))} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Present in both ({diff.inBoth.length})</div>
              {diff.inBoth.length === 0 ? (
                <p className="text-xs text-fg-subtle">No shared keys.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <tr>
                        <th className="px-3 py-2 font-medium">Key</th>
                        {mode === "values" ? (
                          <>
                            <th className="px-3 py-2 font-medium">A</th>
                            <th className="px-3 py-2 font-medium">B</th>
                          </>
                        ) : null}
                        <th className="px-3 py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {diff.inBoth.map((k) => (
                        <tr key={k.key} className="bg-bg-elevated">
                          <td className="px-3 py-1.5 font-mono text-xs text-accent-strong">{k.key}</td>
                          {mode === "values" ? (
                            <>
                              <td className={cn("break-all px-3 py-1.5 font-mono text-xs", !k.same && "text-danger")}>{val(parsedA, k.key) || <span className="text-fg-subtle">(empty)</span>}</td>
                              <td className={cn("break-all px-3 py-1.5 font-mono text-xs", !k.same && "text-success")}>{val(parsedB, k.key) || <span className="text-fg-subtle">(empty)</span>}</td>
                            </>
                          ) : null}
                          <td className="px-3 py-1.5 text-right">{mode === "values" ? <Badge tone={k.same ? "success" : "warning"}>{k.same ? "same" : "differs"}</Badge> : <Badge tone="success">both</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </OutputPanel>
    </div>
  );
}

function KeyList({ title, tone, keys, render, note }: { title: string; tone: "danger" | "warning"; keys: string[]; render?: (k: string) => string | undefined; note?: string }) {
  return (
    <div className="rounded-lg border bg-bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{title}</span>
        <Badge tone={keys.length ? tone : "success"}>{keys.length}</Badge>
      </div>
      {keys.length === 0 ? (
        <p className="text-xs text-fg-subtle">None.</p>
      ) : (
        <ul className="space-y-1 font-mono text-xs">
          {keys.map((k) => {
            const v = render?.(k);
            return (
              <li key={k} className="flex items-center gap-2">
                <span className="text-fg">{k}</span>
                {v !== undefined ? <span className="truncate text-fg-subtle">= {v || "(empty)"}</span> : null}
                {note ? <span className="ml-auto text-[10px] font-sans text-fg-subtle">{note}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
