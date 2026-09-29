export type TextEncodingId = "utf-8" | "utf-16le" | "latin1";
export type OffsetBase = "hex" | "dec";
export type HexGroup = 1 | 2 | 4;

export interface HexDumpOptions {
  bytesPerRow?: 8 | 16 | 32;
  offsetBase?: OffsetBase;
  uppercase?: boolean;
  group?: HexGroup;
}

export interface HexRow {
  /** Byte offset of the first byte in this row */
  index: number;
  /** Formatted offset column */
  offset: string;
  /** One entry per byte in the row, already grouped (e.g. "4865" for group 2) */
  hex: string[];
  ascii: string;
}

export interface ByteDetails {
  offset: number;
  hex: string;
  dec: number;
  binary: string;
  octal: string;
  char: string;
  /** Description of the UTF-8 role of this byte (lead byte, continuation, ASCII…) */
  utf8: string;
  /** The full decoded character if this byte starts a valid UTF-8 sequence */
  utf8Char: string | null;
}

export interface FileType {
  name: string;
  mime: string;
  description: string;
}

export interface ByteStats {
  size: number;
  printablePercent: number;
  nullCount: number;
  /** Shannon entropy in bits per byte, 0–8 */
  entropy: number;
  entropyNote: string;
  uniqueBytes: number;
}

/** Keep the dump synchronous and the DOM small: 1 MiB of bytes at most. */
export const MAX_HEX_BYTES = 1024 * 1024;
/** Rows rendered per page in the UI before "Show more" (each byte is two clickable nodes, so keep pages small). */
export const HEX_ROWS_PAGE = 1024;

export const TEXT_ENCODINGS: Array<{ id: TextEncodingId; label: string }> = [
  { id: "utf-8", label: "UTF-8" },
  { id: "utf-16le", label: "UTF-16 LE" },
  { id: "latin1", label: "Latin-1" },
];

export function bytesFromText(text: string, encoding: TextEncodingId): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(text);
  if (encoding === "utf-16le") {
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const cu = text.charCodeAt(i);
      out[i * 2] = cu & 0xff;
      out[i * 2 + 1] = cu >> 8;
    }
    return out;
  }
  // Latin-1: code points above 255 cannot be represented and become "?".
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cu = text.charCodeAt(i);
    out[i] = cu <= 0xff ? cu : 0x3f;
  }
  return out;
}

/**
 * Parse loosely formatted hex: "48 65 6c", "0x48,0x65", "48656c", "\x48\x65",
 * with any mix of whitespace, commas, newlines and 0x / \x prefixes.
 */
export function parseHexInput(text: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const cleaned = text
    .replace(/\\x/gi, " ")
    .replace(/0x/gi, " ")
    .replace(/[\s,;:]+/g, "");
  if (!cleaned) return { ok: true, bytes: new Uint8Array(0) };
  const bad = cleaned.match(/[^0-9a-f]/i);
  if (bad) return { ok: false, error: `Unexpected character “${bad[0]}” at position ${bad.index}. Only hex digits, spaces, commas and 0x/\\x prefixes are allowed.` };
  if (cleaned.length % 2 !== 0) return { ok: false, error: `Odd number of hex digits (${cleaned.length}). Every byte needs two digits.` };
  if (cleaned.length / 2 > MAX_HEX_BYTES) return { ok: false, error: `Input is limited to ${MAX_HEX_BYTES.toLocaleString("en-US")} bytes.` };
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  return { ok: true, bytes };
}

const isPrintable = (b: number) => b >= 0x20 && b <= 0x7e;

export function hexDump(bytes: Uint8Array, opts: HexDumpOptions = {}): HexRow[] {
  const bytesPerRow = opts.bytesPerRow ?? 16;
  const offsetBase = opts.offsetBase ?? "hex";
  const uppercase = opts.uppercase ?? false;
  const group = opts.group ?? 1;
  const total = Math.min(bytes.length, MAX_HEX_BYTES);
  const offsetWidth = offsetBase === "hex" ? Math.max(8, total.toString(16).length) : Math.max(8, String(total).length);
  const rows: HexRow[] = [];
  for (let start = 0; start < total; start += bytesPerRow) {
    const end = Math.min(start + bytesPerRow, total);
    const hex: string[] = [];
    let ascii = "";
    let cell = "";
    for (let i = start; i < end; i++) {
      const b = bytes[i];
      let h = b.toString(16).padStart(2, "0");
      if (uppercase) h = h.toUpperCase();
      cell += h;
      if (cell.length === group * 2 || i === end - 1) {
        hex.push(cell);
        cell = "";
      }
      ascii += isPrintable(b) ? String.fromCharCode(b) : ".";
    }
    const offset = offsetBase === "hex" ? start.toString(16).padStart(offsetWidth, "0") : String(start).padStart(offsetWidth, "0");
    rows.push({ index: start, offset: uppercase ? offset.toUpperCase() : offset, hex, ascii });
  }
  return rows;
}

export function toHexString(bytes: Uint8Array, sep = " ", uppercase = false): string {
  const parts: string[] = [];
  for (const b of bytes) {
    const h = b.toString(16).padStart(2, "0");
    parts.push(uppercase ? h.toUpperCase() : h);
  }
  return parts.join(sep);
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function toBinaryString(bytes: Uint8Array, sep = " "): string {
  const parts: string[] = [];
  for (const b of bytes) parts.push(b.toString(2).padStart(8, "0"));
  return parts.join(sep);
}

interface Magic {
  type: FileType;
  test: (b: Uint8Array) => boolean;
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

const MAGICS: Magic[] = [
  { type: { name: "PNG", mime: "image/png", description: "PNG image" }, test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { type: { name: "JPEG", mime: "image/jpeg", description: "JPEG image" }, test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { type: { name: "GIF", mime: "image/gif", description: "GIF image" }, test: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")) },
  { type: { name: "WebP", mime: "image/webp", description: "WebP image (RIFF container)" }, test: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8) },
  { type: { name: "PDF", mime: "application/pdf", description: "PDF document" }, test: (b) => startsWith(b, ascii("%PDF-")) },
  { type: { name: "ZIP", mime: "application/zip", description: "ZIP archive (also docx/xlsx/pptx, jar, apk, epub)" }, test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08]) },
  { type: { name: "gzip", mime: "application/gzip", description: "gzip compressed data" }, test: (b) => startsWith(b, [0x1f, 0x8b]) },
  { type: { name: "7-Zip", mime: "application/x-7z-compressed", description: "7z archive" }, test: (b) => startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) },
  { type: { name: "RAR", mime: "application/vnd.rar", description: "RAR archive" }, test: (b) => startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) },
  { type: { name: "ELF", mime: "application/x-elf", description: "ELF executable (Linux / Unix)" }, test: (b) => startsWith(b, [0x7f, 0x45, 0x4c, 0x46]) },
  { type: { name: "Mach-O", mime: "application/x-mach-binary", description: "Mach-O executable (macOS / iOS)" }, test: (b) => startsWith(b, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(b, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(b, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(b, [0xca, 0xfe, 0xba, 0xbe]) },
  { type: { name: "PE / EXE", mime: "application/vnd.microsoft.portable-executable", description: "Windows executable or DLL (MZ header)" }, test: (b) => startsWith(b, [0x4d, 0x5a]) },
  { type: { name: "MP3", mime: "audio/mpeg", description: "MP3 audio with ID3 tag" }, test: (b) => startsWith(b, ascii("ID3")) },
  { type: { name: "MP4", mime: "video/mp4", description: "MP4 / MOV container (ftyp box)" }, test: (b) => startsWith(b, ascii("ftyp"), 4) },
  { type: { name: "WebAssembly", mime: "application/wasm", description: "WebAssembly binary module" }, test: (b) => startsWith(b, [0x00, 0x61, 0x73, 0x6d]) },
  { type: { name: "SQLite", mime: "application/vnd.sqlite3", description: "SQLite 3 database" }, test: (b) => startsWith(b, ascii("SQLite format 3\0")) },
  { type: { name: "UTF-8 text (BOM)", mime: "text/plain", description: "Text with a UTF-8 byte order mark" }, test: (b) => startsWith(b, [0xef, 0xbb, 0xbf]) },
  { type: { name: "UTF-16 LE text (BOM)", mime: "text/plain", description: "Text with a UTF-16 little-endian byte order mark" }, test: (b) => startsWith(b, [0xff, 0xfe]) },
  { type: { name: "UTF-16 BE text (BOM)", mime: "text/plain", description: "Text with a UTF-16 big-endian byte order mark" }, test: (b) => startsWith(b, [0xfe, 0xff]) },
];

function looksLikeText(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  const n = Math.min(bytes.length, 4096);
  let textual = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (isPrintable(b) || b === 0x09 || b === 0x0a || b === 0x0d || b >= 0x80) textual++;
  }
  if (textual / n < 0.95) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, n));
    return true;
  } catch {
    return false;
  }
}

export function detectFileType(bytes: Uint8Array): FileType | null {
  if (!bytes.length) return null;
  for (const m of MAGICS) if (m.test(bytes)) return m.type;
  if (looksLikeText(bytes)) {
    const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
    if (/^[{[]/.test(head)) return { name: "JSON (probably)", mime: "application/json", description: "Plain text starting with { or [" };
    if (/^<\?xml/i.test(head)) return { name: "XML", mime: "application/xml", description: "Text with an XML declaration" };
    if (/^<!doctype html|^<html/i.test(head)) return { name: "HTML", mime: "text/html", description: "HTML document" };
    if (/^#!/.test(head)) return { name: "Script", mime: "text/plain", description: "Text starting with a #! shebang" };
    return { name: "Plain text", mime: "text/plain", description: "Valid UTF-8 text without a BOM" };
  }
  return null;
}

export function byteStats(bytes: Uint8Array): ByteStats {
  const counts = new Uint32Array(256);
  let printable = 0;
  for (const b of bytes) {
    counts[b]++;
    if (isPrintable(b) || b === 0x0a || b === 0x0d || b === 0x09) printable++;
  }
  let entropy = 0;
  let unique = 0;
  for (let i = 0; i < 256; i++) {
    if (!counts[i]) continue;
    unique++;
    const p = counts[i] / bytes.length;
    entropy -= p * Math.log2(p);
  }
  const rounded = Math.round(entropy * 100) / 100;
  let entropyNote: string;
  if (!bytes.length) entropyNote = "No data.";
  else if (rounded < 3) entropyNote = "Very low: highly repetitive data (padding, simple text or sparse binary).";
  else if (rounded < 5.5) entropyNote = "Typical of text, source code or structured data.";
  else if (rounded < 7.5) entropyNote = "High: mixed binary such as executables, images with metadata or lightly compressed data.";
  else entropyNote = "Near maximum: compressed, encrypted or random data.";
  return {
    size: bytes.length,
    printablePercent: bytes.length ? Math.round((printable / bytes.length) * 1000) / 10 : 0,
    nullCount: counts[0],
    entropy: rounded,
    entropyNote,
    uniqueBytes: unique,
  };
}

/** Details about one byte for the inspector panel. */
export function byteDetails(bytes: Uint8Array, offset: number): ByteDetails | null {
  if (offset < 0 || offset >= bytes.length) return null;
  const b = bytes[offset];
  let utf8: string;
  let utf8Char: string | null = null;
  let seqLen = 0;
  if (b < 0x80) {
    utf8 = "ASCII (single byte)";
    seqLen = 1;
  } else if ((b & 0xc0) === 0x80) utf8 = "Continuation byte (10xxxxxx)";
  else if ((b & 0xe0) === 0xc0) {
    utf8 = "Lead byte of a 2-byte sequence";
    seqLen = 2;
  } else if ((b & 0xf0) === 0xe0) {
    utf8 = "Lead byte of a 3-byte sequence";
    seqLen = 3;
  } else if ((b & 0xf8) === 0xf0) {
    utf8 = "Lead byte of a 4-byte sequence";
    seqLen = 4;
  } else utf8 = "Invalid in UTF-8";
  if (seqLen && offset + seqLen <= bytes.length) {
    try {
      utf8Char = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + seqLen));
    } catch {
      utf8Char = null;
    }
  }
  return {
    offset,
    hex: b.toString(16).padStart(2, "0"),
    dec: b,
    binary: b.toString(2).padStart(8, "0"),
    octal: b.toString(8).padStart(3, "0"),
    char: isPrintable(b) ? String.fromCharCode(b) : b === 0x20 ? "space" : `\\x${b.toString(16).padStart(2, "0")}`,
    utf8,
    utf8Char,
  };
}

export const HEX_VIEWER_SAMPLE = "Hello, DevBox! 👋\r\nTabs\tand\tnulls: \u0000\u0001\u0002 — done.";
