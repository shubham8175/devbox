"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { boxShadowCss, boxShadowValue, SHADOW_PRESETS, type ShadowLayer } from "@/lib/tools/box-shadow";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function BoxShadowTool() {
  const [layers, setLayers] = useState<ShadowLayer[]>(SHADOW_PRESETS[1].layers);
  const value = useMemo(() => boxShadowValue(layers), [layers]);
  const css = useMemo(() => boxShadowCss(layers), [layers]);

  const patch = (i: number, p: Partial<ShadowLayer>) => setLayers((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const add = () => setLayers((ls) => (ls.length >= 6 ? ls : [...ls, { x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.2, inset: false }]));
  const remove = (i: number) => setLayers((ls) => (ls.length <= 1 ? ls : ls.filter((_, j) => j !== i)));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader
            title="Layers"
            description="Up to six shadows, applied top to bottom."
            actions={
              <Button size="sm" onClick={add} disabled={layers.length >= 6}>
                <Plus className="h-3.5 w-3.5" /> Add layer
              </Button>
            }
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SHADOW_PRESETS.map((p) => (
              <button key={p.name} type="button" onClick={() => setLayers(p.layers)} className="rounded-md border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
                {p.name}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {layers.map((l, i) => (
              <div key={i} className="rounded-lg border bg-bg-elevated p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Layer {i + 1}</Badge>
                  <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                    <input type="checkbox" checked={l.inset} onChange={(e) => patch(i, { inset: e.target.checked })} className="accent-accent" /> inset
                  </label>
                  <div className="ml-auto flex items-center gap-2">
                    <label className="relative h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border">
                      <input type="color" value={l.color} onChange={(e) => patch(i, { color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Layer ${i + 1} color`} />
                      <span className="block h-full w-full" style={{ backgroundColor: l.color }} />
                    </label>
                    <Input mono value={l.color} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && patch(i, { color: e.target.value })} className="h-7 w-22 text-xs" aria-label={`Layer ${i + 1} hex`} />
                    <Button size="icon" variant="ghost" onClick={() => remove(i)} disabled={layers.length <= 1} aria-label="Remove layer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
                  <Slider label="X" value={l.x} min={-64} max={64} suffix="px" onChange={(v) => patch(i, { x: v })} />
                  <Slider label="Y" value={l.y} min={-64} max={64} suffix="px" onChange={(v) => patch(i, { y: v })} />
                  <Slider label="Blur" value={l.blur} min={0} max={128} suffix="px" onChange={(v) => patch(i, { blur: v })} />
                  <Slider label="Spread" value={l.spread} min={-64} max={64} suffix="px" onChange={(v) => patch(i, { spread: v })} />
                  <Slider label="Opacity" value={Math.round(l.opacity * 100)} min={0} max={100} suffix="%" onChange={(v) => patch(i, { opacity: v / 100 })} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="CSS" actions={<CopyButton value={css} label="Copy CSS" variant="primary" />} />
          <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{css}</pre>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Preview" description="On a light and a dark surface." />
        <div className="space-y-3">
          <div className="flex h-44 items-center justify-center rounded-lg border bg-[#f4f5f7]">
            <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-white text-xs text-[#5b6170]" style={{ boxShadow: value }}>
              light
            </div>
          </div>
          <div className="flex h-44 items-center justify-center rounded-lg border bg-[#0b0c0f]">
            <div className="flex h-24 w-40 items-center justify-center rounded-xl bg-[#1a1d25] text-xs text-[#9aa0ae]" style={{ boxShadow: value }}>
              dark
            </div>
          </div>
        </div>
        <OutputRow label="Value" value={value.replace(/\n\s*/g, " ")} className="mt-3" />
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div>
      <Label hint={`${value}${suffix}`}>{label}</Label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" aria-label={label} />
    </div>
  );
}
