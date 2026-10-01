"use client";

import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { Eraser } from "lucide-react";
import { CRON_EXAMPLES, describeCron, explainCron } from "@/lib/tools/cron";
import { compareCron, CRON_COMPARE_SAMPLE, CRON_WINDOW_DAYS, MAX_CRON_COMPARE, runRate, splitCronPaste } from "@/lib/tools/cron-compare";
import { formatLocal } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";
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

      <CronCompare now={now} />
    </div>
  );
}

const runFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtRun = (d: Date) => runFormat.format(d);

/** Several cron expressions side by side: a merged upcoming-runs timeline and the minutes where they collide. */
function CronCompare({ now }: { now: Date | null }) {
  const list = useValueList({ max: MAX_CRON_COMPARE });
  const { values, hasInput, reset } = list;
  // Runs depend on the current time, so results only exist on the client (now is null during hydration).
  const result = useMemo(() => (now ? compareCron(values, now) : null), [values, now]);
  const entries = result?.entries ?? [];

  const report = result
    ? [
        ...entries.map((e) => `#${e.line} ${e.input}  ${e.description} (${runRate(e.runsInWindow)})`),
        "",
        `Next runs:`,
        ...result.timeline.map((t) => `  ${fmtRun(t.date)}  ${t.lines.map((l) => `#${l}`).join(" ")}`),
        "",
        result.collisions.length ? `Collisions in the next ${CRON_WINDOW_DAYS} days (${result.collisionMinutes} minutes):` : `No collisions in the next ${CRON_WINDOW_DAYS} days.`,
        ...result.collisions.map((c) => `  ${c.lines.map((l) => `#${l}`).join(" + ")}: ${c.count}x, next ${c.next.map(fmtRun).join(", ")}`),
      ].join("\n")
    : "";

  return (
    <Card>
      <CardHeader
        title="Compare schedules"
        description={`One expression per box. Shows the next runs of all of them together and where two or more fire in the same minute over the next ${CRON_WINDOW_DAYS} days.`}
        actions={
          !hasInput ? (
            <Button size="sm" variant="ghost" onClick={() => reset(CRON_COMPARE_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => reset([])}>
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
          )
        }
      />

      <ValueList
        list={list}
        id="cron-cmp"
        placeholder="*/15 * * * *"
        itemLabel="expression"
        splitPaste={splitCronPaste}
        status={(value) => {
          const d = describeCron(value);
          return d.error !== undefined ? { tone: "error", content: d.error } : { tone: "ok", content: d.description };
        }}
      />

      {result && entries.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {result.collisionMinutes ? (
              <Badge tone="warning">
                {result.collisionMinutes} {result.collisionMinutes === 1 ? "collision" : "collisions"} in {CRON_WINDOW_DAYS} days
              </Badge>
            ) : (
              <Badge tone="success">No collisions in {CRON_WINDOW_DAYS} days</Badge>
            )}
            {entries.map((e) => (
              <Badge key={e.line} title={e.description}>
                #{e.line} · {runRate(e.runsInWindow)}
              </Badge>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Next runs · your local timezone</div>
            {/* Two newspaper-style columns keep 20 runs short while still reading top to bottom. */}
            <ol className="gap-2 sm:columns-2">
              {result.timeline.map((t, i) => (
                <li key={t.date.getTime()} className="mb-1.5 flex break-inside-avoid items-center gap-3 rounded-lg border bg-bg-elevated px-3 py-1.5 text-sm">
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{i + 1}</span>
                  <span className="min-w-0 flex-1" title={formatLocal(t.date)}>
                    {fmtRun(t.date)}
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {t.lines.map((l) => (
                      <Badge key={l} tone={t.lines.length > 1 ? "warning" : "accent"}>
                        #{l}
                      </Badge>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {result.collisions.length ? (
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Collisions · next {CRON_WINDOW_DAYS} days</div>
              <ul className="space-y-1.5">
                {result.collisions.map((c) => (
                  <li key={c.lines.join(",")} className="rounded-lg border bg-bg-elevated px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{c.lines.map((l) => `#${l}`).join(" + ")}</span>
                      <span className="text-xs text-fg-muted">
                        {c.count} {c.count === 1 ? "time" : "times"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-subtle">Next: {c.next.map(fmtRun).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {entries.length === 1 ? "Add at least one more expression to compare." : "Enter two or more cron expressions to compare their schedules."}
        </p>
      )}
    </Card>
  );
}
