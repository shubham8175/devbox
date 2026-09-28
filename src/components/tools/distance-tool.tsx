"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { compassPoint, DISTANCE_EXAMPLES, formatDMS, haversineKm, initialBearing, midpoint, validateLat, validateLng } from "@/lib/tools/geo";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

interface PointInput {
  lat: string;
  lng: string;
}

const fmt = (n: number, d = 3) => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function DistanceTool() {
  const [a, setA] = useState<PointInput>({ lat: "28.6139", lng: "77.2090" });
  const [b, setB] = useState<PointInput>({ lat: "24.7136", lng: "46.6753" });

  const parsed = useMemo(() => {
    const pa = { lat: Number(a.lat), lng: Number(a.lng) };
    const pb = { lat: Number(b.lat), lng: Number(b.lng) };
    const errors = [
      a.lat.trim() === "" ? "Point A latitude is required." : validateLat(pa.lat),
      a.lng.trim() === "" ? "Point A longitude is required." : validateLng(pa.lng),
      b.lat.trim() === "" ? "Point B latitude is required." : validateLat(pb.lat),
      b.lng.trim() === "" ? "Point B longitude is required." : validateLng(pb.lng),
    ].filter((e): e is string => !!e);
    if (errors.length) return { errors, result: null };
    const km = haversineKm(pa, pb);
    return {
      errors: [],
      result: { km, m: km * 1000, mi: km / 1.609344, nmi: km / 1.852, bearing: initialBearing(pa, pb), mid: midpoint(pa, pb) },
    };
  }, [a, b]);

  const point = (label: string, v: PointInput, set: (p: PointInput) => void) => (
    <div>
      <div className="mb-1.5 text-xs font-medium text-fg-muted">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`${label}-lat`}>Latitude</Label>
          <Input id={`${label}-lat`} mono type="number" step="any" value={v.lat} onChange={(e) => set({ ...v, lat: e.target.value })} placeholder="-90 … 90" />
        </div>
        <div>
          <Label htmlFor={`${label}-lng`}>Longitude</Label>
          <Input id={`${label}-lng`} mono type="number" step="any" value={v.lng} onChange={(e) => set({ ...v, lng: e.target.value })} placeholder="-180 … 180" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Points"
          description="Decimal degrees. Great-circle distance via the haversine formula (mean Earth radius 6371.0088 km)."
          actions={
            <Button
              size="sm"
              onClick={() => {
                setA(b);
                setB(a);
              }}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {point("Point A", a, setA)}
          {point("Point B", b, setB)}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DISTANCE_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setA({ lat: String(ex.a.lat), lng: String(ex.a.lng) });
                setB({ lat: String(ex.b.lat), lng: String(ex.b.lng) });
              }}
              className="rounded-md border bg-bg-elevated px-2 py-0.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
            >
              {ex.label}
            </button>
          ))}
        </div>
        {parsed.errors.length ? (
          <Alert tone="danger" className="mt-3">
            {parsed.errors[0]}
          </Alert>
        ) : null}
      </Card>

      {parsed.result ? (
        <Card className="shadow-card">
          <CardHeader
            title="Distance"
            actions={<CopyButton value={`${fmt(parsed.result.km)} km · ${fmt(parsed.result.mi)} mi`} label="Copy" />}
          />
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-accent-strong/80">Great-circle distance</div>
            <div className="mt-0.5 font-mono text-2xl font-semibold">{fmt(parsed.result.km)} km</div>
          </div>
          <OutputGrid>
            <OutputRow label="Kilometres" value={fmt(parsed.result.km)} />
            <OutputRow label="Metres" value={fmt(parsed.result.m, 0)} />
            <OutputRow label="Miles" value={fmt(parsed.result.mi)} />
            <OutputRow label="Nautical miles" value={fmt(parsed.result.nmi)} />
            <OutputRow label="Initial bearing A → B" value={`${fmt(parsed.result.bearing, 2)}° (${compassPoint(parsed.result.bearing)})`} />
            <OutputRow label="Midpoint" value={`${parsed.result.mid.lat.toFixed(6)}, ${parsed.result.mid.lng.toFixed(6)}`} hint={`${formatDMS(parsed.result.mid.lat, "lat")} ${formatDMS(parsed.result.mid.lng, "lng")}`} />
          </OutputGrid>
          <p className="mt-3 text-[11px] text-fg-subtle">Haversine assumes a sphere; real ellipsoidal distances can differ by up to ~0.5%.</p>
        </Card>
      ) : null}
    </div>
  );
}
