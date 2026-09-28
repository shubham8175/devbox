"use client";

import { useMemo, useState } from "react";
import { formatDDM, formatDMS, parseCoordinate, validateLat, validateLng } from "@/lib/tools/geo";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const EXAMPLES = [
  { lat: "12°58'12.0\"N", lng: "77°35'42.0\"E" },
  { lat: "-33.8688", lng: "151.2093" },
  { lat: "51 30 26 N", lng: "0 7 39 W" },
  { lat: "40°42.767'N", lng: "74°0.36'W" },
];

export function CoordinatesTool() {
  const [lat, setLat] = useState("12°58'12.0\"N");
  const [lng, setLng] = useState("77°35'42.0\"E");

  const r = useMemo(() => {
    const la = parseCoordinate(lat);
    const lo = parseCoordinate(lng);
    const latError = lat.trim() === "" ? "Enter a latitude." : la === null ? "Could not parse latitude." : validateLat(la);
    const lngError = lng.trim() === "" ? "Enter a longitude." : lo === null ? "Could not parse longitude." : validateLng(lo);
    return { la, lo, latError, lngError };
  }, [lat, lng]);
  const ok = !r.latError && !r.lngError && r.la !== null && r.lo !== null;
  const la = r.la ?? 0;
  const lo = r.lo ?? 0;
  const dec = ok ? `${la.toFixed(6)}, ${lo.toFixed(6)}` : "";

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Input" description="Decimal degrees, DMS or degrees-decimal-minutes, with or without N/S/E/W." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="co-lat">Latitude</Label>
            <Input id="co-lat" mono value={lat} onChange={(e) => setLat(e.target.value)} placeholder={"12°58'12\"N or 12.97"} invalid={!!r.latError} />
            {r.latError ? <p className="mt-1 text-xs text-danger">{r.latError}</p> : null}
          </div>
          <div>
            <Label htmlFor="co-lng">Longitude</Label>
            <Input id="co-lng" mono value={lng} onChange={(e) => setLng(e.target.value)} placeholder={"77°35'42\"E or 77.595"} invalid={!!r.lngError} />
            {r.lngError ? <p className="mt-1 text-xs text-danger">{r.lngError}</p> : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.lat}
              type="button"
              onClick={() => {
                setLat(ex.lat);
                setLng(ex.lng);
              }}
              className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
            >
              {ex.lat} {ex.lng}
            </button>
          ))}
        </div>
        {!ok && !r.latError && !r.lngError ? <Alert tone="danger" className="mt-3">Invalid coordinates.</Alert> : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader
          title="Formats"
          actions={
            ok ? (
              <>
                <Badge tone="success">Valid</Badge>
                <CopyButton value={dec} label="Copy decimal" variant="primary" />
              </>
            ) : null
          }
        />
        <OutputGrid>
          <OutputRow label="Decimal degrees" value={dec} />
          <OutputRow label="DMS" value={ok ? `${formatDMS(la, "lat")} ${formatDMS(lo, "lng")}` : ""} />
          <OutputRow label="Degrees decimal minutes" value={ok ? `${formatDDM(la, "lat")} ${formatDDM(lo, "lng")}` : ""} />
          <OutputRow label="Signed DMS" value={ok ? `${la < 0 ? "-" : ""}${formatDMS(la, "lat").slice(0, -1)} ${lo < 0 ? "-" : ""}${formatDMS(lo, "lng").slice(0, -1)}` : ""} />
          <OutputRow label="Google Maps URL" value={ok ? `https://www.google.com/maps?q=${la.toFixed(6)},${lo.toFixed(6)}` : ""} />
          <OutputRow label="geo: URI" value={ok ? `geo:${la.toFixed(6)},${lo.toFixed(6)}` : ""} />
          <OutputRow label="GeoJSON [lng, lat]" value={ok ? `[${lo.toFixed(6)}, ${la.toFixed(6)}]` : ""} />
          <OutputRow label="Hemisphere" value={ok ? `${la >= 0 ? "Northern" : "Southern"} · ${lo >= 0 ? "Eastern" : "Western"}` : ""} mono={false} copyable={false} />
        </OutputGrid>
      </Card>
    </div>
  );
}
