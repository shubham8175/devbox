export interface LatLng {
  lat: number;
  lng: number;
}

export const EARTH_RADIUS_KM = 6371.0088;

export function validateLat(lat: number): string | null {
  if (!Number.isFinite(lat)) return "Latitude must be a number.";
  if (lat < -90 || lat > 90) return "Latitude must be between -90 and 90.";
  return null;
}
export function validateLng(lng: number): string | null {
  if (!Number.isFinite(lng)) return "Longitude must be a number.";
  if (lng < -180 || lng > 180) return "Longitude must be between -180 and 180.";
  return null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in kilometres using the haversine formula. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees (0..360). */
export function initialBearing(a: LatLng, b: LatLng): number {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const λ1 = rad(a.lng);
  const Δλ = rad(b.lng - a.lng);
  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);
  const φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2));
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  return { lat: deg(φ3), lng: ((deg(λ3) + 540) % 360) - 180 };
}

export function compassPoint(bearing: number): string {
  const pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return pts[Math.round(bearing / 22.5) % 16];
}

export const DISTANCE_EXAMPLES: Array<{ label: string; a: LatLng; b: LatLng }> = [
  { label: "Delhi ↔ Riyadh", a: { lat: 28.6139, lng: 77.209 }, b: { lat: 24.7136, lng: 46.6753 } },
  { label: "London ↔ New York", a: { lat: 51.5074, lng: -0.1278 }, b: { lat: 40.7128, lng: -74.006 } },
  { label: "Mumbai ↔ Bengaluru", a: { lat: 19.076, lng: 72.8777 }, b: { lat: 12.9716, lng: 77.5946 } },
];

// ---------- Coordinate formats ----------

export interface DMS {
  degrees: number;
  minutes: number;
  seconds: number;
  hemisphere: string;
}

export function toDMS(value: number, axis: "lat" | "lng"): DMS {
  const abs = Math.abs(value);
  let degrees = Math.floor(abs);
  let minutes = Math.floor((abs - degrees) * 60);
  let seconds = Math.round(((abs - degrees) * 60 - minutes) * 60 * 100) / 100;
  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes -= 60;
    degrees += 1;
  }
  const hemisphere = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return { degrees, minutes, seconds, hemisphere };
}

export function formatDMS(value: number, axis: "lat" | "lng"): string {
  const d = toDMS(value, axis);
  return `${d.degrees}°${d.minutes}'${d.seconds.toFixed(2)}"${d.hemisphere}`;
}

export function formatDDM(value: number, axis: "lat" | "lng"): string {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const hemisphere = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${degrees}°${minutes.toFixed(4)}'${hemisphere}`;
}

/**
 * Parse a single coordinate component in decimal ("-12.97", "12.97 S") or
 * DMS/DDM form ("12°58'12.0\"N", "12 58 12 N", "12°58.2'N"). Returns null if unparseable.
 */
export function parseCoordinate(raw: string): number | null {
  let s = raw.trim().toUpperCase();
  if (!s) return null;
  let sign = 1;
  const hemi = /([NSEW])/.exec(s);
  if (hemi) {
    if (hemi[1] === "S" || hemi[1] === "W") sign = -1;
    s = s.replace(/[NSEW]/g, " ");
  }
  s = s.replace(/[°º'′’"″”]/g, " ").replace(/,/g, " ").trim();
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) s = s.slice(1).trim();
  const nums = s.split(/\s+/).filter(Boolean).map(Number);
  if (!nums.length || nums.length > 3 || nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [d, m = 0, sec = 0] = nums;
  if (nums.length > 1 && (m >= 60 || sec >= 60)) return null;
  return sign * (d + m / 60 + sec / 3600);
}

/** Parse a "lat, lng" pair in any supported notation. */
export function parseLatLng(raw: string): LatLng | null {
  const s = raw.trim();
  if (!s) return null;
  // Split on comma if present, otherwise on the hemisphere letters, otherwise on whitespace midpoint
  let parts: string[];
  if (s.includes(",")) parts = s.split(",");
  else {
    const m = /^(.*?[NS])\s*(.*?[EW])$/i.exec(s);
    if (m) parts = [m[1], m[2]];
    else {
      const tokens = s.split(/\s+/);
      if (tokens.length === 2) parts = tokens;
      else if (tokens.length === 6) parts = [tokens.slice(0, 3).join(" "), tokens.slice(3).join(" ")];
      else if (tokens.length === 4) parts = [tokens.slice(0, 2).join(" "), tokens.slice(2).join(" ")];
      else return null;
    }
  }
  if (parts.length !== 2) return null;
  const lat = parseCoordinate(parts[0]);
  const lng = parseCoordinate(parts[1]);
  if (lat === null || lng === null) return null;
  if (validateLat(lat) || validateLng(lng)) return null;
  return { lat, lng };
}
