"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { diffLines, summarize, toRows, type DiffRow, type Segment } from "@/lib/tools/text-diff";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Mode = "side" | "inline";

const SAMPLE_A = `server:
  port: 8080
  host: localhost
features:
  - auth
  - billing
timeout: 30s`;
const SAMPLE_B = `server:
  port: 9090
  host: 0.0.0.0
  tls: true
features:
  - auth
  - billing
  - reports
timeout: 30s`;

export function TextDiffTool() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mode, setMode] = useState<Mode>("side");
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);

  // Diffing is O(n·m); wait for typing to settle before recomputing.
  const debouncedA = useDebounced(a, 250);
  const debouncedB = useDebounced(b, 250);
  const rows = useMemo(() => {
    if (!debouncedA && !debouncedB) return null;
    const norm = (s: string) => (ignoreWs ? s.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).join("\n") : s);
    return toRows(diffLines(norm(debouncedA), norm(debouncedB)));
  }, [debouncedA, debouncedB, ignoreWs]);
  const stats = rows ? summarize(rows) : null;
  const visible = rows?.filter((r) => !onlyChanges || r.kind !== "equal") ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="surface-gradient shadow-card">
          <Label htmlFor="td-a" hint={`${a.split("\n").length} lines`}>
            Text A
          </Label>
          <Textarea id="td-a" value={a} onChange={(e) => setA(e.target.value)} placeholder="Original" className="min-h-[200px]" />
        </Card>
        <Card className="surface-gradient shadow-card">
          <Label htmlFor="td-b" hint={`${b.split("\n").length} lines`}>
            Text B
          </Label>
          <Textarea id="td-b" value={b} onChange={(e) => setB(e.target.value)} placeholder="Modified" className="min-h-[200px]" />
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader
          title="Differences"
          actions={
            <>
              {!a && !b ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setA(SAMPLE_A);
                    setB(SAMPLE_B);
                  }}
                >
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setA("");
                    setB("");
                  }}
                >
                  Clear
                </Button>
              )}
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "side", label: "Side by side" },
                  { value: "inline", label: "Inline" },
                ]}
              />
            </>
          }
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {stats ? (
            <>
              <Badge tone="success">+{stats.added + stats.changed} added</Badge>
              <Badge tone="danger">−{stats.removed + stats.changed} removed</Badge>
              <Badge tone="warning">{stats.changed} changed</Badge>
              <Badge>{stats.unchanged} unchanged</Badge>
              {stats.added + stats.removed + stats.changed === 0 ? <Badge tone="success">Identical</Badge> : null}
            </>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-3 text-xs text-fg-muted">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={ignoreWs} onChange={(e) => setIgnoreWs(e.target.checked)} className="accent-accent" /> Ignore whitespace
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} className="accent-accent" /> Only changes
            </label>
          </div>
        </div>

        {!rows ? (
          <EmptyState title="Waiting for text" description="Paste two versions above to compare them line by line." />
        ) : visible.length === 0 ? (
          <EmptyState title="No differences" description="Both texts are identical." className="py-8" />
        ) : mode === "side" ? (
          <SideBySide rows={visible} />
        ) : (
          <Inline rows={visible} />
        )}
      </Card>
    </div>
  );
}

function Segments({ segments, text, strong }: { segments?: Segment[]; text: string; strong: "insert" | "delete" }) {
  if (!segments) return <>{text || " "}</>;
  return (
    <>
      {segments.map((s, i) => (
        <span key={i} className={s.op === strong ? (strong === "insert" ? "diff-add-strong" : "diff-del-strong") : undefined}>
          {s.text}
        </span>
      ))}
    </>
  );
}

const ROW_BG: Record<DiffRow["kind"], { l: string; r: string }> = {
  equal: { l: "", r: "" },
  insert: { l: "bg-surface-hover/40", r: "diff-add" },
  delete: { l: "diff-del", r: "bg-surface-hover/40" },
  change: { l: "diff-del", r: "diff-add" },
};

function SideBySide({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-bg-elevated">
      <table className="w-full table-fixed border-collapse font-mono text-xs leading-5">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="w-10 select-none border-r px-2 text-right text-fg-subtle">{r.left?.n ?? ""}</td>
              <td className={cn("w-1/2 whitespace-pre-wrap break-all px-2 align-top", ROW_BG[r.kind].l)}>
                {r.left ? <Segments segments={r.left.segments} text={r.left.text} strong="delete" /> : null}
              </td>
              <td className="w-10 select-none border-x px-2 text-right text-fg-subtle">{r.right?.n ?? ""}</td>
              <td className={cn("w-1/2 whitespace-pre-wrap break-all px-2 align-top", ROW_BG[r.kind].r)}>
                {r.right ? <Segments segments={r.right.segments} text={r.right.text} strong="insert" /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inline({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-bg-elevated font-mono text-xs leading-5">
      {rows.map((r, i) => {
        if (r.kind === "equal") {
          return (
            <Line key={i} a={r.left!.n} b={r.right!.n} sign=" ">
              {r.left!.text || " "}
            </Line>
          );
        }
        return (
          <div key={i}>
            {r.left ? (
              <Line a={r.left.n} sign="−" className="diff-del">
                <Segments segments={r.left.segments} text={r.left.text} strong="delete" />
              </Line>
            ) : null}
            {r.right ? (
              <Line b={r.right.n} sign="+" className="diff-add">
                <Segments segments={r.right.segments} text={r.right.text} strong="insert" />
              </Line>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Line({ a, b, sign, className, children }: { a?: number; b?: number; sign: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex border-b last:border-b-0", className)}>
      <span className="w-10 shrink-0 select-none border-r px-2 text-right text-fg-subtle">{a ?? ""}</span>
      <span className="w-10 shrink-0 select-none border-r px-2 text-right text-fg-subtle">{b ?? ""}</span>
      <span className={cn("w-5 shrink-0 select-none text-center", sign === "+" ? "text-success" : sign === "−" ? "text-danger" : "text-fg-subtle")}>{sign}</span>
      <span className="flex-1 whitespace-pre-wrap break-all pr-2">{children}</span>
    </div>
  );
}
