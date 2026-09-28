/**
 * Minimal, dependency-free image metadata reader: container format, colour
 * profile presence, and the most useful EXIF tags from JPEG/TIFF headers.
 */

export interface ExifEntry {
  tag: string;
  value: string;
}

export interface ContainerInfo {
  format: string;
  bitDepth?: number;
  colorType?: string;
  hasAlpha?: boolean;
  iccProfile?: string | null;
  progressive?: boolean;
  animated?: boolean;
}

const EXIF_TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "X resolution",
  0x011b: "Y resolution",
  0x0131: "Software",
  0x0132: "Date/time",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x829a: "Exposure time",
  0x829d: "F-number",
  0x8827: "ISO",
  0x9003: "Date/time original",
  0x9004: "Date/time digitized",
  0x9204: "Exposure bias",
  0x9207: "Metering mode",
  0x9209: "Flash",
  0x920a: "Focal length",
  0xa002: "Pixel X dimension",
  0xa003: "Pixel Y dimension",
  0xa405: "Focal length (35mm)",
  0xa430: "Camera owner",
  0xa431: "Body serial number",
  0xa433: "Lens make",
  0xa434: "Lens model",
  0x0001: "GPS latitude ref",
  0x0002: "GPS latitude",
  0x0003: "GPS longitude ref",
  0x0004: "GPS longitude",
  0x0006: "GPS altitude",
};

const ORIENTATIONS: Record<number, string> = {
  1: "Normal",
  2: "Mirrored horizontally",
  3: "Rotated 180°",
  4: "Mirrored vertically",
  5: "Mirrored + rotated 90° CCW",
  6: "Rotated 90° CW",
  7: "Mirrored + rotated 90° CW",
  8: "Rotated 90° CCW",
};

function readExifIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean, out: ExifEntry[], depth = 0, gps = false) {
  if (depth > 3 || ifdOffset + 2 > view.byteLength) return;
  const count = view.getUint16(tiffStart + ifdOffset, little);
  for (let i = 0; i < count; i++) {
    const entry = tiffStart + ifdOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const num = view.getUint32(entry + 4, little);
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const size = (sizes[type] ?? 1) * num;
    const valueOffset = size > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8;
    if (valueOffset + size > view.byteLength) continue;

    if (tag === 0x8769 || tag === 0x8825) {
      // Sub-IFD pointers (Exif / GPS)
      readExifIfd(view, tiffStart, view.getUint32(entry + 8, little), little, out, depth + 1, tag === 0x8825);
      continue;
    }
    const name = EXIF_TAGS[gps && tag <= 0x6 ? tag : tag];
    if (!name || (!gps && tag <= 0x6)) continue;

    let value = "";
    if (type === 2) {
      const bytes = new Uint8Array(view.buffer, view.byteOffset + valueOffset, Math.max(0, num - 1));
      value = new TextDecoder("latin1").decode(bytes).replace(/\0+$/, "").trim();
    } else if (type === 3) {
      const v = view.getUint16(valueOffset, little);
      value = tag === 0x0112 ? `${ORIENTATIONS[v] ?? v} (${v})` : String(v);
    } else if (type === 4) {
      value = String(view.getUint32(valueOffset, little));
    } else if (type === 5 || type === 10) {
      const parts: string[] = [];
      for (let k = 0; k < Math.min(num, 3); k++) {
        const n = type === 5 ? view.getUint32(valueOffset + k * 8, little) : view.getInt32(valueOffset + k * 8, little);
        const d = type === 5 ? view.getUint32(valueOffset + k * 8 + 4, little) : view.getInt32(valueOffset + k * 8 + 4, little);
        if (!d) continue;
        const r = n / d;
        if (tag === 0x829a && r < 1 && n > 0) parts.push(`1/${Math.round(d / n)} s`);
        else if (tag === 0x829d) parts.push(`f/${r.toFixed(1)}`);
        else if (tag === 0x920a) parts.push(`${r.toFixed(1)} mm`);
        else parts.push(Number.isInteger(r) ? String(r) : r.toFixed(3));
      }
      value = parts.join(", ");
    } else {
      continue;
    }
    if (value) out.push({ tag: name, value });
  }
}

function parseTiff(buf: ArrayBuffer, offset: number): ExifEntry[] {
  const view = new DataView(buf);
  if (offset + 8 > view.byteLength) return [];
  const bom = view.getUint16(offset);
  const little = bom === 0x4949;
  if (!little && bom !== 0x4d4d) return [];
  const ifd0 = view.getUint32(offset + 4, little);
  const out: ExifEntry[] = [];
  try {
    readExifIfd(view, offset, ifd0, little, out);
  } catch {
    // truncated / malformed EXIF: return what we have
  }
  return out;
}

export function readImageMetadata(buf: ArrayBuffer): { container: ContainerInfo; exif: ExifEntry[] } {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const ascii = (start: number, len: number) => String.fromCharCode(...bytes.subarray(start, start + len));

  // ---- PNG
  if (bytes.length > 24 && ascii(1, 3) === "PNG") {
    const bitDepth = bytes[24];
    const ct = bytes[25];
    const colorTypes: Record<number, string> = { 0: "Grayscale", 2: "RGB", 3: "Indexed", 4: "Grayscale + alpha", 6: "RGBA" };
    let icc: string | null = null;
    let animated = false;
    let pos = 8;
    while (pos + 8 <= bytes.length) {
      const len = view.getUint32(pos);
      const type = ascii(pos + 4, 4);
      if (type === "iCCP") {
        // Profile names are at most 79 bytes; never scan past that on malformed chunks.
        const end = bytes.subarray(pos + 8, pos + 8 + 80).indexOf(0);
        icc = end > 0 ? ascii(pos + 8, end) : "present";
      }
      if (type === "acTL") animated = true;
      if (type === "IDAT" || type === "IEND") break;
      pos += 12 + len;
    }
    return {
      container: { format: "PNG", bitDepth, colorType: colorTypes[ct] ?? String(ct), hasAlpha: ct === 4 || ct === 6, iccProfile: icc, animated },
      exif: [],
    };
  }

  // ---- JPEG
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    let icc: string | null = null;
    let exif: ExifEntry[] = [];
    let progressive = false;
    let components: number | undefined;
    while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
      const marker = bytes[pos + 1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = view.getUint16(pos + 2);
      if (marker === 0xe1 && ascii(pos + 4, 4) === "Exif") exif = parseTiff(buf, pos + 10);
      if (marker === 0xe2 && ascii(pos + 4, 11) === "ICC_PROFILE") {
        icc = "present";
        const descStart = pos + 4 + 14 + 128;
        if (descStart < bytes.length) icc = "ICC profile embedded";
      }
      if (marker === 0xc2) progressive = true;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb)) {
        components = bytes[pos + 9];
      }
      pos += 2 + len;
    }
    return {
      container: {
        format: "JPEG",
        bitDepth: 8,
        colorType: components === 1 ? "Grayscale" : components === 3 ? "YCbCr / RGB" : components === 4 ? "CMYK" : undefined,
        hasAlpha: false,
        iccProfile: icc,
        progressive,
      },
      exif,
    };
  }

  // ---- GIF
  if (ascii(0, 3) === "GIF") {
    let frames = 0;
    for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames++;
    return { container: { format: `GIF (${ascii(3, 3)})`, colorType: "Indexed", bitDepth: 8, animated: frames > 1 }, exif: [] };
  }

  // ---- WebP
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    let animated = false;
    let alpha = false;
    let icc: string | null = null;
    if (chunk === "VP8X") {
      const flags = bytes[20];
      icc = flags & 0x20 ? "present" : null;
      alpha = !!(flags & 0x10);
      animated = !!(flags & 0x02);
    }
    return { container: { format: `WebP (${chunk === "VP8L" ? "lossless" : chunk === "VP8 " ? "lossy" : "extended"})`, hasAlpha: alpha || chunk === "VP8L", animated, iccProfile: icc }, exif: [] };
  }

  // ---- SVG
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512));
  if (/<svg[\s>]/i.test(head)) return { container: { format: "SVG (vector)" }, exif: [] };

  // ---- BMP / ICO / AVIF / HEIC / TIFF
  if (ascii(0, 2) === "BM") return { container: { format: "BMP" }, exif: [] };
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return { container: { format: "ICO" }, exif: [] };
  if (ascii(4, 4) === "ftyp") return { container: { format: `ISO-BMFF (${ascii(8, 4).trim()})` }, exif: [] };
  if (ascii(0, 2) === "II" || ascii(0, 2) === "MM") return { container: { format: "TIFF" }, exif: parseTiff(buf, 0) };

  return { container: { format: "Unknown" }, exif: [] };
}

export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function simplifyRatio(w: number, h: number): string {
  if (!w || !h) return "—";
  const g = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w) / g}:${Math.round(h) / g}`;
}
