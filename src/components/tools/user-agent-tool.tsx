"use client";

import { useMemo, useState } from "react";
import { Eraser, Globe } from "lucide-react";
import {
  compareUserAgents,
  isUnrecognisedUserAgent,
  MAX_UA_COMPARE,
  parseUserAgent,
  splitUserAgentPaste,
  UA_COMPARE_SAMPLE,
  UA_SAMPLE,
  UA_SAMPLES,
  userAgentSummary,
  type DeviceType,
} from "@/lib/tools/user-agent";
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
import { useValueList, ValueList } from "@/components/value-list";
import { cn } from "@/lib/utils";

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

      <UserAgentCompare />
    </div>
  );
}

/** "Compare user agents": one box per UA, then a fields × UAs table with differences from #1 highlighted. */
function UserAgentCompare() {
  const list = useValueList({ max: MAX_UA_COMPARE });
  const { values, hasInput, reset } = list;

  const parsed = useMemo(
    () =>
      values.flatMap((v, i) => {
        const p = v.trim() ? parseUserAgent(v) : null;
        return p && !isUnrecognisedUserAgent(p) ? [{ line: i + 1, ua: v.trim(), parsed: p }] : [];
      }),
    [values],
  );
  const rows = useMemo(() => compareUserAgents(parsed.map((p) => p.parsed)), [parsed]);
  const differing = rows.filter((r) => !r.same).length;

  const report = [
    ...parsed.map((p) => `#${p.line} ${p.ua}`),
    "",
    ...rows.map((r) => `${r.label}: ${r.values.map((v, i) => `#${parsed[i].line} ${v || "—"}`).join(" | ")}${r.same ? "" : "  [differs]"}`),
  ].join("\n");

  const addOwnUa = () => {
    // Read in the click handler only: navigator does not exist during SSR.
    const own = navigator.userAgent;
    const i = values.findIndex((v) => !v.trim());
    reset(i === -1 ? [...values, own] : values.map((v, j) => (j === i ? own : v)));
  };

  return (
    <Card className="shadow-card">
      <CardHeader
        title="Compare user agents"
        description="One User-Agent per field. Fields that differ from #1 are highlighted."
        actions={
          <>
            <Button size="sm" onClick={addOwnUa} disabled={values.length >= MAX_UA_COMPARE && values.every((v) => v.trim())}>
              <Globe className="h-3.5 w-3.5" /> Use this browser&apos;s UA
            </Button>
            {!hasInput ? (
              <Button size="sm" variant="ghost" onClick={() => reset(UA_COMPARE_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => reset([])}>
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </>
        }
      />

      <ValueList
        list={list}
        id="ua-compare"
        placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
        itemLabel="user agent"
        splitPaste={splitUserAgentPaste}
        status={(value) => {
          const p = parseUserAgent(value);
          return isUnrecognisedUserAgent(p) ? { tone: "error", content: "Not a recognised User-Agent." } : { tone: "ok", content: userAgentSummary(p) };
        }}
      />

      {parsed.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {differing ? <Badge tone="accent">{differing} of {rows.length} fields differ</Badge> : <Badge tone="success">All fields identical</Badge>}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] table-fixed text-left text-sm">
              <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="w-32 px-3 py-2 font-medium">Field</th>
                  {parsed.map((p) => (
                    <th key={p.line} className="px-3 py-2 font-medium" title={p.ua}>
                      #{p.line}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t align-top">
                    <td className={cn("whitespace-nowrap px-3 py-2", r.same ? "text-fg-subtle" : "font-medium text-fg")}>{r.label}</td>
                    {r.values.map((v, i) => (
                      <td key={parsed[i].line} className={cn("px-3 py-2", r.differs[i] ? "bg-warning-soft text-warning" : r.same ? "text-fg-muted" : "text-fg")}>
                        {v || <span className="text-fg-subtle">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {parsed.length === 1 ? "Add at least one more User-Agent to compare." : "Enter two or more User-Agent strings to compare them side by side."}
        </p>
      )}
    </Card>
  );
}
