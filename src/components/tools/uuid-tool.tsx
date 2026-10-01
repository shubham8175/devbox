"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  generateUuids,
  inspectUuid,
  parseUuidValue,
  splitUuidPaste,
  TIMESTAMP_VERSIONS,
  UUID_COMPARE_SAMPLE,
  UUID_VERSION_LABELS,
  type GeneratedVersion,
} from "@/lib/tools/uuid";
import { relativeTime } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { Segmented } from "@/components/ui/segmented";
import { TimeCompare } from "@/components/time-compare";

const COUNTS = [1, 5, 10, 25, 100];

const VERSION_OPTIONS: Array<{ value: `${GeneratedVersion}`; label: string }> = [
  { value: "4", label: "v4 · random" },
  { value: "7", label: "v7 · time-ordered" },
];

export function UuidTool() {
  const hydrated = useHydrated();
  const [version, setVersion] = useState<GeneratedVersion>(4);
  const [generated, setUuids] = useState<string[]>(() => generateUuids(1));
  const [check, setCheck] = useState("");
  // Random values differ between server and client; only show them after hydration.
  const uuids = hydrated ? generated : [];

  const info = useMemo(() => (check.trim() ? inspectUuid(check) : null), [check]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader
          title={`Generate v${version}`}
          description={
            version === 7
              ? "Current Unix ms timestamp followed by random bits from crypto.getRandomValues(), so IDs sort by creation time."
              : "Uses crypto.randomUUID() for cryptographically strong randomness."
          }
          actions={<CopyButton label="Copy all" value={uuids.join("\n")} />}
        />
        <Segmented
          size="sm"
          className="mb-3"
          value={`${version}`}
          options={VERSION_OPTIONS}
          onChange={(v) => {
            const next = Number(v) as GeneratedVersion;
            setVersion(next);
            setUuids(generateUuids(generated.length, next));
          }}
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {COUNTS.map((n) => (
            <Button key={n} size="sm" variant={n === 1 ? "primary" : "secondary"} onClick={() => setUuids(generateUuids(n, version))}>
              {n === 1 ? "Generate 1" : `Generate ${n}`}
            </Button>
          ))}
        </div>
        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {uuids.map((u, i) => (
            <li key={`${u}-${i}`} className="flex items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-1.5">
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-fg-subtle">{i + 1}</span>
              <span className="min-w-0 flex-1 break-all font-mono text-sm">{u}</span>
              <Button size="sm" variant="ghost" onClick={() => setCheck(u)}>
                Inspect
              </Button>
              <CopyButton value={u} iconOnly />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          title="Validate"
          description="Checks format, reads the version and variant bits, and decodes the timestamp of v1, v6 and v7."
        />
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
              <div className="grid gap-2">
                <OutputRow
                  label="Version"
                  value={info.version ? `v${info.version}` : "—"}
                  hint={info.version ? UUID_VERSION_LABELS[info.version] : undefined}
                  copyable={false}
                />
                <OutputRow label="Variant" value={info.variant ?? ""} mono={false} copyable={false} />
                <OutputRow label="Normalized" value={info.normalized ?? ""} />
              </div>
              {info.timestamp ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone="accent">Created {relativeTime(info.timestamp.date)}</Badge>
                    <span className="text-xs text-fg-subtle">{info.timestamp.source}</span>
                  </div>
                  <div className="grid gap-2">
                    <OutputRow label="Local" value={info.timestamp.local} mono={false} />
                    <OutputRow label="UTC" value={info.timestamp.utc} mono={false} />
                    <OutputRow label="ISO 8601" value={info.timestamp.iso} />
                    <OutputRow label="Unix timestamp (ms)" value={String(info.timestamp.unixMs)} />
                  </div>
                </>
              ) : (
                <p className="text-xs text-fg-subtle">
                  {info.version === 4
                    ? "No timestamp: v4 UUIDs are entirely random. Only v1, v6 and v7 embed a creation time."
                    : info.version && TIMESTAMP_VERSIONS.includes(info.version)
                      ? "The variant isn't RFC 9562, so the timestamp bits can't be read."
                      : "No timestamp: only v1, v6 and v7 UUIDs embed a creation time."}
                </p>
              )}
            </div>
          ) : (
            <Alert tone="danger" className="mt-3">
              {info.error}
            </Alert>
          )
        ) : null}
      </Card>

      <TimeCompare
        id="uuid-compare"
        className="lg:col-span-5"
        title="Compare"
        description="Enter v1, v6 or v7 UUIDs in separate fields to see how far apart they were created."
        placeholder="018bcfe5-6800-7a1c-9f3e-5b2d4c6e8a01"
        sample={UUID_COMPARE_SAMPLE}
        parse={parseUuidValue}
        splitPaste={splitUuidPaste}
      />
    </div>
  );
}
