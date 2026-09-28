"use client";

import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { CRON_EXAMPLES, explainCron } from "@/lib/tools/cron";
import { formatLocal } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function CronTool() {
  const [expr, setExpr] = useState("0 */2 * * *");
  const now = useNow(30_000);

  const result = useMemo(() => explainCron(expr, now ?? undefined), [expr, now]);
  // Next runs depend on the current time; only render them on the client to keep hydration clean.
  const nextRuns = now && result.ok ? result.nextRuns : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Expression"
          description="Standard 5-field crontab syntax: minute, hour, day of month, month, day of week."
          actions={<CopyButton value={expr.trim()} />}
        />
        <Label htmlFor="cron-in">Cron expression</Label>
        <Input
          id="cron-in"
          mono
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="*/15 * * * *"
          invalid={!result.ok}
          className="h-11 text-base"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CRON_EXAMPLES.map((ex) => (
            <button
              key={ex.expr}
              type="button"
              onClick={() => setExpr(ex.expr)}
              className="rounded-md border bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
              title={ex.label}
            >
              <span className="font-mono">{ex.expr}</span>
            </button>
          ))}
        </div>

        {result.ok ? (
          <div className="mt-4 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-accent-strong/80">Runs</div>
            <div className="mt-0.5 text-base font-medium text-fg">{result.description}</div>
          </div>
        ) : (
          <Alert tone="danger" className="mt-4">
            {result.error}
          </Alert>
        )}
      </Card>

      {result.fields.length ? (
        <Card>
          <CardHeader title="Fields" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {result.fields.map((f) => (
              <div
                key={f.name}
                className={cn(
                  "rounded-lg border bg-bg-elevated p-3",
                  !f.valid && "border-danger/50",
                )}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{f.name}</div>
                <div className="mt-1 font-mono text-lg">{f.raw}</div>
                <div className={cn("mt-1 text-xs", f.valid ? "text-fg-muted" : "text-danger")}>{f.valid ? f.description : f.error}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {nextRuns.length ? (
        <Card>
          <CardHeader title="Next runs" description="Calculated in your local timezone." actions={<Badge>{nextRuns.length} upcoming</Badge>} />
          <ol className="space-y-1.5">
            {nextRuns.map((d, i) => (
              <li key={d.getTime()} className="flex items-center gap-3 rounded-lg border bg-bg-elevated px-3 py-2 text-sm">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{i + 1}</span>
                <span>{formatLocal(d)}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      {!result.ok && expr.trim() ? null : (
        <p className="text-xs text-fg-subtle">
          Supports <span className="font-mono">*</span>, lists (<span className="font-mono">1,15</span>), ranges (<span className="font-mono">1-5</span>), steps (<span className="font-mono">*/10</span>), month/day names, and presets like <span className="font-mono">@daily</span>.
        </p>
      )}
    </div>
  );
}
