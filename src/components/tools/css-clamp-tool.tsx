"use client";

import { useMemo, useState } from "react";
import { CLAMP_DEFAULTS, computeClamp, sizeAtViewport, TYPE_SCALE_RATIOS, typeScale, type ClampInput, type ClampUnit } from "@/lib/tools/css-clamp";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Fields = Record<"minSize" | "maxSize" | "minViewport" | "maxViewport" | "rootFontSize" | "precision", string>;

const toFields = (i: ClampInput): Fields => ({
  minSize: String(i.minSize),
  maxSize: String(i.maxSize),
  minViewport: String(i.minViewport),
  maxViewport: String(i.maxViewport),
  rootFontSize: String(i.rootFontSize),
  precision: String(i.precision),
});

export function CssClampTool() {
  const [fields, setFields] = useState<Fields>(() => toFields(CLAMP_DEFAULTS));
  const [unit, setUnit] = useState<ClampUnit>(CLAMP_DEFAULTS.unit);
  const [sim, setSim] = useState(768);
  const [ratio, setRatio] = useState(1.25);

  const input = useMemo<ClampInput>(
    () => ({
      minSize: Number(fields.minSize),
      maxSize: Number(fields.maxSize),
      minViewport: Number(fields.minViewport),
      maxViewport: Number(fields.maxViewport),
      rootFontSize: Number(fields.rootFontSize),
      precision: Number(fields.precision),
      unit,
    }),
    [fields, unit],
  );
  const result = useMemo(() => computeClamp(input), [input]);
  const scale = useMemo(() => (result.ok ? typeScale(input, ratio) : null), [result.ok, input, ratio]);
  const simPx = result.ok ? sizeAtViewport(input, sim) : null;

  const set = (k: keyof Fields) => (v: string) => setFields((f) => ({ ...f, [k]: v.slice(0, 12) }));
  const invalid = (k: keyof Fields) => fields[k].trim() === "" || !Number.isFinite(Number(fields[k]));

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Fluid value"
          description="Grows linearly from the minimum size at the minimum viewport to the maximum size at the maximum viewport, and stays put outside that range."
          actions={
            <Segmented
              size="sm"
              value={unit}
              onChange={setUnit}
              options={[
                { value: "px", label: "px" },
                { value: "rem", label: "rem" },
              ]}
            />
          }
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="cl-min" label={`Min size (${unit})`} value={fields.minSize} invalid={invalid("minSize")} onChange={set("minSize")} />
          <Field id="cl-max" label={`Max size (${unit})`} value={fields.maxSize} invalid={invalid("maxSize")} onChange={set("maxSize")} />
          <Field id="cl-root" label="Root font size (px)" hint="html { font-size }" value={fields.rootFontSize} invalid={invalid("rootFontSize")} onChange={set("rootFontSize")} />
          <Field id="cl-minvw" label="Min viewport (px)" value={fields.minViewport} invalid={invalid("minViewport")} onChange={set("minViewport")} />
          <Field id="cl-maxvw" label="Max viewport (px)" value={fields.maxViewport} invalid={invalid("maxViewport")} onChange={set("maxViewport")} />
          <Field id="cl-prec" label="Decimals" value={fields.precision} invalid={invalid("precision")} onChange={set("precision")} />
        </div>
        {!result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : result.warning ? (
          <Alert tone="warning" className="mt-3">
            {result.warning}
          </Alert>
        ) : null}
      </Card>

      {result.ok ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader title="Output" actions={<CopyButton value={`font-size: ${result.clampRem};`} label="Copy CSS" variant="primary" />} />
              <div className="space-y-2">
                <OutputRow label="clamp() in rem" value={result.clampRem} />
                <OutputRow label="clamp() in px" value={result.clampPx} />
                <OutputRow label="calc() fallback" value={result.calcFallback} hint="For browsers without clamp(): pair it with min-/max-font-size guards or a media query." />
                <OutputRow label="Tailwind" value={result.tailwind} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.samples.map((s) => (
                  <Badge key={s.viewport} tone={s.viewport === sim ? "accent" : "neutral"} className="font-mono">
                    {s.viewport}px → {s.px}px / {s.rem}rem
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="shadow-card">
              <CardHeader title="Preview" description="The paragraph is sized for the simulated viewport (vw units cannot follow a resized box, so the value is computed)." />
              <Label htmlFor="cl-sim" hint={`${sim}px → ${simPx !== null ? `${Math.round(simPx * 100) / 100}px` : "—"}`}>
                Simulated viewport
              </Label>
              <input id="cl-sim" type="range" min={320} max={1920} step={1} value={sim} onChange={(e) => setSim(Number(e.target.value))} className="w-full accent-accent" />
              <div className="mt-3 overflow-hidden rounded-lg border bg-bg-elevated p-3">
                <div className="rounded-md border border-dashed border-border-strong p-3 transition-[width]" style={{ width: `${Math.min(100, (sim / 1920) * 100)}%`, minWidth: "8rem" }}>
                  <p className="leading-snug text-fg" style={{ fontSize: simPx !== null ? `${simPx}px` : undefined }}>
                    Fluid text scales with the viewport.
                  </p>
                  <p className="mt-2 text-xs text-fg-subtle">{Math.min(sim, 1920)}px wide</p>
                </div>
              </div>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader
              title="Type scale"
              description="Each step multiplies the base min and max by the ratio and gets its own clamp()."
              actions={
                <>
                  <Select value={String(ratio)} onChange={(e) => setRatio(Number(e.target.value))} className="w-52 [&>select]:h-8 [&>select]:text-xs" aria-label="Scale ratio">
                    {TYPE_SCALE_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.value} · {r.name}
                      </option>
                    ))}
                  </Select>
                  <CopyButton value={scale?.ok ? scale.css : ""} label="Copy scale" />
                </>
              }
            />
            {scale?.ok ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{scale.css}</pre>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Step</th>
                        <th className="px-3 py-1.5 font-medium">Min</th>
                        <th className="px-3 py-1.5 font-medium">Max</th>
                        <th className="px-3 py-1.5 font-medium">Sample</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scale.steps.map((s) => (
                        <tr key={s.step} className="bg-bg-elevated">
                          <td className="px-3 py-1.5 font-mono">{s.name}</td>
                          <td className="px-3 py-1.5 font-mono">
                            {s.minSize}
                            {unit}
                          </td>
                          <td className="px-3 py-1.5 font-mono">
                            {s.maxSize}
                            {unit}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ fontSize: `${Math.min(48, sizeAtViewport({ ...input, minSize: s.minSize, maxSize: s.maxSize }, sim))}px` }}>
                            Aa
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : scale ? (
              <Alert tone="danger">{scale.error}</Alert>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, value, invalid, onChange }: { id: string; label: string; hint?: string; value: string; invalid: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <Input id={id} mono type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} />
    </div>
  );
}
