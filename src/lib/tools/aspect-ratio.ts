import { gcd } from "@/lib/tools/image-metadata";

export const COMMON_RATIOS: Array<{ label: string; w: number; h: number; note: string }> = [
  { label: "1:1", w: 1, h: 1, note: "Square — avatars, Instagram posts" },
  { label: "4:3", w: 4, h: 3, note: "Classic TV, iPad, older monitors" },
  { label: "3:2", w: 3, h: 2, note: "35mm photo, many DSLRs" },
  { label: "16:10", w: 16, h: 10, note: "MacBook & many laptop displays" },
  { label: "16:9", w: 16, h: 9, note: "HD video, YouTube, most monitors" },
  { label: "21:9", w: 21, h: 9, note: "Ultrawide monitors, cinematic" },
  { label: "9:16", w: 9, h: 16, note: "Vertical video — Stories, Reels, Shorts" },
  { label: "3:4", w: 3, h: 4, note: "Portrait photo" },
  { label: "2:3", w: 2, h: 3, note: "Portrait 35mm, posters" },
  { label: "5:4", w: 5, h: 4, note: "Large-format photo, 1280×1024" },
  { label: "1.91:1", w: 1.91, h: 1, note: "Open Graph / social link previews" },
  { label: "2.39:1", w: 2.39, h: 1, note: "Anamorphic widescreen film" },
];

export interface RatioResult {
  simplified: string;
  decimal: number;
  match: (typeof COMMON_RATIOS)[number] | null;
  matchExact: boolean;
  orientation: "landscape" | "portrait" | "square";
}

export function analyzeRatio(w: number, h: number): RatioResult | null {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const decimal = w / h;
  const g = gcd(Math.round(w), Math.round(h));
  const simplified = Number.isInteger(w) && Number.isInteger(h) ? `${w / g}:${h / g}` : `${decimal.toFixed(3)}:1`;
  let best: RatioResult["match"] = null;
  let bestDiff = Infinity;
  for (const r of COMMON_RATIOS) {
    const diff = Math.abs(r.w / r.h - decimal) / decimal;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  const match = bestDiff <= 0.02 ? best : null;
  return {
    simplified,
    decimal,
    match,
    matchExact: bestDiff < 0.0005,
    orientation: decimal > 1.001 ? "landscape" : decimal < 0.999 ? "portrait" : "square",
  };
}

/** Given a ratio and one side, compute the other side. */
export function scaleToWidth(w: number, h: number, newWidth: number): number {
  return Math.round((newWidth * h) / w);
}
export function scaleToHeight(w: number, h: number, newHeight: number): number {
  return Math.round((newHeight * w) / h);
}

export const PRESET_SIZES: Array<{ label: string; w: number; h: number }> = [
  { label: "HD 720p", w: 1280, h: 720 },
  { label: "Full HD", w: 1920, h: 1080 },
  { label: "QHD", w: 2560, h: 1440 },
  { label: "4K UHD", w: 3840, h: 2160 },
  { label: "Instagram post", w: 1080, h: 1080 },
  { label: "Story / Reel", w: 1080, h: 1920 },
  { label: "Open Graph", w: 1200, h: 630 },
  { label: "iPhone 15", w: 1179, h: 2556 },
];
