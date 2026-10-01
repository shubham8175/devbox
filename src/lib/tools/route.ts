import { haversineKm, initialBearing, parseLatLng, type LatLng } from "@/lib/tools/geo";

/**
 * Multi-point routes for the Coordinate Distance tool: legs between consecutive
 * points, running totals and the farthest-apart pair. Distances are great-circle
 * (haversine) in km; the UI converts to the chosen unit.
 */

export type DistanceUnit = "km" | "mi" | "nmi" | "m";

/** Kilometres per unit. */
export const UNIT_KM: Record<DistanceUnit, number> = { km: 1, mi: 1.609344, nmi: 1.852, m: 0.001 };

export const UNIT_LABEL: Record<DistanceUnit, string> = { km: "km", mi: "mi", nmi: "nmi", m: "m" };

export const fromKm = (km: number, unit: DistanceUnit) => km / UNIT_KM[unit];

/** Upper bound on points, so a huge paste can't render thousands of legs. */
export const MAX_ROUTE_POINTS = 50;

export const ROUTE_SAMPLE = [
  "19.0760, 72.8777", // Mumbai
  "18.5204, 73.8567", // Pune
  "12.9716, 77.5946", // Bengaluru
  "13.0827, 80.2707", // Chennai
];

export type ParsedPoint = { point: LatLng; error?: undefined } | { point: null; error: string };

/** Parse one "lat, lng" field, decimal or DMS/DDM (via parseLatLng). */
export function parsePoint(raw: string): ParsedPoint {
  const s = raw.trim();
  if (!s) return { point: null, error: "Empty." };
  const point = parseLatLng(s);
  if (point) return { point };
  return { point: null, error: 'Not a coordinate pair. Use "lat, lng", e.g. 19.076, 72.8777 or 19°4\'34"N 72°52\'40"E (lat −90…90, lng −180…180).' };
}

/** Pasted lists: one point per line or per ";" (commas live inside a point, so they never split). */
export function splitPoints(raw: string): string[] {
  return raw
    .split(/[\n\r;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RoutePoint {
  /** Field number (1-based), so labels match the input boxes even when some are empty or invalid. */
  line: number;
  input: string;
  point: LatLng;
}

export interface RouteLeg {
  from: RoutePoint;
  to: RoutePoint;
  km: number;
  /** Initial bearing from → to in degrees; null when the two points coincide. */
  bearing: number | null;
  /** Distance travelled from the first point up to the end of this leg. */
  cumulativeKm: number;
}

export interface RouteResult {
  points: RoutePoint[];
  errors: Array<{ line: number; input: string; error: string }>;
  legs: RouteLeg[];
  summary: {
    totalKm: number;
    /** Straight-line distance first → last valid point. */
    directKm: number;
    /** Total ÷ direct (1 = perfectly straight); null when first and last coincide. */
    detour: number | null;
    farthest: { a: RoutePoint; b: RoutePoint; km: number };
    longestLeg: RouteLeg;
  } | null;
}

/** Parse every field (skipping empty ones) and compute legs between consecutive valid points. */
export function computeRoute(values: string[]): RouteResult {
  const points: RoutePoint[] = [];
  const errors: RouteResult["errors"] = [];
  values.forEach((raw, i) => {
    const input = raw.trim();
    if (!input) return;
    const p = parsePoint(input);
    if (p.point) points.push({ line: i + 1, input, point: p.point });
    else errors.push({ line: i + 1, input, error: p.error });
  });

  const legs: RouteLeg[] = [];
  let cumulativeKm = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const km = haversineKm(from.point, to.point);
    cumulativeKm += km;
    legs.push({ from, to, km, bearing: km > 0 ? initialBearing(from.point, to.point) : null, cumulativeKm });
  }

  if (points.length < 2) return { points, errors, legs, summary: null };

  // O(n²) over at most MAX_ROUTE_POINTS points — trivial.
  let farthest = { a: points[0], b: points[1], km: -1 };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const km = haversineKm(points[i].point, points[j].point);
      if (km > farthest.km) farthest = { a: points[i], b: points[j], km };
    }
  }

  const directKm = haversineKm(points[0].point, points[points.length - 1].point);
  const longestLeg = legs.reduce((best, l) => (l.km > best.km ? l : best), legs[0]);
  return {
    points,
    errors,
    legs,
    summary: { totalKm: cumulativeKm, directKm, detour: directKm > 0 ? cumulativeKm / directKm : null, farthest, longestLeg },
  };
}
