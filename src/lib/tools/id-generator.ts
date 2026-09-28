export type IdCharset = "alphanumeric" | "numeric" | "uppercase" | "lowercase" | "hex";

export const CHARSETS: Record<IdCharset, { label: string; chars: string }> = {
  alphanumeric: { label: "Alphanumeric", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" },
  uppercase: { label: "Uppercase", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" },
  lowercase: { label: "Lowercase", chars: "abcdefghijklmnopqrstuvwxyz0123456789" },
  numeric: { label: "Numeric", chars: "0123456789" },
  hex: { label: "Hex", chars: "0123456789abcdef" },
};

export interface IdOptions {
  charset: IdCharset;
  length: number;
  prefix: string;
  quantity: number;
  /** Include a millisecond timestamp before the random part */
  timestamp: boolean;
  separator: string;
}

function randomChars(chars: string, length: number): string {
  const out: string[] = [];
  const max = 256 - (256 % chars.length); // rejection sampling to avoid modulo bias
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out.push(chars[buf[i] % chars.length]);
    }
  }
  return out.join("");
}

export function generateId(opts: IdOptions, now: number = Date.now()): string {
  const parts: string[] = [];
  if (opts.prefix) parts.push(opts.prefix);
  if (opts.timestamp) parts.push(String(now));
  if (opts.length > 0) parts.push(randomChars(CHARSETS[opts.charset].chars, opts.length));
  return parts.join(opts.separator);
}

export function generateIds(opts: IdOptions): string[] {
  const now = Date.now();
  return Array.from({ length: opts.quantity }, () => generateId(opts, now));
}
