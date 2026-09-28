"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { generateUuids, inspectUuid, UUID_VERSION_LABELS } from "@/lib/tools/uuid";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const COUNTS = [1, 5, 10, 25, 100];

export function UuidTool() {
  const hydrated = useHydrated();
  const [generated, setUuids] = useState<string[]>(() => generateUuids(1));
  const [check, setCheck] = useState("");
  // Random values differ between server and client; only show them after hydration.
  const uuids = hydrated ? generated : [];

  const info = useMemo(() => (check.trim() ? inspectUuid(check) : null), [check]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader
          title="Generate v4"
          description="Uses crypto.randomUUID() for cryptographically strong randomness."
          actions={<CopyButton label="Copy all" value={uuids.join("\n")} />}
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {COUNTS.map((n) => (
            <Button key={n} size="sm" variant={n === 1 ? "primary" : "secondary"} onClick={() => setUuids(generateUuids(n))}>
              {n === 1 ? "Generate 1" : `Generate ${n}`}
            </Button>
          ))}
        </div>
        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {uuids.map((u, i) => (
            <li key={`${u}-${i}`} className="flex items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-1.5">
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{u}</span>
              <CopyButton value={u} iconOnly />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Validate" description="Checks format and reads the version and variant bits." />
        <Label htmlFor="uuid-check">UUID</Label>
        <Input
          id="uuid-check"
          mono
          value={check}
          onChange={(e) => setCheck(e.target.value)}
          placeholder="123e4567-e89b-42d3-a456-426614174000"
          invalid={info ? !info.valid : false}
        />
        {info ? (
          info.valid ? (
            <div className="mt-3 space-y-2">
              <Badge tone="success">Valid UUID</Badge>
              <OutputGrid className="sm:grid-cols-1">
                <OutputRow
                  label="Version"
                  value={info.version ? `v${info.version}` : "—"}
                  hint={info.version ? UUID_VERSION_LABELS[info.version] : undefined}
                  copyable={false}
                />
                <OutputRow label="Variant" value={info.variant ?? ""} mono={false} copyable={false} />
                <OutputRow label="Normalized" value={info.normalized ?? ""} />
              </OutputGrid>
            </div>
          ) : (
            <Alert tone="danger" className="mt-3">
              {info.error}
            </Alert>
          )
        ) : null}
      </Card>
    </div>
  );
}
