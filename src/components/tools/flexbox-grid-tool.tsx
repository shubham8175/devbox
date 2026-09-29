"use client";

import { useMemo, useState } from "react";
import {
  ALIGN_CONTENT_OPTIONS,
  ALIGN_ITEMS_OPTIONS,
  ALIGN_SELF_OPTIONS,
  AUTO_FLOW_OPTIONS,
  FLEX_DEFAULTS,
  flexCss,
  GRID_DEFAULTS,
  gridCss,
  JUSTIFY_ITEMS_OPTIONS,
  JUSTIFY_OPTIONS,
  LAYOUT_LIMITS,
  LAYOUT_PRESETS,
  type FlexItemOverride,
  type FlexOptions,
  type GridItemOverride,
  type GridOptions,
} from "@/lib/tools/flexbox-grid";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Mode = "flex" | "grid";

export function FlexboxGridTool() {
  const [mode, setMode] = useState<Mode>("flex");
  const [flex, setFlex] = useState<FlexOptions>(LAYOUT_PRESETS[0].flex ?? FLEX_DEFAULTS);
  const [grid, setGrid] = useState<GridOptions>(GRID_DEFAULTS);
  const [selected, setSelected] = useState<number | null>(null);

  const out = useMemo(() => (mode === "flex" ? flexCss(flex) : gridCss(grid)), [mode, flex, grid]);
  const count = Math.min(LAYOUT_LIMITS.maxItems, Math.max(1, mode === "flex" ? flex.itemCount : grid.itemCount));

  const setF = <K extends keyof FlexOptions>(k: K, v: FlexOptions[K]) => setFlex((f) => ({ ...f, [k]: v }));
  const setG = <K extends keyof GridOptions>(k: K, v: GridOptions[K]) => setGrid((g) => ({ ...g, [k]: v }));
  const patchFlexItem = (index: number, patch: Partial<FlexItemOverride>) =>
    setFlex((f) => {
      const rest = f.items.filter((i) => i.index !== index);
      const cur = f.items.find((i) => i.index === index) ?? { index };
      return { ...f, items: [...rest, { ...cur, ...patch }] };
    });
  const patchGridItem = (index: number, patch: Partial<GridItemOverride>) =>
    setGrid((g) => {
      const rest = g.items.filter((i) => i.index !== index);
      const cur = g.items.find((i) => i.index === index) ?? { index };
      return { ...g, items: [...rest, { ...cur, ...patch }] };
    });

  const applyPreset = (name: string) => {
    const p = LAYOUT_PRESETS.find((x) => x.name === name);
    if (!p) return;
    setMode(p.mode);
    if (p.flex) setFlex(p.flex);
    if (p.grid) setGrid(p.grid);
    setSelected(null);
  };

  const selectedFlex = selected !== null ? flex.items.find((i) => i.index === selected) : undefined;
  const selectedGrid = selected !== null ? grid.items.find((i) => i.index === selected) : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="surface-gradient shadow-card lg:self-start">
        <CardHeader
          title="Layout"
          actions={
            <Segmented
              size="sm"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setSelected(null);
              }}
              options={[
                { value: "flex", label: "Flexbox" },
                { value: "grid", label: "Grid" },
              ]}
            />
          }
        />
        <div className="mb-4 flex flex-wrap gap-1.5">
          {LAYOUT_PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => applyPreset(p.name)} className="rounded-md border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
              {p.name}
            </button>
          ))}
        </div>

        {mode === "flex" ? (
          <div className="space-y-3">
            <SelectField id="fx-dir" label="flex-direction" value={flex.direction} options={["row", "row-reverse", "column", "column-reverse"]} onChange={(v) => setF("direction", v)} />
            <SelectField id="fx-wrap" label="flex-wrap" value={flex.wrap} options={["nowrap", "wrap", "wrap-reverse"]} onChange={(v) => setF("wrap", v)} />
            <SelectField id="fx-jc" label="justify-content" value={flex.justifyContent} options={JUSTIFY_OPTIONS} onChange={(v) => setF("justifyContent", v)} />
            <SelectField id="fx-ai" label="align-items" value={flex.alignItems} options={ALIGN_ITEMS_OPTIONS} onChange={(v) => setF("alignItems", v)} />
            <SelectField id="fx-ac" label="align-content" value={flex.alignContent} options={ALIGN_CONTENT_OPTIONS} onChange={(v) => setF("alignContent", v)} />
            <Slider label="gap" value={flex.gap} min={0} max={64} suffix="px" onChange={(v) => setF("gap", v)} />
            <Slider label="Items" value={flex.itemCount} min={1} max={LAYOUT_LIMITS.maxItems} suffix="" onChange={(v) => setF("itemCount", v)} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Columns</Label>
              <Segmented
                size="sm"
                value={grid.columnsMode}
                onChange={(v) => setG("columnsMode", v)}
                options={[
                  { value: "repeat", label: "Repeat" },
                  { value: "custom", label: "Custom" },
                ]}
              />
            </div>
            {grid.columnsMode === "repeat" ? (
              <Slider label="grid-template-columns" value={grid.columns} min={1} max={LAYOUT_LIMITS.maxColumns} suffix=" cols" onChange={(v) => setG("columns", v)} />
            ) : (
              <div>
                <Label htmlFor="gr-cols">grid-template-columns</Label>
                <Input id="gr-cols" mono value={grid.columnsTemplate} onChange={(e) => setG("columnsTemplate", e.target.value)} placeholder="240px 1fr" />
              </div>
            )}
            <Slider label="Rows (0 = auto)" value={grid.rows} min={0} max={6} suffix="" onChange={(v) => setG("rows", v)} />
            <div>
              <Label htmlFor="gr-rows" hint="optional">
                grid-template-rows
              </Label>
              <Input id="gr-rows" mono value={grid.rowsTemplate} onChange={(e) => setG("rowsTemplate", e.target.value)} placeholder="auto 1fr auto" />
            </div>
            <Slider label="row-gap" value={grid.rowGap} min={0} max={64} suffix="px" onChange={(v) => setG("rowGap", v)} />
            <Slider label="column-gap" value={grid.columnGap} min={0} max={64} suffix="px" onChange={(v) => setG("columnGap", v)} />
            <SelectField id="gr-ji" label="justify-items" value={grid.justifyItems} options={JUSTIFY_ITEMS_OPTIONS} onChange={(v) => setG("justifyItems", v)} />
            <SelectField id="gr-ai" label="align-items" value={grid.alignItems} options={ALIGN_ITEMS_OPTIONS} onChange={(v) => setG("alignItems", v)} />
            <SelectField id="gr-jc" label="justify-content" value={grid.justifyContent} options={JUSTIFY_OPTIONS} onChange={(v) => setG("justifyContent", v)} />
            <SelectField id="gr-ac" label="align-content" value={grid.alignContent} options={ALIGN_CONTENT_OPTIONS} onChange={(v) => setG("alignContent", v)} />
            <SelectField id="gr-flow" label="grid-auto-flow" value={grid.autoFlow} options={AUTO_FLOW_OPTIONS} onChange={(v) => setG("autoFlow", v)} />
            <Slider label="Items" value={grid.itemCount} min={1} max={LAYOUT_LIMITS.maxItems} suffix="" onChange={(v) => setG("itemCount", v)} />
          </div>
        )}

        <div className="mt-4 rounded-lg border bg-bg-elevated p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-fg">{selected !== null && selected <= count ? `Item ${selected}` : "Item overrides"}</span>
            {selected !== null ? (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Done
              </Button>
            ) : null}
          </div>
          {selected === null || selected > count ? (
            <p className="text-xs text-fg-muted">Click an item in the preview to edit its own properties.</p>
          ) : mode === "flex" ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField id="it-grow" label="flex-grow" value={selectedFlex?.grow} onChange={(v) => patchFlexItem(selected, { grow: v })} />
              <NumberField id="it-shrink" label="flex-shrink" value={selectedFlex?.shrink} onChange={(v) => patchFlexItem(selected, { shrink: v })} />
              <div>
                <Label htmlFor="it-basis">flex-basis</Label>
                <Input id="it-basis" mono value={selectedFlex?.basis ?? ""} onChange={(e) => patchFlexItem(selected, { basis: e.target.value })} placeholder="auto" className="h-8 text-xs" />
              </div>
              <NumberField id="it-order" label="order" value={selectedFlex?.order} onChange={(v) => patchFlexItem(selected, { order: v })} />
              <div className="col-span-2">
                <SelectField id="it-self" label="align-self" value={selectedFlex?.alignSelf ?? "auto"} options={ALIGN_SELF_OPTIONS} onChange={(v) => patchFlexItem(selected, { alignSelf: v })} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <NumberField id="it-cs" label="Column span" value={selectedGrid?.colSpan} min={1} max={LAYOUT_LIMITS.maxSpan} onChange={(v) => patchGridItem(selected, { colSpan: v })} />
              <NumberField id="it-rs" label="Row span" value={selectedGrid?.rowSpan} min={1} max={LAYOUT_LIMITS.maxSpan} onChange={(v) => patchGridItem(selected, { rowSpan: v })} />
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="shadow-card">
          <CardHeader title="Preview" description="Dashed border is the container. Click an item to select it." actions={selected !== null ? <Badge tone="accent">Item {selected} selected</Badge> : null} />
          <div className="min-h-[340px] overflow-auto rounded-lg border-2 border-dashed border-border-strong bg-bg-elevated p-3" style={out.containerStyle}>
            {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelected((s) => (s === n ? null : n))}
                aria-pressed={selected === n}
                aria-label={`Item ${n}`}
                className={cn(
                  "flex min-h-12 min-w-12 items-center justify-center rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-strong transition-shadow cursor-pointer",
                  selected === n && "ring-2 ring-accent",
                )}
                style={out.itemStyles[n]}
              >
                {n}
              </button>
            ))}
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="CSS" description="Container plus nth-child rules for any item overrides." actions={<CopyButton value={out.css} label="Copy CSS" variant="primary" />} />
          <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{out.css}</pre>
          <div className="mt-3 space-y-2">
            <OutputRow label="Tailwind (container)" value={out.tailwind} />
            {selected !== null && out.itemTailwind[selected] ? <OutputRow label={`Tailwind (item ${selected})`} value={out.itemTailwind[selected]} /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SelectField<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="[&>select]:h-8 [&>select]:text-xs">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}

function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number | undefined; min?: number; max?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        mono
        type="number"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(n !== undefined && Number.isFinite(n) ? n : undefined);
        }}
        placeholder="—"
        className="h-8 text-xs"
      />
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
