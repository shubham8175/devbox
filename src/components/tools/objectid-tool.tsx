"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { RefreshCw } from "lucide-react";
import { decodeObjectId, generateObjectId } from "@/lib/tools/objectid";
import { relativeTime } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function ObjectIdTool() {
  const [input, setInput] = useState("");
  const hydrated = useHydrated();
  const [generatedIds, setGenerated] = useState<string[]>(() => [generateObjectId()]);
  // ObjectIds embed the current time, so only render them after hydration.
  const generated = hydrated ? generatedIds : [];

  const decoded = useMemo(() => (input.trim() ? decodeObjectId(input) : null), [input]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader
          title="Decode"
          description="Extract the embedded creation timestamp."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setInput("")} disabled={!input}>
              Clear
            </Button>
          }
        />
        <Label htmlFor="oid-input" hint={`${input.trim().length}/24`}>
          ObjectId
        </Label>
        <Input
          id="oid-input"
          mono
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="507f1f77bcf86cd799439011"
          invalid={decoded ? !decoded.valid : false}
          maxLength={40}
        />
        {decoded && !decoded.valid ? (
          <Alert tone="danger" className="mt-3">
            {decoded.error}
          </Alert>
        ) : null}

        {decoded?.valid ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone="success">Valid ObjectId</Badge>
              <Badge tone="accent">Created {relativeTime(decoded.date)}</Badge>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Structure</div>
              <div className="flex flex-wrap gap-1 font-mono text-sm">
                <Segment label="Timestamp · 4 bytes" value={decoded.timestampHex} tone="accent" />
                <Segment label="Random · 5 bytes" value={decoded.randomHex} tone="warning" />
                <Segment label="Counter · 3 bytes" value={decoded.counterHex} tone="success" />
              </div>
            </div>

            <OutputGrid>
              <OutputRow label="Unix timestamp (s)" value={String(decoded.unixSeconds)} />
              <OutputRow label="Unix timestamp (ms)" value={String(decoded.unixSeconds * 1000)} />
              <OutputRow label="Local" value={decoded.local} mono={false} />
              <OutputRow label="UTC" value={decoded.utc} mono={false} />
              <OutputRow label="ISO 8601" value={decoded.iso} className="sm:col-span-2" />
            </OutputGrid>
          </div>
        ) : !input.trim() ? (
          <p className="mt-4 text-xs text-fg-subtle">
            ObjectIds are 12 bytes: a 4-byte Unix timestamp, 5 random bytes, and a 3-byte counter, shown as 24 hex characters.
          </p>
        ) : null}
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Generate"
          description="MongoDB-style IDs created locally."
          actions={
            <Button size="sm" onClick={() => setGenerated((g) => [generateObjectId(), ...g].slice(0, 10))}>
              <RefreshCw className="h-3.5 w-3.5" /> New
            </Button>
          }
        />
        <div className="space-y-2">
          {generated.map((id, i) => (
            <div key={id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-2">
              <span className="min-w-0 flex-1 basis-48 break-all font-mono text-sm">{id}</span>
              {i === 0 ? <Badge tone="accent">latest</Badge> : null}
              <Button size="sm" variant="ghost" onClick={() => setInput(id)}>
                Decode
              </Button>
              <CopyButton value={id} iconOnly />
            </div>
          ))}
        </div>
        {generated.length > 1 ? (
          <div className="mt-3 flex justify-end">
            <CopyButton label="Copy all" value={generated.join("\n")} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Segment({ label, value, tone }: { label: string; value: string; tone: "accent" | "warning" | "success" }) {
  const colors = {
    accent: "bg-accent-soft text-accent-strong",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
  }[tone];
  return (
    <span className={`flex flex-col rounded-md px-2 py-1 ${colors}`} title={label}>
      <span className="break-all">{value}</span>
      <span className="font-sans text-[10px] opacity-80">{label}</span>
    </span>
  );
}
