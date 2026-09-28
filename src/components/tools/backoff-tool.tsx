"use client";

import { useMemo, useState } from "react";
import { Dices } from "lucide-react";
import { JITTER_MODES, computeSchedule, formatMs, type BackoffOptions, type JitterMode } from "@/lib/tools/backoff";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const DEFAULTS: BackoffOptions = { initialDelay: 500, multiplier: 2, maxRetries: 6, maxDelay: 30_000, jitter: "full" };

export function BackoffTool() {
  const [opts, setOpts] = useState<BackoffOptions>(DEFAULTS);
  const [seed, setSeed] = useState(1);
  const set = <K extends keyof BackoffOptions>(k: K, v: BackoffOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const valid = opts.initialDelay >= 0 && opts.multiplier >= 1 && opts.maxRetries >= 0 && opts.maxDelay >= 0 && Number.isFinite(opts.initialDelay + opts.multiplier + opts.maxRetries + opts.maxDelay);
  const schedule = useMemo(() => (valid ? computeSchedule(opts, seed) : []), [opts, seed, valid]);
  const maxBar = Math.max(1, ...schedule.map((s) => s.delay));
  const total = schedule.length ? schedule[schedule.length - 1].cumulative : 0;
  const json = JSON.stringify(
    { ...opts, seed: opts.jitter === "none" ? undefined : seed, schedule: schedule.map((s) => ({ attempt: s.attempt, delayMs: s.delay, cumulativeMs: s.cumulative })) },
    null,
    2,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InputPanel title="Parameters" className="lg:col-span-2 lg:self-start">
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="bo-initial" label="Initial delay (ms)" value={opts.initialDelay} onChange={(v) => set("initialDelay", v)} min={0} />
          <NumberField id="bo-mult" label="Multiplier" value={opts.multiplier} onChange={(v) => set("multiplier", v)} min={1} step={0.1} />
          <NumberField id="bo-retries" label="Max retries" value={opts.maxRetries} onChange={(v) => set("maxRetries", v)} min={0} max={50} />
          <NumberField id="bo-max" label="Max delay (ms)" value={opts.maxDelay} onChange={(v) => set("maxDelay", v)} min={0} />
        </div>
        <div className="mt-3">
          <Label>Jitter</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {JITTER_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => set("jitter", m.id as JitterMode)}
                title={m.hint}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-xs transition-colors cursor-pointer",
                  opts.jitter === m.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-[10px] text-fg-subtle">{m.hint}</div>
              </button>
            ))}
          </div>
        </div>
        {opts.jitter !== "none" ? (
          <Button size="sm" className="mt-3" onClick={() => setSeed((s) => s + 1)}>
            <Dices className="h-3.5 w-3.5" /> Re-roll jitter
          </Button>
        ) : null}
        {!valid ? (
          <Alert tone="danger" className="mt-3">
            Delays must be ≥ 0, multiplier ≥ 1 and retries between 0 and 50.
          </Alert>
        ) : null}
        <p className="mt-3 text-[11px] text-fg-subtle">Jittered previews use a seeded generator so the table stays stable while you tweak values.</p>
      </InputPanel>

      <OutputPanel
        title="Retry schedule"
        className="lg:col-span-3"
        description={schedule.length ? `Worst case: ${formatMs(total)} of waiting across ${schedule.length} ${schedule.length === 1 ? "retry" : "retries"}` : undefined}
        actions={
          <>
            {schedule.length ? <Badge>{JITTER_MODES.find((m) => m.id === opts.jitter)?.label} jitter</Badge> : null}
            <CopyButton value={json} label="Copy JSON" />
          </>
        }
      >
        {schedule.length === 0 ? (
          <p className="text-sm text-fg-subtle">Set max retries above 0 to see a schedule.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-surface-hover text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Attempt</th>
                  <th className="px-3 py-2 text-right font-medium">Base</th>
                  <th className="px-3 py-2 text-right font-medium">Delay</th>
                  <th className="px-3 py-2 text-right font-medium">Cumulative</th>
                  <th className="w-1/3 px-3 py-2 text-left font-medium">Wait</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {schedule.map((s) => (
                  <tr key={s.attempt} className="bg-bg-elevated">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono">#{s.attempt}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-fg-muted">{formatMs(s.baseDelay)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatMs(s.delay)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-fg-muted">{formatMs(s.cumulative)}</td>
                    <td className="min-w-24 px-3 py-1.5">
                      <div className="h-2 rounded-full bg-surface-hover">
                        <div className={cn("h-2 rounded-full", s.delay >= opts.maxDelay && opts.maxDelay > 0 ? "bg-warning" : "bg-accent")} style={{ width: `${Math.max(2, (s.delay / maxBar) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutputPanel>
    </div>
  );
}

function NumberField({ id, label, value, onChange, min, max, step }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} mono type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
    </div>
  );
}
