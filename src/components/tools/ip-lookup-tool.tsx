"use client";

import { useState, type FormEvent } from "react";
import { Globe2, LocateFixed, Search } from "lucide-react";
import { detectPublicIp, lookupIp, LookupError, mapLink, parseIp, specialLabel, type IpDetails, type PublicIps } from "@/lib/tools/ip-lookup";
import { useOnline } from "@/lib/pwa";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const EXAMPLES = ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "103.21.244.0", "192.168.1.1"];

type Result =
  | { kind: "special"; address: string; family: 4 | 6; label: string }
  | { kind: "details"; address: string; details: IpDetails };

type Status = { state: "idle" } | { state: "loading"; address: string } | { state: "error"; message: string; attempts?: Array<{ service: string; reason: string }> };

function localTime(zone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  } catch {
    return null;
  }
}

function place(d: IpDetails): string {
  return [d.city, d.region, d.country].filter((p, i, arr) => p && arr.indexOf(p) === i).join(", ") || "Location unknown";
}

function summarize(d: IpDetails): string {
  const rows: Array<[string, string | null]> = [
    ["IP", d.ip],
    ["Location", place(d)],
    ["Country", d.countryCode ? `${d.country ?? ""} (${d.countryCode})`.trim() : d.country],
    ["Continent", d.continent],
    ["Postal", d.postal],
    ["Coordinates", d.latitude !== null && d.longitude !== null ? `${d.latitude}, ${d.longitude}` : null],
    ["Timezone", d.timezone ? `${d.timezone}${d.utcOffset ? ` (UTC${d.utcOffset})` : ""}` : null],
    ["ISP", d.isp],
    ["Organisation", d.org],
    ["ASN", d.asn],
    ["Hostname", d.hostname],
    ["Source", d.source],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function IpLookupTool() {
  const online = useOnline();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [result, setResult] = useState<Result | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [mine, setMine] = useState<PublicIps | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // One request per explicit action: submit, an example chip, or "Detect my IP".
  async function run(raw: string) {
    const parsed = parseIp(raw);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    const address = parsed.value.text;
    const label = specialLabel(parsed.value);
    if (label) {
      // Reserved ranges are answered locally and never sent anywhere.
      setStatus({ state: "idle" });
      setResult({ kind: "special", address, family: parsed.value.family, label });
      return;
    }
    if (!online) {
      setStatus({ state: "error", message: "You are offline. Looking up an address needs a connection to the geolocation service." });
      return;
    }
    setStatus({ state: "loading", address });
    try {
      const details = await lookupIp(address);
      setResult({ kind: "details", address, details });
      setStatus({ state: "idle" });
    } catch (e) {
      setStatus({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
        attempts: e instanceof LookupError ? e.attempts : undefined,
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(input);
  }

  function pick(address: string) {
    setInput(address);
    void run(address);
  }

  async function detect() {
    if (!online) {
      setStatus({ state: "error", message: "You are offline. Detecting your public address needs a connection to ipify." });
      return;
    }
    setDetecting(true);
    try {
      const ips = await detectPublicIp();
      setMine(ips);
      const address = ips.ipv4 ?? ips.ipv6;
      if (address) pick(address);
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setDetecting(false);
    }
  }

  const loading = status.state === "loading";
  const details = result?.kind === "details" ? result.details : null;
  const nowThere = details?.timezone ? localTime(details.timezone) : null;

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Address"
          description="IPv4 or IPv6. The address is sent to a free geolocation service (ipwho.is, then ipinfo.io) only when you press Look up."
          actions={
            <Button size="sm" variant="secondary" onClick={() => void detect()} disabled={detecting || loading} title="Asks ipify for this device's public address">
              <LocateFixed className="h-3.5 w-3.5" />
              {detecting ? "Detecting…" : "Detect my IP"}
            </Button>
          }
        />
        <form onSubmit={onSubmit}>
          <Label htmlFor="ip-lookup-in">IP address</Label>
          <div className="flex gap-2">
            <Input
              id="ip-lookup-in"
              mono
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              placeholder="8.8.8.8 or 2001:4860:4860::8888"
              invalid={inputError !== null}
              className="h-11 text-base"
              aria-describedby={inputError ? "ip-lookup-error" : undefined}
              enterKeyHint="search"
            />
            <Button type="submit" variant="primary" className="h-11 shrink-0 px-4" disabled={loading || !input.trim()}>
              <Search className="h-4 w-4" />
              {loading ? "Looking up…" : "Look up"}
            </Button>
          </div>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => pick(ex)} className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
              {ex}
            </button>
          ))}
        </div>
        {mine ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>Your public address:</span>
            {[mine.ipv4, mine.ipv6].map((ip) =>
              ip ? (
                <button key={ip} type="button" onClick={() => pick(ip)} className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg hover:border-border-strong cursor-pointer">
                  {ip}
                </button>
              ) : null,
            )}
            {!mine.ipv4 ? <span>(no IPv4 on this network)</span> : !mine.ipv6 ? <span>(no IPv6 on this network)</span> : null}
          </div>
        ) : null}
        {inputError ? (
          <Alert tone="danger" className="mt-3">
            <span id="ip-lookup-error">{inputError}</span>
          </Alert>
        ) : null}
        {!online ? (
          <Alert tone="warning" className="mt-3">
            You are offline. Reserved addresses are still recognised, but public ones need a connection.
          </Alert>
        ) : null}
        {status.state === "error" ? (
          <Alert tone="danger" className="mt-3">
            <div>{status.message}</div>
            {status.attempts ? (
              <ul className="mt-1 list-disc pl-4">
                {status.attempts.map((a) => (
                  <li key={a.service}>
                    {a.service}: {a.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </Card>

      {status.state === "loading" ? (
        <Card className="shadow-card" aria-live="polite">
          <CardHeader title="Location" />
          <p className="text-sm text-fg-subtle">Looking up {status.address}…</p>
        </Card>
      ) : result === null ? (
        <EmptyState icon={Globe2} title="Enter an address to locate it" description="Country, region, city, coordinates, timezone, ISP and network details." />
      ) : result.kind === "special" ? (
        <Card className="shadow-card" aria-live="polite">
          <CardHeader
            title="Location"
            actions={
              <>
                <Badge>IPv{result.family}</Badge>
                <Badge tone="warning">{result.label}</Badge>
              </>
            }
          />
          <p className="text-sm text-fg-muted">
            <span className="font-mono text-fg">{result.address}</span> is reserved for {result.label.toLowerCase()} use and is not routed on the public internet, so it has no location. Nothing was sent
            to the lookup service.
          </p>
          <p className="mt-2 text-xs text-fg-subtle">Looking for where your home network is? Press “Detect my IP” to find the public address your ISP gave your router.</p>
        </Card>
      ) : details ? (
        <Card className="shadow-card" aria-live="polite">
          <CardHeader
            title="Location"
            actions={
              <>
                <Badge>IPv{details.version}</Badge>
                {details.anycast ? <Badge tone="warning">Anycast</Badge> : null}
                <Badge>via {details.source}</Badge>
                <CopyButton value={summarize(details)} label="Copy summary" />
                <CopyButton value={JSON.stringify(details, null, 2)} label="Copy JSON" />
              </>
            }
          />
          <div className="mb-4 flex items-center gap-4">
            <span className="text-5xl leading-none" aria-hidden="true">
              {details.flag ?? "🌐"}
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-semibold text-fg">{place(details)}</div>
              <div className="text-sm text-fg-muted">{[details.isp ?? details.org, details.asn].filter(Boolean).join(" · ") || "Network unknown"}</div>
            </div>
          </div>
          {details.anycast ? (
            <Alert tone="info" className="mb-4">
              This is an anycast address: the same IP is announced from many places at once, so the city shown is only where the database registered it.
            </Alert>
          ) : null}
          <OutputGrid>
            <OutputRow label="IP address" value={details.ip} />
            <OutputRow label="Country" value={details.country ?? ""} mono={false} hint={details.countryCode ? `ISO ${details.countryCode}${details.isEu ? " · EU member" : ""}` : undefined} />
            <OutputRow label="Region / state" value={details.region ?? ""} mono={false} hint={details.regionCode ?? undefined} />
            <OutputRow label="City" value={details.city ?? ""} mono={false} />
            <OutputRow label="Postal code" value={details.postal ?? ""} hint="Approximate: a representative code for the area, services often disagree" />
            <OutputRow label="Continent" value={details.continent ?? ""} mono={false} />
            <OutputRow
              label="Coordinates"
              value={details.latitude !== null && details.longitude !== null ? `${details.latitude}, ${details.longitude}` : ""}
              hint={
                details.latitude !== null && details.longitude !== null ? (
                  <>
                    City centre, not your street ·{" "}
                    <a href={mapLink(details.latitude, details.longitude)} target="_blank" rel="noreferrer noopener" className="underline hover:text-fg">
                      Open in OpenStreetMap
                    </a>
                  </>
                ) : undefined
              }
            />
            <OutputRow label="Timezone" value={details.timezone ?? ""} hint={[details.utcOffset ? `UTC${details.utcOffset}` : null, nowThere ? `now ${nowThere}` : null].filter(Boolean).join(" · ") || undefined} />
            <OutputRow label="ISP" value={details.isp ?? ""} mono={false} />
            <OutputRow label="Organisation" value={details.org ?? ""} mono={false} />
            <OutputRow label="ASN" value={details.asn ?? ""} />
            <OutputRow label="Domain" value={details.domain ?? ""} />
            <OutputRow label="Hostname (reverse DNS)" value={details.hostname ?? ""} />
            <OutputRow label="Calling code" value={details.callingCode ?? ""} />
            <OutputRow label="Capital" value={details.capital ?? ""} mono={false} />
          </OutputGrid>
        </Card>
      ) : null}

      <p className="text-[11px] text-fg-subtle">
        Location comes from public geolocation databases and is city-level at best: home connections are usually right to the city, mobile networks and VPNs often are not. Free services: ipwho.is
        (10,000 lookups a month per visitor), ipinfo.io as fallback, ipify for “Detect my IP”. This is the only DevBox tool that sends what you type to another server.
      </p>
    </div>
  );
}
