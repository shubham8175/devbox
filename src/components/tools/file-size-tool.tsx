"use client";

import { useMemo, useState } from "react";
import { convertAll, formatSize, humanSize, SIZE_UNITS, toBytes, unitLabel, type SizeBase, type SizeUnit } from "@/lib/tools/file-size";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Alert } from "@/components/ui/alert";
import { OutputRow } from "@/components/output-row";

export function FileSizeTool() {
  const [value, setValue] = useState("1");
  const [unit, setUnit] = useState<SizeUnit>("GB");
  const [base, setBase] = useState<SizeBase>("binary");

  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0;
  const all = useMemo(() => (valid ? convertAll(n, unit, base) : null), [valid, n, unit, base]);
  const bytes = valid ? toBytes(n, unit, base) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Convert"
          description={base === "binary" ? "Binary: 1 KiB = 1,024 bytes (what most OSes and tools report)." : "Decimal: 1 KB = 1,000 bytes (what drive manufacturers use)."}
          actions={
            <Segmented
              size="sm"
              value={base}
              onChange={setBase}
              options={[
                { value: "binary", label: "Binary (1024)" },
                { value: "decimal", label: "Decimal (1000)" },
              ]}
            />
          }
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="size-value">Value</Label>
            <Input id="size-value" mono type="number" inputMode="decimal" min={0} value={value} onChange={(e) => setValue(e.target.value)} invalid={!valid} className="h-11 text-base" />
          </div>
          <div className="sm:w-40">
            <Label htmlFor="size-unit">Unit</Label>
            <Select id="size-unit" value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)} className="[&>select]:h-11">
              {SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u, base)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {!valid ? (
          <Alert tone="danger" className="mt-3">
            Enter a non-negative number.
          </Alert>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">
            ≈ <span className="font-mono text-fg">{humanSize(bytes, base)}</span>
            <span className="text-fg-subtle"> · in {base === "binary" ? "decimal" : "binary"} units: </span>
            <span className="font-mono text-fg">{humanSize(bytes, base === "binary" ? "decimal" : "binary")}</span>
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="All units" />
        <div className="grid gap-2 sm:grid-cols-2">
          {SIZE_UNITS.map((u) => (
            <OutputRow key={u} label={unitLabel(u, base)} value={all ? formatSize(all[u]) : ""} />
          ))}
        </div>
      </Card>
    </div>
  );
}
