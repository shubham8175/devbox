"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { ArrowLeftRight } from "lucide-react";
import { allTimezones, FEATURED_TIMEZONES } from "@/data/timezones";
import { formatInZone, formatInZoneLong, formatOffset, offsetMinutes, zonedTimeToInstant, zoneAbbreviation } from "@/lib/tools/timezone";
import { toDatetimeLocalValue } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function TimezoneTool() {
  const hydrated = useHydrated();
  const [localInput, setLocal] = useState<string | null>(null);
  const [fromInput, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState("UTC");

  // Client-only defaults: current local time, the browser's own timezone, and the full IANA list.
  const defaults = useMemo(() => {
    if (!hydrated) return { local: "", from: "Asia/Kolkata", zones: FEATURED_TIMEZONES.map((t) => t.id) };
    let mine = "Asia/Kolkata";
    try {
      mine = Intl.DateTimeFormat().resolvedOptions().timeZone || mine;
    } catch {
      // keep default
    }
    return { local: toDatetimeLocalValue(new Date()), from: mine, zones: allTimezones() };
  }, [hydrated]);
  const local = localInput ?? defaults.local;
  const from = fromInput ?? defaults.from;
  const zones = defaults.zones;

  const instant = useMemo(() => (local ? zonedTimeToInstant(local, from) : null), [local, from]);
  const featuredIds = new Set(FEATURED_TIMEZONES.map((t) => t.id));
  const others = zones.filter((z) => !featuredIds.has(z));

  const zoneSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Common">
        {FEATURED_TIMEZONES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </optgroup>
      {others.length ? (
        <optgroup label="All timezones">
          {others.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Convert"
          description="Enter a wall-clock time in the source timezone."
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLocal(toDatetimeLocalValue(new Date()))}>
                Now
              </Button>
            </>
          }
        />
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="tz-time">Date & time</Label>
            <Input id="tz-time" type="datetime-local" step={1} value={local} onChange={(e) => setLocal(e.target.value)} mono />
          </div>
          <div>
            <Label htmlFor="tz-from" hint={instant ? formatOffset(offsetMinutes(instant, from)) : undefined}>
              From
            </Label>
            {zoneSelect("tz-from", from, setFrom)}
          </div>
          <div>
            <Label htmlFor="tz-to" hint={instant ? formatOffset(offsetMinutes(instant, to)) : undefined}>
              To
            </Label>
            {zoneSelect("tz-to", to, setTo)}
          </div>
        </div>
        {local && !instant ? (
          <Alert tone="danger" className="mt-3">
            Enter a valid date and time.
          </Alert>
        ) : null}
      </Card>

      {instant ? (
        <>
          <Card>
            <CardHeader title="Result" actions={<CopyButton value={formatInZoneLong(instant, to)} />} />
            <div className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-accent-strong/80">
                {to} · {zoneAbbreviation(instant, to)}
              </div>
              <div className="mt-0.5 text-lg font-medium">{formatInZoneLong(instant, to)}</div>
            </div>
            <OutputGrid className="mt-3">
              <OutputRow label={`Source · ${from}`} value={formatInZone(instant, from)} mono={false} />
              <OutputRow label={`Target · ${to}`} value={formatInZone(instant, to)} mono={false} />
              <OutputRow label="ISO 8601 (UTC)" value={instant.toISOString()} />
              <OutputRow label="Unix seconds" value={String(Math.floor(instant.getTime() / 1000))} />
              <OutputRow
                label="Offset difference"
                value={formatOffset(offsetMinutes(instant, to) - offsetMinutes(instant, from)).replace("UTC", "")}
                hint="Target minus source"
                className="sm:col-span-2"
              />
            </OutputGrid>
          </Card>

          <Card>
            <CardHeader title="Same instant around the world" />
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURED_TIMEZONES.map((t) => (
                <OutputRow key={t.id} label={`${t.id} · ${formatOffset(offsetMinutes(instant, t.id))}`} value={formatInZone(instant, t.id)} mono={false} />
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
