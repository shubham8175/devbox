"use client";

import { useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { parseUserAgent, UA_SAMPLE, UA_SAMPLES, type DeviceType } from "@/lib/tools/user-agent";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const DEVICE_TONE: Record<DeviceType, "success" | "accent" | "warning" | "danger" | "neutral"> = {
  desktop: "accent",
  mobile: "success",
  tablet: "success",
  bot: "warning",
  tv: "neutral",
  console: "neutral",
  unknown: "neutral",
};

export function UserAgentTool() {
  const [ua, setUa] = useState("");
  const [sample, setSample] = useState("");

  const parsed = useMemo(() => (ua.trim() ? parseUserAgent(ua) : null), [ua]);
  const withVersion = (name: string, version: string) => (version ? `${name} ${version}` : name);

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="User-Agent string"
          description="Parsed locally with pattern matching. UA strings can be spoofed or frozen, so treat results as hints."
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  // Read in the click handler only: navigator does not exist during SSR.
                  setUa(navigator.userAgent);
                  setSample("");
                }}
              >
                <Globe className="h-3.5 w-3.5" /> Use this browser&apos;s UA
              </Button>
              {!ua ? (
                <Button size="sm" variant="ghost" onClick={() => setUa(UA_SAMPLE)}>
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setUa("");
                    setSample("");
                  }}
                >
                  Clear
                </Button>
              )}
            </>
          }
        />
        <Textarea value={ua} onChange={(e) => setUa(e.target.value)} placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" className="min-h-[90px] break-all" aria-label="User-Agent string" />
        <div className="mt-3 max-w-xs">
          <Label htmlFor="ua-sample">Samples</Label>
          <Select
            id="ua-sample"
            value={sample}
            onChange={(e) => {
              setSample(e.target.value);
              const s = UA_SAMPLES.find((x) => x.name === e.target.value);
              if (s) setUa(s.ua);
            }}
          >
            <option value="">Pick a sample…</option>
            {UA_SAMPLES.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!parsed ? (
        <EmptyState title="Paste a User-Agent to parse it" description="Or use the button above to read this browser's own string." />
      ) : (
        <>
          <Card className="shadow-card">
            <CardHeader
              title="Result"
              actions={
                <>
                  <Badge tone={DEVICE_TONE[parsed.device.type]}>{parsed.device.type}</Badge>
                  {parsed.isBot ? <Badge tone="warning">bot</Badge> : null}
                  {parsed.flags.map((f) => (
                    <Badge key={f} tone="accent">
                      {f}
                    </Badge>
                  ))}
                  <CopyButton value={JSON.stringify({ browser: parsed.browser, engine: parsed.engine, os: parsed.os, device: parsed.device, isBot: parsed.isBot, flags: parsed.flags }, null, 2)} label="Copy JSON" />
                </>
              }
            />
            <OutputGrid>
              <OutputRow label="Browser" value={withVersion(parsed.browser.name, parsed.browser.version)} hint={parsed.browser.major ? `Major version ${parsed.browser.major}` : undefined} mono={false} />
              <OutputRow label="Engine" value={withVersion(parsed.engine.name, parsed.engine.version)} mono={false} />
              <OutputRow label="Operating system" value={withVersion(parsed.os.name, parsed.os.version)} mono={false} />
              <OutputRow label="Device" value={[parsed.device.vendor, parsed.device.model].filter(Boolean).join(" ") || parsed.device.type} mono={false} />
            </OutputGrid>
            {parsed.notes.length ? (
              <Alert tone="info" className="mt-3">
                <ul className="list-disc space-y-0.5 pl-4">
                  {parsed.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </Card>

          <Card className="shadow-card">
            <CardHeader title="How it was detected" description="Tokens in the string that decided each field. Rules run in order: bots, then Chromium forks, Firefox, Chrome, IE, Safari." />
            {parsed.evidence.length ? (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {parsed.evidence.map((e, i) => (
                  <li key={`${e.what}-${i}`} className="flex items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-2 text-xs">
                    <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{e.what}</span>
                    <span className="min-w-0 break-all font-mono text-fg">{e.token}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-fg-subtle">No known tokens matched; this is probably not a browser or a known tool.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
