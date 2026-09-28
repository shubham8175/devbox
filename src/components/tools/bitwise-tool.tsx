"use client";

import { useMemo, useState } from "react";
import { BIT_WIDTHS, computeAll, groupBits, parseNumber, toBinary, toHex, type BitWidth } from "@/lib/tools/bitwise";
import { toUnsigned } from "@/lib/tools/base-converter";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function BitwiseTool() {
  const [a, setA] = useState("0b1100");
  const [b, setB] = useState("10");
  const [shift, setShift] = useState("2");
  const [width, setWidth] = useState<BitWidth>(8);

  const pa = useMemo(() => parseNumber(a), [a]);
  const pb = useMemo(() => parseNumber(b), [b]);
  const n = Math.max(0, Math.min(width, Number(shift) || 0));
  const results = useMemo(() => (pa.ok && pb.ok ? computeAll(pa.value, pb.value, n, width) : null), [pa, pb, n, width]);
  const A = pa.ok ? toUnsigned(pa.value, width) : null;
  const B = pb.ok ? toUnsigned(pb.value, width) : null;

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Operands"
          description="Decimal, 0x hex, 0b binary or 0o octal. Values wrap to the selected width."
          actions={
            <Select value={String(width)} onChange={(e) => setWidth(Number(e.target.value) as BitWidth)} className="w-28" aria-label="Bit width">
              {BIT_WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}-bit
                </option>
              ))}
            </Select>
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="bw-a" hint={A !== null ? toHex(A, width) : undefined}>
              A
            </Label>
            <Input id="bw-a" mono value={a} onChange={(e) => setA(e.target.value)} invalid={!pa.ok} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="bw-b" hint={B !== null ? toHex(B, width) : undefined}>
              B
            </Label>
            <Input id="bw-b" mono value={b} onChange={(e) => setB(e.target.value)} invalid={!pb.ok} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="bw-n" hint={`0–${width}`}>
              Shift amount
            </Label>
            <Input id="bw-n" mono type="number" min={0} max={width} value={shift} onChange={(e) => setShift(e.target.value)} className="h-11 text-base" />
          </div>
        </div>
        {!pa.ok ? <Alert tone="danger" className="mt-3">A: {pa.error}</Alert> : !pb.ok ? <Alert tone="danger" className="mt-3">B: {pb.error}</Alert> : null}
      </Card>

      {A !== null && B !== null && results ? (
        <>
          <Card className="shadow-card">
            <CardHeader title="Bits" description="Most significant bit on the left." />
            <div className="space-y-1.5 overflow-x-auto">
              <BitRow label="A" bits={toBinary(A, width)} />
              <BitRow label="B" bits={toBinary(B, width)} />
              <BitRow label="A & B" bits={toBinary(results[0].value, width)} highlight />
              <BitRow label="A | B" bits={toBinary(results[1].value, width)} highlight />
              <BitRow label="A ^ B" bits={toBinary(results[2].value, width)} highlight />
            </div>
          </Card>

          <Card className="shadow-card">
            <CardHeader title="Results" actions={<Badge>{width}-bit unsigned</Badge>} />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Operation</th>
                    <th className="px-3 py-2 font-medium">Binary</th>
                    <th className="px-3 py-2 font-medium">Decimal</th>
                    <th className="px-3 py-2 font-medium">Hex</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((r) => (
                    <tr key={r.label} className="bg-bg-elevated">
                      <td className="px-3 py-2">
                        <div className="text-xs font-medium">{r.label}</div>
                        <div className="font-mono text-[11px] text-fg-subtle">{r.expression}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{groupBits(toBinary(r.value, width))}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.value.toString()}</td>
                      <td className="px-3 py-2 font-mono text-xs">{toHex(r.value, width)}</td>
                      <td className="px-2 py-1 text-right">
                        <CopyButton value={r.value.toString()} iconOnly />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-fg-subtle">Shifts are logical on the unsigned {width}-bit value, so &gt;&gt; and &gt;&gt;&gt; agree here; bits shifted past the width are discarded.</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function BitRow({ label, bits, highlight }: { label: string; bits: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 font-mono text-xs text-fg-muted">{label}</span>
      <div className="flex gap-0.5">
        {bits.split("").map((bit, i) => (
          <span
            key={i}
            className={cn(
              "flex h-6 w-5 items-center justify-center rounded border font-mono text-[11px]",
              i % 4 === 3 && i !== bits.length - 1 && "mr-1",
              bit === "1" ? (highlight ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border-strong bg-surface-hover text-fg") : "text-fg-subtle",
            )}
          >
            {bit}
          </span>
        ))}
      </div>
    </div>
  );
}
