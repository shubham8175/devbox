"use client";

import { useMemo, useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { ArrowLeftRight, Eraser } from "lucide-react";
import { allTimezones, FEATURED_TIMEZONES } from "@/data/timezones";
import { formatInZone, formatInZoneLong, formatOffset, offsetMinutes, zonedTimeToInstant, zoneAbbreviation } from "@/lib/tools/timezone";
import { toDatetimeLocalValue } from "@/lib/tools/time";
import {
  dayShiftLabel,
  formatMinutesDiff,
  MAX_WORLD_CLOCK_ZONES,
  meetingSlots,
  resolveZone,
  splitZonePaste,
  toZonedInputValue,
  worldClock,
  WORLD_CLOCK_SAMPLE,
  type WorkStatus,
} from "@/lib/tools/timezone-compare";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";
import { cn } from "@/lib/utils";

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

      <WorldClock baseInstant={instant} />
    </div>
  );
}

const WORK_LABEL: Record<WorkStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  working: { label: "Working hours", tone: "success" },
  outside: { label: "Outside hours", tone: "neutral" },
  weekend: { label: "Weekend", tone: "warning" },
};

const hourLabel = (d: Date, zone: string) => toZonedInputValue(d, zone).slice(11, 16);

/**
 * One instant shown in several timezones, compared against the first, with the hours of the
 * day where every zone is inside working hours (weekdays, 09:00–18:00) for picking meeting times.
 */
function WorldClock({ baseInstant }: { baseInstant: Date | null }) {
  const list = useValueList({ max: MAX_WORLD_CLOCK_ZONES });
  const { values, hasInput, reset } = list;
  // null = follow the converter's time above; set once the user edits this card's own input.
  const [localInput, setLocal] = useState<string | null>(null);

  // The time is entered on #1's clock (the first zone that resolves), or UTC until there is one.
  const baseZone = useMemo(() => {
    for (const v of values) {
      const r = v.trim() ? resolveZone(v) : null;
      if (r?.zone) return r.zone;
    }
    return "UTC";
  }, [values]);
  const local = localInput ?? (baseInstant ? toZonedInputValue(baseInstant, baseZone) : "");
  const instant = useMemo(
    () => (localInput !== null ? (localInput ? zonedTimeToInstant(localInput, baseZone) : null) : baseInstant),
    [localInput, baseZone, baseInstant],
  );

  const { rows } = useMemo(() => (instant ? worldClock(instant, values) : { rows: [] }), [instant, values]);
  const slots = useMemo(() => (instant && rows.length ? meetingSlots(instant, baseZone, rows) : []), [instant, baseZone, rows]);
  const shared = slots.filter((s) => s.working.length === rows.length);
  const offsets = rows.map((r) => r.offset);
  const spread = offsets.length ? Math.max(...offsets) - Math.min(...offsets) : 0;

  const report = rows
    .map((r) =>
      [
        `#${r.line} ${r.zone} (${r.abbreviation}, ${formatOffset(r.offset)})`,
        `   ${r.date} ${r.time}`,
        r !== rows[0] ? `   vs #${rows[0].line}: ${formatMinutesDiff(r.diffFromFirst)}, ${dayShiftLabel(r.dayShift)}` : null,
        `   ${WORK_LABEL[r.work].label.toLowerCase()}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .concat(
      shared.length
        ? [`Shared working hours (${baseZone}): ${shared.map((s) => hourLabel(s.start, baseZone)).join(", ")}`]
        : ["No hour of this day is inside working hours in every zone."],
    )
    .join("\n");

  return (
    <Card>
      <CardHeader
        title="Multiple timezones"
        description="One moment shown side by side in several zones. Accepts IANA names, cities (new york), abbreviations (IST, PST) and offsets (UTC+5:30)."
        actions={
          !hasInput ? (
            <Button size="sm" variant="ghost" onClick={() => reset(WORLD_CLOCK_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => reset([])}>
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <Label htmlFor="tz-wc-time" hint={`on #1's clock · ${baseZone}`}>
            Date & time
          </Label>
          <Input id="tz-wc-time" type="datetime-local" step={1} value={local} onChange={(e) => setLocal(e.target.value)} mono />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setLocal(toZonedInputValue(new Date(), baseZone))}>
          Now
        </Button>
        {localInput !== null && baseInstant ? (
          <Button size="sm" variant="ghost" onClick={() => setLocal(null)} title="Follow the converter's time above">
            Use converter time
          </Button>
        ) : null}
      </div>

      <ValueList
        list={list}
        id="tz-wc"
        placeholder="Asia/Kolkata"
        itemLabel="timezone"
        splitPaste={splitZonePaste}
        mono={false}
        status={(value) => {
          const r = resolveZone(value);
          if (r.error !== undefined) return { tone: "error", content: r.error };
          const at = instant ?? baseInstant;
          return {
            tone: "ok",
            content: at ? `${r.zone} · ${zoneAbbreviation(at, r.zone)} · ${formatOffset(offsetMinutes(at, r.zone))}` : r.zone,
          };
        }}
      />

      {instant && rows.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{rows.length} zones</Badge>
            <Badge>Spread {spread ? formatMinutesDiff(spread).slice(1) : "0h"}</Badge>
            {shared.length ? (
              <Badge tone="success">
                {shared.length} shared working {shared.length === 1 ? "hour" : "hours"}
              </Badge>
            ) : (
              <Badge tone="warning">No shared working hours</Badge>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Zone</th>
                  <th className="px-3 py-2 font-medium">Local time</th>
                  <th className="px-3 py-2 font-medium">UTC offset</th>
                  <th className="px-3 py-2 font-medium">vs #{rows[0].line}</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t align-top">
                    <td className="px-3 py-2 text-fg-subtle">{r.line}</td>
                    <td className="px-3 py-2">
                      <div>{r.zone}</div>
                      <div className="text-[11px] text-fg-subtle">{r.abbreviation}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="font-mono text-[13px]">{r.time}</div>
                      <div className="text-[11px] text-fg-subtle">{r.date}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{formatOffset(r.offset)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r === rows[0] ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <>
                          <div>{formatMinutesDiff(r.diffFromFirst)}</div>
                          <div className={cn("text-[11px]", r.dayShift ? "text-warning" : "text-fg-subtle")}>{dayShiftLabel(r.dayShift)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={WORK_LABEL[r.work].tone}>{WORK_LABEL[r.work].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
              Working-hours overlap · hours of {rows[0].date} on #{rows[0].line}&apos;s clock
            </div>
            <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
              {slots.map((s) => {
                const all = s.working.length === rows.length;
                const some = s.working.length > 0;
                return (
                  <div
                    key={s.start.getTime()}
                    title={`${hourLabel(s.start, baseZone)} · ${s.working.length}/${rows.length} zones in working hours${some ? ` (#${s.working.join(", #")})` : ""}`}
                    className={cn(
                      "rounded border py-1 text-center font-mono text-[10px]",
                      all ? "border-transparent bg-success-soft text-success" : some ? "bg-accent-soft text-accent-strong border-transparent" : "bg-bg-elevated text-fg-subtle",
                    )}
                  >
                    {hourLabel(s.start, baseZone).slice(0, 2)}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-fg-subtle">Green: every zone is within 09:00–18:00 on a weekday for that whole hour. Tinted: some are.</p>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {!instant ? "Enter a valid date and time." : rows.length === 1 ? "Add at least one more timezone to compare." : "Enter two or more timezones to see the same moment in each."}
        </p>
      )}
    </Card>
  );
}
