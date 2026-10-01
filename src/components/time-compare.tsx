"use client";

import { useMemo } from "react";
import { Eraser } from "lucide-react";
import { compareEntries, MAX_COMPARE_ENTRIES, signedDuration, toEntries, type ParsedValue } from "@/lib/tools/time-compare";
import { formatISO, formatLocal, humanDuration } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";

interface TimeCompareProps {
  id: string;
  title: string;
  description: string;
  placeholder: string;
  sample: string[];
  /** Parses one field's value. */
  parse: (raw: string) => ParsedValue;
  /** Splits text pasted into a field into several values, which then fill separate fields. */
  splitPaste: (raw: string) => string[];
  className?: string;
}

/**
 * One input per timestamp (or anything that carries one), with the gaps between them.
 * Shared by the Epoch and ObjectId tools; each supplies its own parser.
 */
export function TimeCompare({ id, title, description, placeholder, sample, parse, splitPaste, className }: TimeCompareProps) {
  const list = useValueList({ max: MAX_COMPARE_ENTRIES });
  const { values, hasInput, reset } = list;
  const { rows, summary } = useMemo(() => compareEntries(toEntries(values, parse)), [values, parse]);

  const report = rows
    .map((r) =>
      [
        `#${r.line} ${r.input}`,
        `   ${formatISO(r.date)}`,
        r.fromPrevious !== null ? `   from previous: ${signedDuration(r.fromPrevious)} (${r.fromPrevious} ms)` : null,
        r.fromFirst !== null && r !== rows[1] ? `   from first: ${signedDuration(r.fromFirst)} (${r.fromFirst} ms)` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .concat(summary ? [`Total span: ${humanDuration(summary.span)} (${summary.span} ms)`] : [])
    .join("\n");

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          !hasInput ? (
            <Button size="sm" variant="ghost" onClick={() => reset(sample)}>
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
        id={id}
        placeholder={placeholder}
        splitPaste={splitPaste}
        status={(value) => {
          const p = parse(value);
          return p.date
            ? { tone: "ok", content: <span className="font-mono" title={formatLocal(p.date)}>{formatISO(p.date)}</span> }
            : { tone: "error", content: p.error };
        }}
      />

      {summary && rows.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Span {humanDuration(summary.span)}</Badge>
            {summary.ascending ? <Badge tone="success">In chronological order</Badge> : <Badge tone="warning">Out of order</Badge>}
          </div>

          <OutputGrid>
            <OutputRow label="Total span" value={humanDuration(summary.span)} mono={false} hint={`${summary.span.toLocaleString()} ms`} />
            <OutputRow label="Total span (seconds)" value={String(summary.span / 1000)} />
            <OutputRow label={`Earliest · #${summary.earliest.line}`} value={summary.earliest.input} hint={formatLocal(summary.earliest.date)} />
            <OutputRow label={`Latest · #${summary.latest.line}`} value={summary.latest.input} hint={formatLocal(summary.latest.date)} />
          </OutputGrid>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">UTC</th>
                  <th className="px-3 py-2 font-medium">From previous</th>
                  <th className="px-3 py-2 font-medium">From first</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t align-top">
                    <td className="px-3 py-2 text-fg-subtle">{r.line}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]" title={formatLocal(r.date)}>
                      {formatISO(r.date)}
                    </td>
                    <DeltaCell ms={r.fromPrevious} />
                    <DeltaCell ms={r.fromFirst} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {rows.length === 1 ? "Add at least one more value to compare." : "Enter two or more values to see the difference between each one."}
        </p>
      )}
    </Card>
  );
}

function DeltaCell({ ms }: { ms: number | null }) {
  if (ms === null) return <td className="px-3 py-2 text-fg-subtle">—</td>;
  const tone = ms < 0 ? "text-warning" : "text-fg";
  return (
    <td className="px-3 py-2">
      <div className={tone}>{signedDuration(ms)}</div>
      <div className="font-mono text-[11px] text-fg-subtle">{ms.toLocaleString()} ms</div>
    </td>
  );
}
