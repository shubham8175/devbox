import { parseColor } from "@/lib/tools/color";

export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  /** 0..1 */
  opacity: number;
  inset: boolean;
}

export function layerValue(l: ShadowLayer): string {
  const rgb = parseColor(l.color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const a = Math.round(Math.min(1, Math.max(0, l.opacity)) * 100) / 100;
  const color = a >= 1 ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  return `${l.inset ? "inset " : ""}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${color}`;
}

export function boxShadowValue(layers: ShadowLayer[]): string {
  return layers.length ? layers.map(layerValue).join(",\n  ") : "none";
}

export function boxShadowCss(layers: ShadowLayer[]): string {
  return `box-shadow: ${boxShadowValue(layers)};`;
}

export const SHADOW_PRESETS: Array<{ name: string; layers: ShadowLayer[] }> = [
  { name: "Soft", layers: [{ x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.15, inset: false }] },
  {
    name: "Elevated",
    layers: [
      { x: 0, y: 1, blur: 2, spread: 0, color: "#000000", opacity: 0.12, inset: false },
      { x: 0, y: 8, blur: 24, spread: -4, color: "#000000", opacity: 0.25, inset: false },
    ],
  },
  { name: "Hard", layers: [{ x: 6, y: 6, blur: 0, spread: 0, color: "#000000", opacity: 1, inset: false }] },
  { name: "Inner", layers: [{ x: 0, y: 2, blur: 8, spread: 0, color: "#000000", opacity: 0.35, inset: true }] },
  { name: "Glow", layers: [{ x: 0, y: 0, blur: 24, spread: 2, color: "#7c8cff", opacity: 0.5, inset: false }] },
];
