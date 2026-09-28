"use client";

import { useMemo, useState } from "react";
import { BASES, bitLength, fitsIn, formatInBase, groupDigits, parseInBase, toSigned, type Base, type BitWidth } from "@/lib/tools/base-converter";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Inputs = Record<Base, string>;

const initial = (v: bigint): Inputs => ({ 2: formatInBase(v, 2), 8: formatInBase(v, 8), 10: formatInBase(v, 10), 16: formatInBase(v, 16) });

export function BaseConverterTool() {
  const [inputs, setInputs] = useState<Inputs>(() => initial(BigInt(255)));
  const [source, setSource] = useState<Base>(10);
  const [width, setWidth] = useState<BitWidth>(32);

  const parsed = useMemo(() => parseInBase(inputs[source], source), [inputs, source]);
  const value = parsed.ok ? parsed.value : null;

  const onChange = (base: Base, text: string) => {
    setSource(base);
    const r = parseInBase(text, base);
    if (r.ok) {
      const next = initial(r.value);
      next[base] = text;
      setInputs(next);
    } else {
      setInputs((cur) => ({ ...cur, [base]: text }));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Bases" description="Edit any field; the others follow. Prefixes (0b, 0o, 0x), spaces and underscores are accepted. BigInt-backed, so any size works." />
        <div className="grid gap-3 sm:grid-cols-2">
          {BASES.map((b) => {
            const invalid = !parseInBase(inputs[b.base], b.base).ok && inputs[b.base].trim() !== "";
            return (
              <div key={b.base}>
                <Label htmlFor={`base-${b.base}`} hint={`base ${b.base}`}>
                  {b.label}
                </Label>
                <Input id={`base-${b.base}`} mono value={inputs[b.base]} onChange={(e) => onChange(b.base, e.target.value)} invalid={invalid} placeholder={b.prefix ? `${b.prefix}…` : "…"} />
              </div>
            );
          })}
        </div>
        {!parsed.ok && inputs[source].trim() !== "" ? (
          <Alert tone="danger" className="mt-3">
            {parsed.error}
          </Alert>
        ) : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader
          title="Details"
          actions={
            value !== null ? (
              <>
                <Badge>{bitLength(value)} bits</Badge>
                <CopyButton value={formatInBase(value, 10)} label="Copy decimal" />
              </>
            ) : null
          }
        />
        <OutputGrid>
          <OutputRow label="Binary (nibbles)" value={value !== null ? groupDigits(formatInBase(value, 2), 4) : ""} />
          <OutputRow label="Hex (bytes)" value={value !== null ? groupDigits(formatInBase(value, 16), 2) : ""} />
          <OutputRow label="Decimal (thousands)" value={value !== null ? groupDigits(formatInBase(value, 10), 3, ",") : ""} />
          <OutputRow label="Octal" value={value !== null ? formatInBase(value, 8) : ""} />
          <OutputRow label="0x prefixed" value={value !== null && value >= BigInt(0) ? `0x${formatInBase(value, 16)}` : ""} />
          <OutputRow label="0b prefixed" value={value !== null && value >= BigInt(0) ? `0b${formatInBase(value, 2)}` : ""} />
        </OutputGrid>
      </Card>

      <Card className="shadow-card">
        <CardHeader
          title="Two's complement"
          description="Interpret the low bits as a signed integer."
          actions={
            <Segmented
              size="sm"
              value={String(width) as "8" | "16" | "32" | "64"}
              onChange={(w) => setWidth(Number(w) as BitWidth)}
              options={[
                { value: "8", label: "8-bit" },
                { value: "16", label: "16-bit" },
                { value: "32", label: "32-bit" },
                { value: "64", label: "64-bit" },
              ]}
            />
          }
        />
        {value !== null ? (
          <OutputGrid>
            <OutputRow label={`Signed ${width}-bit`} value={toSigned(value, width).toString()} hint={fitsIn(value, width) ? undefined : "Value exceeds the width; only the low bits are interpreted."} />
            <OutputRow label={`Unsigned ${width}-bit`} value={((value % (BigInt(1) << BigInt(width))) + (BigInt(1) << BigInt(width))) % (BigInt(1) << BigInt(width)) + ""} />
            <OutputRow label={`Binary (${width}-bit)`} value={groupDigits((((value % (BigInt(1) << BigInt(width))) + (BigInt(1) << BigInt(width))) % (BigInt(1) << BigInt(width))).toString(2).padStart(width, "0"), 4)} className="sm:col-span-2" />
          </OutputGrid>
        ) : (
          <p className="text-xs text-fg-subtle">Enter a valid number above.</p>
        )}
      </Card>
    </div>
  );
}
