"use client";

import { useMemo, useState } from "react";
import { analyzeRatio, COMMON_RATIOS, PRESET_SIZES, scaleToHeight, scaleToWidth } from "@/lib/tools/aspect-ratio";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

export function AspectRatioTool() {
  const [w, setW] = useState("1920");
  const [h, setH] = useState("1080");
  const [targetW, setTargetW] = useState("1280");
  const [targetH, setTargetH] = useState("");

  const wn = Number(w);
  const hn = Number(h);
  const result = useMemo(() => analyzeRatio(wn, hn), [wn, hn]);

  const tw = Number(targetW);
  const th = Number(targetH);
  const scaledH = result && targetW && Number.isFinite(tw) && tw > 0 ? scaleToWidth(wn, hn, tw) : null;
  const scaledW = result && targetH && Number.isFinite(th) && th > 0 ? scaleToHeight(wn, hn, th) : null;

  const previewStyle = result ? { aspectRatio: `${wn} / ${hn}` } : undefined;

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Dimensions" description="Enter a width and height in any unit." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ar-w">Width</Label>
            <Input id="ar-w" mono type="number" min={1} value={w} onChange={(e) => setW(e.target.value)} invalid={!result} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="ar-h">Height</Label>
            <Input id="ar-h" mono type="number" min={1} value={h} onChange={(e) => setH(e.target.value)} invalid={!result} className="h-11 text-base" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESET_SIZES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setW(String(p.w));
                setH(String(p.h));
              }}
              className="rounded-md border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
            >
              {p.label} <span className="font-mono text-fg-subtle">{p.w}×{p.h}</span>
            </button>
          ))}
        </div>
        {!result ? (
          <Alert tone="danger" className="mt-3">
            Width and height must be positive numbers.
          </Alert>
        ) : null}
      </Card>

      {result ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="shadow-card lg:col-span-3">
            <CardHeader
              title="Ratio"
              actions={
                <>
                  <Badge>{result.orientation}</Badge>
                  {result.match ? <Badge tone={result.matchExact ? "success" : "accent"}>{result.matchExact ? "Exactly" : "≈"} {result.match.label}</Badge> : <Badge tone="warning">No common match</Badge>}
                </>
              }
            />
            <OutputGrid>
              <OutputRow label="Simplified" value={result.simplified} />
              <OutputRow label="Decimal" value={result.decimal.toFixed(4)} />
              <OutputRow label="Closest common" value={result.match ? `${result.match.label} · ${result.match.note}` : "—"} mono={false} copyable={false} />
              <OutputRow label="CSS" value={`aspect-ratio: ${wn} / ${hn};`} />
            </OutputGrid>
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Common ratios</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {COMMON_RATIOS.map((r) => {
                  const on = result.match?.label === r.label;
                  return (
                    <div
                      key={r.label}
                      className={cn(
                        "flex items-baseline gap-1.5 overflow-hidden rounded-md border px-2 py-1.5 text-xs",
                        on ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted",
                      )}
                      title={r.note}
                    >
                      <span className="shrink-0 font-mono font-semibold">{r.label}</span>
                      <span className="min-w-0 flex-1 truncate text-fg-subtle">{r.note.split(" — ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card className="shadow-card lg:col-span-2">
            <CardHeader title="Preview" />
            <div className="flex h-48 items-center justify-center rounded-lg border bg-bg-elevated p-3">
              <div className="flex max-h-full max-w-full items-center justify-center rounded-md border border-accent/40 bg-accent-soft font-mono text-xs text-accent-strong" style={{ ...previewStyle, width: result.orientation === "portrait" ? "auto" : "100%", height: result.orientation === "portrait" ? "100%" : "auto" }}>
                {result.simplified}
              </div>
            </div>
          </Card>

          <Card className="shadow-card lg:col-span-5">
            <CardHeader title="Resize while preserving ratio" description="Enter one side; the other is computed." />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="ar-tw">Target width</Label>
                  <Input id="ar-tw" mono type="number" min={1} value={targetW} onChange={(e) => setTargetW(e.target.value)} placeholder="1280" />
                </div>
                <OutputRow label="Height" value={scaledH !== null ? String(scaledH) : ""} className="flex-1" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor="ar-th">Target height</Label>
                  <Input id="ar-th" mono type="number" min={1} value={targetH} onChange={(e) => setTargetH(e.target.value)} placeholder="720" />
                </div>
                <OutputRow label="Width" value={scaledW !== null ? String(scaledW) : ""} className="flex-1" />
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {[0.25, 0.5, 2, 3].map((f) => (
                <OutputRow key={f} label={`${f}×`} value={`${Math.round(wn * f)} × ${Math.round(hn * f)}`} />
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
