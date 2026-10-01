"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { ArrowLeftRight } from "lucide-react";
import { DATE_TIMELINE_SAMPLE, diffDates, parseTimelineValue } from "@/lib/tools/date-diff";
import { toDatetimeLocalValue } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { TimeCompare } from "@/components/time-compare";
import { splitEpochPaste } from "@/lib/tools/time-compare";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function DateDiffTool() {
  const hydrated = useHydrated();
  const [aInput, setA] = useState<string | null>(null);
  const [bInput, setB] = useState<string | null>(null);

  // Defaults ("now" and "now + 1 day") are computed on the client only.
  const defaults = useMemo(() => {
    if (!hydrated) return { a: "", b: "" };
    const start = new Date();
    return { a: toDatetimeLocalValue(start), b: toDatetimeLocalValue(new Date(start.getTime() + 86_400_000)) };
  }, [hydrated]);
  const a = aInput ?? defaults.a;
  const b = bInput ?? defaults.b;

  const result = useMemo(() => (a && b ? diffDates(a, b) : null), [a, b]);
  const cal = result?.ok ? result.calendar : null;
  const calText = cal ? [cal.years && `${cal.years} y`, cal.months && `${cal.months} mo`, cal.days && `${cal.days} d`].filter(Boolean).join(" ") || "0 d" : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Dates"
          description="Times are interpreted in your local timezone."
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setA(b);
                  setB(a);
                }}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setA(toDatetimeLocalValue(new Date()))}>
                A = now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setB(toDatetimeLocalValue(new Date()))}>
                B = now
              </Button>
            </>
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="date-a">Date/time A</Label>
            <Input id="date-a" type="datetime-local" step={1} value={a} onChange={(e) => setA(e.target.value)} mono />
          </div>
          <div>
            <Label htmlFor="date-b">Date/time B</Label>
            <Input id="date-b" type="datetime-local" step={1} value={b} onChange={(e) => setB(e.target.value)} mono />
          </div>
        </div>
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Difference (B − A)"
          actions={
            result?.ok ? (
              <Badge tone={result.direction === "future" ? "success" : result.direction === "past" ? "warning" : "neutral"}>
                {result.direction === "future" ? "B is after A" : result.direction === "past" ? "B is before A" : "Same instant"}
              </Badge>
            ) : null
          }
        />
        {result?.ok ? (
          <>
            <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-accent-strong/80">Duration</div>
              <div className="mt-0.5 text-lg font-medium">{result.human}</div>
              <div className="mt-0.5 text-xs text-fg-muted">Calendar: {calText}</div>
            </div>
            <OutputGrid>
              <OutputRow label="Days" value={fmt(result.totalDays)} />
              <OutputRow label="Hours" value={fmt(result.totalHours)} />
              <OutputRow label="Minutes" value={fmt(result.totalMinutes)} />
              <OutputRow label="Seconds" value={fmt(result.totalSeconds)} />
              <OutputRow label="Total milliseconds" value={result.ms.toLocaleString("en-US")} className="sm:col-span-2" />
              <OutputRow
                label="Breakdown"
                value={`${result.parts.days}d ${result.parts.hours}h ${result.parts.minutes}m ${result.parts.seconds}s ${result.parts.milliseconds}ms`}
                className="sm:col-span-2"
              />
            </OutputGrid>
          </>
        ) : (
          <p className="text-sm text-fg-subtle">Pick two dates to see the difference.</p>
        )}
      </Card>

      <TimeCompare
        id="date-timeline"
        title="Timeline"
        description="Enter several dates in separate fields to see the gap between each. Dates and date-times without a timezone are local; ISO strings and epoch seconds or milliseconds work too."
        placeholder="2024-01-15 10:30"
        sample={DATE_TIMELINE_SAMPLE}
        parse={parseTimelineValue}
        splitPaste={splitEpochPaste}
      />
    </div>
  );
}
