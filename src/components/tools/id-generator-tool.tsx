"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { RefreshCw } from "lucide-react";
import { CHARSETS, generateIds, type IdCharset, type IdOptions } from "@/lib/tools/id-generator";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

const DEFAULTS: IdOptions = {
  charset: "alphanumeric",
  length: 12,
  prefix: "",
  quantity: 5,
  timestamp: false,
  separator: "-",
};

const PRESETS: Array<{ label: string; opts: Partial<IdOptions> }> = [
  { label: "Order ID", opts: { prefix: "ORD", timestamp: true, length: 0, quantity: 5 } },
  { label: "Invoice", opts: { prefix: "INV", charset: "numeric", length: 8, timestamp: false, quantity: 5 } },
  { label: "API key", opts: { prefix: "", charset: "alphanumeric", length: 32, timestamp: false, quantity: 3 } },
  { label: "Short code", opts: { prefix: "", charset: "uppercase", length: 6, timestamp: false, quantity: 10 } },
  { label: "Hex token", opts: { prefix: "", charset: "hex", length: 24, timestamp: false, quantity: 5 } },
];

export function IdGeneratorTool() {
  const hydrated = useHydrated();
  const [opts, setOpts] = useState<IdOptions>(DEFAULTS);
  const [nonce, setNonce] = useState(0);

  const length = Math.max(0, Math.min(128, Math.floor(opts.length) || 0));
  const quantity = Math.max(1, Math.min(500, Math.floor(opts.quantity) || 1));
  const invalid = length === 0 && !opts.timestamp;

  // Regenerate whenever options (or the nonce) change. Client-only, since IDs are random/time-based.
  const ids = useMemo<string[]>(() => {
    if (!hydrated || invalid) return [];
    void nonce;
    return generateIds({ ...opts, length, quantity });
  }, [hydrated, invalid, opts, length, quantity, nonce]);

  const set = <K extends keyof IdOptions>(key: K, value: IdOptions[K]) => setOpts((o) => ({ ...o, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2 lg:self-start">
        <CardHeader title="Options" />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" onClick={() => setOpts((o) => ({ ...o, ...p.opts }))}>
                {p.label}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="id-prefix">Prefix</Label>
            <Input id="id-prefix" mono value={opts.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="ORD" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="id-charset">Charset</Label>
              <Select id="id-charset" value={opts.charset} onChange={(e) => set("charset", e.target.value as IdCharset)}>
                {(Object.keys(CHARSETS) as IdCharset[]).map((c) => (
                  <option key={c} value={c}>
                    {CHARSETS[c].label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="id-sep">Separator</Label>
              <Input id="id-sep" mono value={opts.separator} onChange={(e) => set("separator", e.target.value)} maxLength={3} placeholder="-" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="id-length" hint="0–128">
                Random length
              </Label>
              <Input id="id-length" mono type="number" min={0} max={128} value={opts.length} onChange={(e) => set("length", Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="id-qty" hint="1–500">
                Quantity
              </Label>
              <Input id="id-qty" mono type="number" min={1} max={500} value={opts.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
            <input type="checkbox" checked={opts.timestamp} onChange={(e) => set("timestamp", e.target.checked)} className="accent-accent" />
            Include millisecond timestamp
          </label>
          {invalid ? <Alert tone="warning">Set a random length above 0 or enable the timestamp.</Alert> : null}
          <p className="text-xs text-fg-subtle">Random characters come from crypto.getRandomValues with unbiased sampling.</p>
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader
          title="Generated"
          description={ids.length ? `${ids.length} IDs` : undefined}
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => setNonce((n) => n + 1)} disabled={invalid}>
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <CopyButton label="Copy all" value={ids.join("\n")} />
            </>
          }
        />
        {ids.length === 0 ? (
          <EmptyState title="Nothing to generate yet" description="Adjust the options on the left." className="py-8" />
        ) : (
          <ul className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {ids.map((id, i) => (
              <li key={`${id}-${i}`} className="flex items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-1.5">
                <span className="w-7 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{id}</span>
                <CopyButton value={id} iconOnly />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
