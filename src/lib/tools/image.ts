import { rgbToHex, rgbToHsl, type RGBA } from "@/lib/tools/color";
import { checkImageDimensions, checkImageFile, readImageDimensions } from "@/lib/tools/canvas";

export interface LoadedImage {
  /** Object URL for previewing. Revoke with URL.revokeObjectURL when done. */
  url: string;
  width: number;
  height: number;
  file: File;
  bitmap: HTMLImageElement;
}

/** Decode an image File entirely in the browser, enforcing the shared size limits. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const sizeError = checkImageFile(file);
  if (sizeError) throw new Error(sizeError);
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const dims = readImageDimensions(head);
  if (dims) {
    const dimError = checkImageDimensions(dims.width, dims.height);
    if (dimError) throw new Error(dimError);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dimError = checkImageDimensions(img.naturalWidth, img.naturalHeight);
      if (dimError) {
        URL.revokeObjectURL(url);
        reject(new Error(dimError));
        return;
      }
      resolve({ url, width: img.naturalWidth, height: img.naturalHeight, file, bitmap: img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be decoded as an image."));
    };
    img.src = url;
  });
}

/** Draw an image to a canvas (optionally downscaled) and return its pixel data. */
export function imageDataFrom(img: HTMLImageElement, maxSide = 0): ImageData {
  let { naturalWidth: w, naturalHeight: h } = img;
  if (maxSide > 0 && Math.max(w, h) > maxSide) {
    const scale = maxSide / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export interface PaletteColor {
  hex: string;
  rgb: RGBA;
  /** Share of sampled pixels, 0..1 */
  share: number;
}

/**
 * Extract dominant colours by quantising to a 4-bit-per-channel histogram
 * and then merging near-duplicates so the palette reads as distinct hues.
 */
export function extractPalette(data: ImageData, count = 5): { dominant: PaletteColor | null; top: PaletteColor[]; palette: PaletteColor[] } {
  const { data: px } = data;
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a < 128) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
    total++;
  }
  if (!total) return { dominant: null, top: [], palette: [] };

  const sorted = Array.from(buckets.values())
    .map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }))
    .sort((a, b) => b.n - a.n);

  const toColor = (c: { r: number; g: number; b: number; n: number }): PaletteColor => {
    const rgb = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b), a: 1 };
    return { hex: rgbToHex(rgb), rgb, share: c.n / total };
  };

  const top = sorted.slice(0, count).map(toColor);

  // Distinct palette: greedily pick colours that differ enough from those already chosen.
  const palette: PaletteColor[] = [];
  const dist = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  for (const c of sorted) {
    if (palette.length >= 8) break;
    if (c.n / total < 0.002) break;
    if (palette.every((p) => dist(p.rgb, c) > 48)) palette.push(toColor(c));
  }

  return { dominant: top[0] ?? null, top, palette };
}

export function describePixel(rgb: RGBA) {
  const hsl = rgbToHsl(rgb);
  return {
    hex: rgbToHex(rgb),
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
