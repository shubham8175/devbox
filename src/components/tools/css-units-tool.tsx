"use client";

import { useMemo, useState } from "react";
import { COMMON_PX_SIZES, CSS_UNITS, convertAllUnits, formatUnit, fromPx, type CssUnit } from "@/lib/tools/css-units";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function CssUnitsTool() {
  const [root, setRoot] = useState("16");
  const [parent, setParent] = useState("16");
  const [value, setValue] = useState("24");
  const [unit, setUnit] = useState<CssUnit>("px");

  const rootN = Number(root);
  const parentN = Number(parent);
  const valueN = Number(value);
  const validCtx = Number.isFinite(rootN) && rootN > 0 && Number.isFinite(parentN) && parentN > 0;
  const validValue = value.trim() !== "" && Number.isFinite(valueN);
  const ctx = useMemo(() => ({ root: validCtx ? rootN : 16, parent: validCtx ? parentN : 16 }), [validCtx, rootN, parentN]);
  const all = useMemo(() => (validValue ? convertAllUnits(valueN, unit, ctx) : null), [validValue, valueN, unit, ctx]);

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Context" description="rem is relative to the root (html) font size; em and % are relative to the parent's font size." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cu-root" hint="html { font-size }">
              Root font size (px)
            </Label>
            <Input id="cu-root" mono type="number" min={1} step="0.5" value={root} onChange={(e) => setRoot(e.target.value)} invalid={!(Number.isFinite(rootN) && rootN > 0)} />
          </div>
          <div>
            <Label htmlFor="cu-parent" hint="for em and %">
              Parent font size (px)
            </Label>
            <Input id="cu-parent" mono type="number" min={1} step="0.5" value={parent} onChange={(e) => setParent(e.target.value)} invalid={!(Number.isFinite(parentN) && parentN > 0)} />
          </div>
        </div>
        {!validCtx ? (
          <Alert tone="danger" className="mt-3">
            Font sizes must be positive numbers.
          </Alert>
        ) : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Convert" />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="cu-value">Value</Label>
            <Input id="cu-value" mono type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} invalid={!validValue} className="h-11 text-base" />
          </div>
          <div className="sm:w-32">
            <Label htmlFor="cu-unit">Unit</Label>
            <Select id="cu-unit" value={unit} onChange={(e) => setUnit(e.target.value as CssUnit)} className="[&>select]:h-11">
              {CSS_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!validValue ? (
          <Alert tone="danger" className="mt-3">
            Enter a number to convert.
          </Alert>
        ) : null}
        <OutputGrid className="mt-4 sm:grid-cols-3 lg:grid-cols-5">
          {CSS_UNITS.map((u) => (
            <OutputRow key={u} label={u} value={all ? `${formatUnit(all[u])}${u}` : ""} className={u === unit ? "border-accent/30" : undefined} />
          ))}
        </OutputGrid>
        <p className="mt-3 text-xs text-fg-subtle">
          1pt = 1.333px (CSS reference pixel). With a {formatUnit(ctx.root)}px root, 1rem = {formatUnit(ctx.root)}px.
        </p>
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Quick reference" description={`Common pixel sizes at a ${formatUnit(ctx.root)}px root and ${formatUnit(ctx.parent)}px parent.`} />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">px</th>
                <th className="px-3 py-2 font-medium">rem</th>
                <th className="px-3 py-2 font-medium">em</th>
                <th className="px-3 py-2 font-medium">%</th>
                <th className="px-3 py-2 font-medium">pt</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {COMMON_PX_SIZES.map((px) => (
                <tr key={px} className="bg-bg-elevated">
                  <td className="px-3 py-1.5 font-mono text-xs">{px}px</td>
                  {(["rem", "em", "%", "pt"] as CssUnit[]).map((u) => {
                    const v = `${formatUnit(fromPx(px, u, ctx))}${u}`;
                    return (
                      <td key={u} className="px-3 py-1.5 font-mono text-xs">
                        <span className="inline-flex items-center gap-1">
                          {v}
                          <CopyButton value={v} iconOnly className="h-6 w-6" />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
