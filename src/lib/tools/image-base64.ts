export interface DataUrlParts {
  mime: string;
  base64: string;
  isImage: boolean;
  bytes: number;
}

/** Convert an ArrayBuffer to Base64 in chunks (safe for multi-MB files). */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function toDataUrl(mime: string, base64: string): string {
  return `data:${mime || "application/octet-stream"};base64,${base64}`;
}

/** Bytes represented by a Base64 string (accounts for padding). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

const IMAGE_MIME = /^image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml|avif|x-icon|vnd\.microsoft\.icon)$/i;

/**
 * Parse a data URL. Only base64 image payloads are accepted for preview;
 * anything else is reported as not-an-image so the UI never renders it.
 */
export function parseDataUrl(input: string): { ok: true; value: DataUrlParts } | { ok: false; error: string } {
  const s = input.trim();
  if (!s) return { ok: false, error: "Paste a data URL." };
  const m = /^data:([^;,]+)?((?:;[^;,]+)*)?;base64,([A-Za-z0-9+/=\s]*)$/i.exec(s);
  if (!m) {
    if (/^data:/i.test(s)) return { ok: false, error: "Only base64-encoded data URLs are supported (data:<mime>;base64,<data>)." };
    return { ok: false, error: "That doesn't look like a data URL. It should start with data:image/…;base64," };
  }
  const mime = (m[1] || "").toLowerCase();
  const base64 = m[3].replace(/\s+/g, "");
  if (!base64) return { ok: false, error: "The data URL has no payload." };
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) return { ok: false, error: "The Base64 payload is malformed." };
  const isImage = IMAGE_MIME.test(mime);
  return { ok: true, value: { mime, base64, isImage, bytes: base64ByteLength(base64) } };
}
