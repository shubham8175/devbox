"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Eraser } from "lucide-react";
import { compassPoint, DISTANCE_EXAMPLES, formatDMS, haversineKm, initialBearing, midpoint, validateLat, validateLng } from "@/lib/tools/geo";
import { computeRoute, fromKm, MAX_ROUTE_POINTS, parsePoint, ROUTE_SAMPLE, splitPoints, UNIT_LABEL, type DistanceUnit, type RoutePoint } from "@/lib/tools/route";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";

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

      <RouteCard />
    </div>
  );
}

const UNIT_OPTIONS: Array<{ value: DistanceUnit; label: string }> = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
  { value: "nmi", label: "nmi" },
];

const pointLabel = (p: RoutePoint) => `#${p.line}`;
const latLng = (p: RoutePoint) => `${p.point.lat.toFixed(6)}, ${p.point.lng.toFixed(6)}`;

/** One box per point: legs between consecutive points, running total and the farthest-apart pair. */
function RouteCard() {
  const list = useValueList({ max: MAX_ROUTE_POINTS });
  const { values, hasInput, reset } = list;
  const [unit, setUnit] = useState<DistanceUnit>("km");
  const { legs, points, summary } = useMemo(() => computeRoute(values), [values]);
  const d = (km: number) => `${fmt(fromKm(km, unit))} ${UNIT_LABEL[unit]}`;
  const bearing = (b: number | null) => (b === null ? "—" : `${fmt(b, 1)}° ${compassPoint(b)}`);

  const report = summary
    ? [
        ...points.map((p) => `#${p.line} ${latLng(p)}`),
        "",
        ...legs.map((l) => `${pointLabel(l.from)} → ${pointLabel(l.to)}: ${d(l.km)}, bearing ${bearing(l.bearing)}, cumulative ${d(l.cumulativeKm)}`),
        "",
        `Total route: ${d(summary.totalKm)}`,
        `Straight line ${pointLabel(points[0])} → ${pointLabel(points[points.length - 1])}: ${d(summary.directKm)}`,
        `Farthest apart: ${pointLabel(summary.farthest.a)} ↔ ${pointLabel(summary.farthest.b)}, ${d(summary.farthest.km)}`,
      ].join("\n")
    : "";

  return (
    <Card className="shadow-card">
      <CardHeader
        title="Route / multiple points"
        description='One point per box as "lat, lng" (decimal or DMS). Legs are measured between consecutive points.'
        actions={
          <div className="flex items-center gap-2">
            <Segmented size="sm" value={unit} onChange={setUnit} options={UNIT_OPTIONS} />
            {!hasInput ? (
              <Button size="sm" variant="ghost" onClick={() => reset(ROUTE_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => reset([])}>
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        }
      />

      <ValueList
        list={list}
        id="route-point"
        itemLabel="point"
        placeholder="19.0760, 72.8777"
        splitPaste={splitPoints}
        status={(value) => {
          const p = parsePoint(value);
          return p.point
            ? { tone: "ok", content: <span className="font-mono">{`${p.point.lat.toFixed(6)}, ${p.point.lng.toFixed(6)} · ${formatDMS(p.point.lat, "lat")} ${formatDMS(p.point.lng, "lng")}`}</span> }
            : { tone: "error", content: p.error };
        }}
      />

      {summary ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Total {d(summary.totalKm)}</Badge>
            <Badge>{legs.length} {legs.length === 1 ? "leg" : "legs"}</Badge>
            {summary.detour !== null && legs.length > 1 ? <Badge>{fmt(summary.detour, 2)}× the straight line</Badge> : null}
          </div>

          <OutputGrid>
            <OutputRow label="Total route length" value={d(summary.totalKm)} hint={`${fmt(summary.totalKm)} km · ${fmt(fromKm(summary.totalKm, "mi"))} mi`} />
            <OutputRow
              label={`Straight line ${pointLabel(points[0])} → ${pointLabel(points[points.length - 1])}`}
              value={d(summary.directKm)}
              hint={summary.directKm > 0 ? `Initial bearing ${bearing(initialBearing(points[0].point, points[points.length - 1].point))}` : "Route ends where it starts"}
            />
            <OutputRow
              label={`Farthest apart · ${pointLabel(summary.farthest.a)} ↔ ${pointLabel(summary.farthest.b)}`}
              value={d(summary.farthest.km)}
              hint={`${latLng(summary.farthest.a)} ↔ ${latLng(summary.farthest.b)}`}
            />
            <OutputRow
              label={`Longest leg · ${pointLabel(summary.longestLeg.from)} → ${pointLabel(summary.longestLeg.to)}`}
              value={d(summary.longestLeg.km)}
            />
          </OutputGrid>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Leg</th>
                  <th className="px-3 py-2 font-medium">Distance</th>
                  <th className="px-3 py-2 font-medium">Initial bearing</th>
                  <th className="px-3 py-2 font-medium">Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={`${l.from.line}-${l.to.line}`} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-fg-muted">
                      {pointLabel(l.from)} → {pointLabel(l.to)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{d(l.km)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{bearing(l.bearing)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-fg-muted">{d(l.cumulativeKm)}</td>
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
          {points.length === 1 ? "Add at least one more point to measure a route." : "Enter two or more points to see each leg and the total route length."}
        </p>
      )}
    </Card>
  );
}
