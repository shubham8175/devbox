"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { GRADIENT_PRESETS, gradientCss, gradientTailwind, gradientValue, RADIAL_POSITIONS, type ColorStop, type GradientConfig } from "@/lib/tools/gradient";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function GradientTool() {
  const [cfg, setCfg] = useState<GradientConfig>(GRADIENT_PRESETS[0].config);
  const value = useMemo(() => gradientValue(cfg), [cfg]);
  const css = useMemo(() => gradientCss(cfg), [cfg]);
  const tw = useMemo(() => gradientTailwind(cfg), [cfg]);

  const set = <K extends keyof GradientConfig>(key: K, v: GradientConfig[K]) => setCfg((c) => ({ ...c, [key]: v }));
  const setStop = (i: number, patch: Partial<ColorStop>) => setCfg((c) => ({ ...c, stops: c.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, dir: -1 | 1) =>
    setCfg((c) => {
      const stops = [...c.stops];
      const j = i + dir;
      if (j < 0 || j >= stops.length) return c;
      [stops[i], stops[j]] = [stops[j], stops[i]];
      return { ...c, stops };
    });
  const remove = (i: number) => setCfg((c) => (c.stops.length <= 2 ? c : { ...c, stops: c.stops.filter((_, j) => j !== i) }));
  const add = () =>
    setCfg((c) => {
      const last = c.stops[c.stops.length - 1];
      return { ...c, stops: [...c.stops, { color: last.color, position: Math.min(100, last.position + 10) }] };
    });

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader
            title="Gradient"
            actions={
              <Segmented
                size="sm"
                value={cfg.type}
                onChange={(t) => set("type", t)}
                options={[
                  { value: "linear", label: "Linear" },
                  { value: "radial", label: "Radial" },
                  { value: "conic", label: "Conic" },
                ]}
              />
            }
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {GRADIENT_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setCfg(p.config)}
                className="flex items-center gap-2 rounded-md border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
              >
                <span className="h-4 w-6 rounded-sm border" style={{ background: gradientValue(p.config) }} />
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {cfg.type !== "radial" ? (
              <div>
                <Label htmlFor="g-angle" hint={`${cfg.angle}°`}>
                  {cfg.type === "linear" ? "Angle" : "Start angle"}
                </Label>
                <input id="g-angle" type="range" min={0} max={360} value={cfg.angle} onChange={(e) => set("angle", Number(e.target.value))} className="w-full accent-accent" />
              </div>
            ) : (
              <div>
                <Label htmlFor="g-shape">Shape</Label>
                <Select id="g-shape" value={cfg.shape} onChange={(e) => set("shape", e.target.value as GradientConfig["shape"])}>
                  <option value="circle">circle</option>
                  <option value="ellipse">ellipse</option>
                </Select>
              </div>
            )}
            {cfg.type !== "linear" ? (
              <div>
                <Label htmlFor="g-pos">Position</Label>
                <Select id="g-pos" value={cfg.position} onChange={(e) => set("position", e.target.value)}>
                  {RADIAL_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader
            title="Color stops"
            description="At least two stops. Order is by position in the output."
            actions={
              <Button size="sm" onClick={add}>
                <Plus className="h-3.5 w-3.5" /> Add stop
              </Button>
            }
          />
          <div className="space-y-2">
            {cfg.stops.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-bg-elevated p-2">
                <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
                  <input type="color" value={s.color} onChange={(e) => setStop(i, { color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Stop ${i + 1} color`} />
                  <span className="block h-full w-full" style={{ backgroundColor: s.color }} />
                </label>
                <Input mono value={s.color} onChange={(e) => /^#[0-9a-f]{0,8}$/i.test(e.target.value) && setStop(i, { color: e.target.value })} className="w-28" aria-label={`Stop ${i + 1} hex`} />
                <input type="range" min={0} max={100} value={s.position} onChange={(e) => setStop(i, { position: Number(e.target.value) })} className="min-w-[120px] flex-1 accent-accent" aria-label={`Stop ${i + 1} position`} />
                <Input mono type="number" min={0} max={100} value={s.position} onChange={(e) => setStop(i, { position: Math.min(100, Math.max(0, Number(e.target.value))) })} className="w-20" aria-label={`Stop ${i + 1} percent`} />
                <span className="text-xs text-fg-subtle">%</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === cfg.stops.length - 1} aria-label="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(i)} disabled={cfg.stops.length <= 2} aria-label="Remove stop">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="CSS" actions={<CopyButton value={css} label="Copy CSS" variant="primary" />} />
          <div className="space-y-2">
            <OutputRow label="CSS" value={css} />
            <OutputRow label="Value only" value={value} />
            <OutputRow label="Tailwind arbitrary class" value={tw} />
          </div>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Preview" />
        <div className="h-72 rounded-lg border" style={{ background: value }} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-16 rounded-full border" style={{ background: value }} />
          <div className="flex h-16 items-center justify-center rounded-lg border text-lg font-bold" style={{ backgroundImage: value, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Text
          </div>
          <div className="h-16 rounded-lg border p-[3px]" style={{ background: value }}>
            <div className="h-full w-full rounded-[5px] bg-surface" />
          </div>
        </div>
      </Card>
    </div>
  );
}
