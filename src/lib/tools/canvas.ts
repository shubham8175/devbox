/** Shared browser-side image helpers for the compress / resize / convert / icon tools. */

export type OutputFormat = "image/png" | "image/jpeg" | "image/webp";

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

export const FORMAT_EXT: Record<OutputFormat, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Megapixel limit above which we warn; browsers start to struggle. */
export const LARGE_IMAGE_MP = 40;

/* ---------- Hard limits: everything is decoded on the main thread of the user's browser ---------- */

/** Largest image file we will attempt to decode. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Largest source image (in megapixels) we will decode or draw. */
export const MAX_IMAGE_MP = 50;
/** Largest source side length. */
export const MAX_IMAGE_SIDE = 16384;
/** Largest canvas we will allocate for an output image. */
export const MAX_OUTPUT_SIDE = 8192;
export const MAX_OUTPUT_MP = 50;

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Returns a friendly error when the file is too large to decode safely, else null. */
export function checkImageFile(file: File, maxBytes = MAX_IMAGE_BYTES): string | null {
  if (file.size > maxBytes) return `This file is ${formatMB(file.size)}; the limit is ${formatMB(maxBytes)} so the browser does not run out of memory.`;
  return null;
}

/** Returns a friendly error when the dimensions are unusable or too large, else null. */
export function checkImageDimensions(width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return "This image has no usable dimensions (an SVG without width/height, or a corrupt file).";
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) return `This image is ${width}×${height}; the limit is ${MAX_IMAGE_SIDE} px per side.`;
  if (megapixels(width, height) > MAX_IMAGE_MP) return `This image is ${megapixels(width, height).toFixed(0)} MP; the limit is ${MAX_IMAGE_MP} MP.`;
  return null;
}

/** Returns a friendly error when an output canvas would be too large, else null. */
export function checkOutputSize(width: number, height: number): string | null {
  if (!(width >= 1 && height >= 1)) return "Output size must be at least 1×1.";
  if (width > MAX_OUTPUT_SIDE || height > MAX_OUTPUT_SIDE) return `Output is limited to ${MAX_OUTPUT_SIDE} px per side.`;
  if (megapixels(width, height) > MAX_OUTPUT_MP) return `Output is limited to ${MAX_OUTPUT_MP} megapixels.`;
  return null;
}

/**
 * Read width/height from the container header of PNG, JPEG, GIF, BMP and WebP
 * files without decoding pixels, so oversized images are rejected before the
 * browser allocates a bitmap. Returns null when the format is not recognised.
 */
export function readImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  const ascii = (s: number, len: number) => (s + len <= n ? String.fromCharCode(...bytes.subarray(s, s + len)) : "");
  try {
    // PNG: IHDR is always the first chunk
    if (n >= 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") return { width: dv.getUint32(16), height: dv.getUint32(20) };
    // GIF: logical screen descriptor
    if (n >= 10 && ascii(0, 3) === "GIF") return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    // BMP: BITMAPINFOHEADER (height may be negative for top-down bitmaps)
    if (n >= 26 && ascii(0, 2) === "BM") return { width: Math.abs(dv.getInt32(18, true)), height: Math.abs(dv.getInt32(22, true)) };
    // WebP
    if (n >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      const chunk = ascii(12, 4);
      if (chunk === "VP8X") return { width: 1 + (dv.getUint32(24, true) & 0xffffff), height: 1 + (dv.getUint32(27, true) & 0xffffff) };
      if (chunk === "VP8L") {
        const b = dv.getUint32(21, true);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >>> 14) & 0x3fff) };
      }
      if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      return null;
    }
    // JPEG: walk markers to the first SOF
    if (n >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let pos = 2;
      while (pos + 9 < n) {
        if (bytes[pos] !== 0xff) {
          pos++;
          continue;
        }
        const marker = bytes[pos + 1];
        if (marker === 0xff) {
          pos++;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          pos += 2;
          continue;
        }
        const len = dv.getUint16(pos + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { height: dv.getUint16(pos + 5), width: dv.getUint16(pos + 7) };
        if (marker === 0xda) break; // start of scan without SOF
        pos += 2 + len;
      }
    }
  } catch {
    // truncated header; fall through
  }
  return null;
}

/** Make a user-supplied file name safe for the download attribute. */
export function safeFileName(name: string, fallback = "image"): string {
  const cleaned = name
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

let webpSupport: boolean | null = null;

/** Feature-detect WebP encoding support (cached). */
export function canEncodeWebP(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/** Detect the real container format from magic bytes; falls back to the MIME type. */
export function detectFormat(bytes: Uint8Array, fallbackMime: string): string {
  const ascii = (s: number, n: number) => String.fromCharCode(...bytes.subarray(s, s + n));
  if (bytes.length > 8 && ascii(1, 3) === "PNG") return "PNG";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG";
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "WebP";
  if (ascii(0, 3) === "GIF") return "GIF";
  if (ascii(0, 2) === "BM") return "BMP";
  if (bytes.length > 12 && ascii(4, 4) === "ftyp") return ascii(8, 4).trim().toUpperCase();
  if (/<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 512)))) return "SVG";
  if (fallbackMime.startsWith("image/")) return fallbackMime.slice(6).toUpperCase();
  return "Unknown";
}

/**
 * Decode a File to something drawable, preferring the async ImageBitmap path.
 * Enforces the size / dimension limits above and never leaves a bitmap or
 * object URL behind when it rejects.
 */
export async function decodeImage(file: File): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; release: () => void }> {
  const sizeError = checkImageFile(file);
  if (sizeError) throw new Error(sizeError);

  // Cheap header check before any pixel memory is allocated.
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const dims = readImageDimensions(head);
  if (dims) {
    const dimError = checkImageDimensions(dims.width, dims.height);
    if (dimError) throw new Error(dimError);
  }

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimError = checkImageDimensions(bitmap.width, bitmap.height);
      if (dimError) {
        bitmap.close();
        throw new Error(dimError);
      }
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("This image")) throw e;
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be decoded as an image."));
    };
    el.src = url;
  });
  const dimError = checkImageDimensions(img.naturalWidth, img.naturalHeight);
  if (dimError) {
    URL.revokeObjectURL(url);
    throw new Error(dimError);
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

export interface RenderOptions {
  width: number;
  height: number;
  format: OutputFormat;
  /** 0..1, only for lossy formats */
  quality?: number;
  /** Fill colour used when the target format has no alpha (JPEG) */
  background?: string;
  /** Crop rectangle in source pixels (defaults to the whole image) */
  crop?: { x: number; y: number; w: number; h: number };
}

/**
 * Draw the source onto a canvas of the requested size and encode it.
 * Uses stepped downscaling when shrinking by more than 2× for better quality.
 */
export async function renderImage(source: ImageBitmap | HTMLImageElement, srcW: number, srcH: number, opts: RenderOptions): Promise<Blob> {
  const crop = opts.crop ?? { x: 0, y: 0, w: srcW, h: srcH };
  const targetW = Math.max(1, Math.round(opts.width));
  const targetH = Math.max(1, Math.round(opts.height));
  const sizeError = checkOutputSize(targetW, targetH);
  if (sizeError) throw new Error(sizeError);

  let current: CanvasImageSource = source;
  let curW = crop.w;
  let curH = crop.h;
  let cropX = crop.x;
  let cropY = crop.y;

  // Stepped downscale: halve until within 2× of the target.
  while (curW / 2 > targetW && curH / 2 > targetH) {
    const stepW = Math.max(targetW, Math.round(curW / 2));
    const stepH = Math.max(targetH, Math.round(curH / 2));
    const step = document.createElement("canvas");
    step.width = stepW;
    step.height = stepH;
    const sctx = step.getContext("2d");
    if (!sctx) throw new Error("Canvas 2D is unavailable.");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(current, cropX, cropY, curW, curH, 0, 0, stepW, stepH);
    current = step;
    curW = stepW;
    curH = stepH;
    cropX = 0;
    cropY = 0;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  if (opts.format === "image/jpeg" || opts.background) {
    if (opts.format === "image/jpeg") {
      ctx.fillStyle = opts.background ?? "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, targetW, targetH);
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, cropX, cropY, curW, curH, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, opts.format, opts.format === "image/png" ? undefined : opts.quality ?? 0.85),
  );
  if (!blob) throw new Error("The browser could not encode this image.");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = safeFileName(filename, "download");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function savedPercent(original: number, next: number): number {
  if (!original) return 0;
  return ((original - next) / original) * 100;
}

export function megapixels(w: number, h: number): number {
  return (w * h) / 1_000_000;
}
