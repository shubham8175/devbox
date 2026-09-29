"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { convert, convertAll, formatResult, getCategory, parseQuantity, UNIT_CATEGORIES, UNIT_CONVERTER_SAMPLE, type UnitCategoryId } from "@/lib/tools/unit-converter";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const DEFAULT_TO: Partial<Record<UnitCategoryId, [string, string]>> = {
  length: ["km", "mi"],
  mass: ["kg", "lb"],
  temperature: ["C", "F"],
  data: ["GB", "GiB"],
  "data-rate": ["Mbps", "MB/s"],
  time: ["h", "min"],
  area: ["m²", "ft²"],
  volume: ["l", "gal"],
  speed: ["km/h", "mph"],
  pressure: ["bar", "psi"],
  energy: ["kWh", "kJ"],
  angle: ["deg", "rad"],
  frequency: ["GHz", "MHz"],
};

export function UnitConverterTool() {
  const [category, setCategory] = useState<UnitCategoryId>("length");
  const [from, setFrom] = useState("km");
  const [to, setTo] = useState("mi");
  const [value, setValue] = useState("1");
  const [quick, setQuick] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);

  const cat = getCategory(category);
  const n = Number(value.trim().replace(/,/g, ""));
  const valid = value.trim() !== "" && Number.isFinite(n);
  const result = useMemo(() => (valid ? convert(category, n, from, to) : Number.NaN), [valid, category, n, from, to]);
  const all = useMemo(() => (valid ? convertAll(category, n, from) : []), [valid, category, n, from]);
  const fromUnit = cat.units.find((u) => u.id === from);
  const toUnit = cat.units.find((u) => u.id === to);

  const changeCategory = (id: UnitCategoryId) => {
    const [f, t] = DEFAULT_TO[id] ?? [getCategory(id).units[0].id, getCategory(id).units[1].id];
    setCategory(id);
    setFrom(f);
    setTo(t);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    if (valid && Number.isFinite(result)) setValue(formatResult(result).replace(/,/g, ""));
  };

  const applyQuick = (text: string) => {
    setQuick(text);
    if (!text.trim()) {
      setQuickError(null);
      return;
    }
    const parsed = parseQuantity(text, category);
    if (!parsed) {
      setQuickError("Type a number followed by a unit, e.g. 12.5 km, 3 ft, -40 °F or 2 GiB.");
      return;
    }
    setQuickError(null);
    if (parsed.category !== category) {
      const [, t] = DEFAULT_TO[parsed.category] ?? ["", getCategory(parsed.category).units[0].id];
      setCategory(parsed.category);
      setTo(t === parsed.unitId ? getCategory(parsed.category).units.find((u) => u.id !== parsed.unitId)?.id ?? t : t);
    } else if (to === parsed.unitId) {
      setTo(from);
    }
    setFrom(parsed.unitId);
    setValue(String(parsed.value));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Quick entry"
          description="Type a quantity with its unit and the converter switches to it."
          actions={
            !quick ? (
              <Button size="sm" variant="ghost" onClick={() => applyQuick(UNIT_CONVERTER_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => applyQuick("")}>
                Clear
              </Button>
            )
          }
        />
        <Input mono value={quick} onChange={(e) => applyQuick(e.target.value)} placeholder="12.5 km · 3 ft · -40 °F · 2 GiB · 100 Mbps" className="h-11 text-base" invalid={!!quickError} aria-label="Quick entry" />
        {quickError ? (
          <Alert tone="danger" className="mt-3">
            {quickError}
          </Alert>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Convert" description={cat.note} />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_1fr]">
          <div>
            <Label htmlFor="uc-category">Category</Label>
            <Select id="uc-category" value={category} onChange={(e) => changeCategory(e.target.value as UnitCategoryId)}>
              {UNIT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="uc-from">From</Label>
            <Select id="uc-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.id})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button size="icon" variant="secondary" onClick={swap} aria-label="Swap units" title="Swap units" className="h-9 w-9">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <Label htmlFor="uc-to">To</Label>
            <Select id="uc-to" value={to} onChange={(e) => setTo(e.target.value)}>
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} ({u.id})
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="uc-value">Value</Label>
            <Input id="uc-value" mono inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} invalid={!valid} className="h-11 text-base" aria-label="Value to convert" />
            {!valid ? (
              <Alert tone="danger" className="mt-2">
                Enter a number.
              </Alert>
            ) : null}
          </div>
          <div>
            <Label>Result</Label>
            <div className="flex h-11 items-center justify-between gap-2 rounded-lg border bg-bg-elevated px-3">
              <span className="min-w-0 truncate font-mono text-lg text-fg">
                {formatResult(result)} <span className="text-sm text-fg-muted">{toUnit?.id}</span>
              </span>
              <CopyButton value={Number.isFinite(result) ? formatResult(result).replace(/,/g, "") : ""} iconOnly />
            </div>
            {valid && fromUnit && toUnit ? (
              <p className="mt-1.5 text-xs text-fg-subtle">
                {formatResult(n)} {fromUnit.label.toLowerCase()} = {formatResult(result)} {toUnit.label.toLowerCase()}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="All units" description={`${valid ? formatResult(n) : "—"} ${from} in every ${cat.label.toLowerCase()} unit.`} />
        <OutputGrid>
          {cat.units.map((u) => {
            const row = all.find((r) => r.unit.id === u.id);
            return <OutputRow key={u.id} label={`${u.label} · ${u.id}`} value={row ? formatResult(row.value) : ""} className={u.id === to ? "border-accent/40" : undefined} />;
          })}
        </OutputGrid>
        {category === "data" || category === "data-rate" || category === "time" ? (
          <Alert tone="info" className="mt-3">
            {category === "time" ? "Months are 30 days and years 365 days here; calendar months and leap years vary." : "Decimal units (KB, MB, GB) use powers of 1,000; binary units (KiB, MiB, GiB) use powers of 1,024. A “500 GB” drive is about 465 GiB."}
          </Alert>
        ) : null}
      </Card>
    </div>
  );
}
