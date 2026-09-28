"use client";

import { useMemo, useState } from "react";
import { addTax, money, QUICK_RATES, removeTax } from "@/lib/tools/tax";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Alert } from "@/components/ui/alert";
import { OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

type Mode = "add" | "remove";

export function TaxTool() {
  const [mode, setMode] = useState<Mode>("add");
  const [amount, setAmount] = useState("1000");
  const [rate, setRate] = useState("18");

  const a = Number(amount);
  const r = Number(rate);
  const validAmount = amount.trim() !== "" && Number.isFinite(a) && a >= 0;
  const validRate = rate.trim() !== "" && Number.isFinite(r) && r >= 0;

  const result = useMemo(() => {
    if (!validAmount || !validRate) return null;
    return mode === "add" ? addTax(a, r) : removeTax(a, r);
  }, [mode, a, r, validAmount, validRate]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={mode === "add" ? "Add tax to a base amount" : "Extract tax from an inclusive amount"}
          description="Plain percentage arithmetic. Currency-agnostic."
          actions={
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "add", label: "Exclusive → Inclusive" },
                { value: "remove", label: "Inclusive → Exclusive" },
              ]}
            />
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tax-amount">{mode === "add" ? "Base amount (before tax)" : "Final amount (including tax)"}</Label>
            <Input id="tax-amount" mono type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={!validAmount} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="tax-rate">Tax rate (%)</Label>
            <Input id="tax-rate" mono type="number" inputMode="decimal" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} invalid={!validRate} className="h-11 text-base" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_RATES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setRate(String(q))}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer",
                r === q ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {q}%
            </button>
          ))}
        </div>
        {!validAmount || !validRate ? (
          <Alert tone="danger" className="mt-3">
            Enter a non-negative amount and rate.
          </Alert>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Breakdown" />
        <div className="grid gap-2 sm:grid-cols-3">
          <OutputRow label="Base amount" value={result ? money(result.base) : ""} />
          <OutputRow label={`Tax (${result ? result.rate : rate || 0}%)`} value={result ? money(result.tax) : ""} />
          <OutputRow label="Final amount" value={result ? money(result.total) : ""} className="border-accent/30 bg-accent-soft/40" />
        </div>
        {result ? (
          <p className="mt-3 font-mono text-xs text-fg-subtle">
            {mode === "add"
              ? `${money(result.base)} × ${result.rate}% = ${money(result.tax)} · ${money(result.base)} + ${money(result.tax)} = ${money(result.total)}`
              : `${money(result.total)} ÷ (1 + ${result.rate}/100) = ${money(result.base)} · ${money(result.total)} − ${money(result.base)} = ${money(result.tax)}`}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
