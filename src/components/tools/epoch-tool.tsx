"use client";

import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { Clock, Eraser } from "lucide-react";
import { parseEpochInput } from "@/lib/tools/epoch";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

/** 2023-11-14T22:13:20Z: a round number that is easy to recognise in the output. */
const EPOCH_SAMPLE = "1700000000";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { TimeCompare } from "@/components/time-compare";
import { EPOCH_COMPARE_SAMPLE, parseEpochValue, splitEpochPaste } from "@/lib/tools/time-compare";

const KIND_LABEL: Record<string, string> = {
  seconds: "Detected: Unix seconds",
  milliseconds: "Detected: Unix milliseconds",
  iso: "Detected: date string",
};

export function EpochTool() {
  const [input, setInput] = useState("");
  const now = useNow(1000);

  const result = useMemo(() => parseEpochInput(input, now ?? undefined), [input, now]);
  const nowSeconds = now ? String(Math.floor(now.getTime() / 1000)) : "";
  const nowMillis = now ? String(now.getTime()) : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Current time"
          description="Updates every second."
          actions={
            <>
              <Button size="sm" onClick={() => setInput(nowSeconds)} disabled={!now}>
                <Clock className="h-3.5 w-3.5" /> Use now
              </Button>
            </>
          }
        />
        <OutputGrid>
          <OutputRow label="Unix seconds" value={nowSeconds} />
          <OutputRow label="Unix milliseconds" value={nowMillis} />
        </OutputGrid>
      </Card>

      <Card>
        <CardHeader
          title="Convert"
          description="Paste a Unix timestamp (seconds or milliseconds) or any ISO 8601 / date string."
          actions={
            !input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(EPOCH_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            )
          }
        />
        <Label htmlFor="epoch-input" hint={result.kind in KIND_LABEL ? KIND_LABEL[result.kind] : undefined}>
          Timestamp or date
        </Label>
        <Input
          id="epoch-input"
          mono
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="1700000000  ·  1700000000000  ·  2024-01-15T10:30:00Z"
          invalid={result.kind === "invalid"}
        />
        {result.kind === "invalid" && result.error ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}

        {result.outputs ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone="accent">{result.outputs.relative}</Badge>
            </div>
            <OutputGrid>
              <OutputRow label="Local" value={result.outputs.local} mono={false} />
              <OutputRow label="UTC" value={result.outputs.utc} mono={false} />
              <OutputRow label="ISO 8601" value={result.outputs.iso} />
              <OutputRow label="Relative" value={result.outputs.relative} mono={false} />
              <OutputRow label="Unix seconds" value={result.outputs.seconds} />
              <OutputRow label="Unix milliseconds" value={result.outputs.milliseconds} />
            </OutputGrid>
            <div className="flex justify-end pt-1">
              <CopyButton
                label="Copy all"
                value={[
                  `Local: ${result.outputs.local}`,
                  `UTC: ${result.outputs.utc}`,
                  `ISO: ${result.outputs.iso}`,
                  `Seconds: ${result.outputs.seconds}`,
                  `Milliseconds: ${result.outputs.milliseconds}`,
                ].join("\n")}
              />
            </div>
          </div>
        ) : result.kind === "empty" ? (
          <p className="mt-4 text-xs text-fg-subtle">
            Numbers below 100,000,000,000 are treated as seconds; larger values as milliseconds.
          </p>
        ) : null}
      </Card>

      <TimeCompare
        id="epoch-compare"
        title="Compare"
        description="Enter timestamps in separate fields to see the gap between each."
        placeholder="1700000000"
        sample={EPOCH_COMPARE_SAMPLE}
        parse={parseEpochValue}
        splitPaste={splitEpochPaste}
      />
    </div>
  );
}
