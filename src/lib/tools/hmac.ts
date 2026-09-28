export const HMAC_ALGORITHMS = ["SHA-256", "SHA-384", "SHA-512"] as const;
export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

export interface HmacOutput {
  hex: string;
  base64: string;
  base64url: string;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * HMAC with the Web Crypto API. The secret is only ever held in memory for the
 * duration of the call; it is never logged, stored or transmitted.
 */
export async function hmac(algorithm: HmacAlgorithm, secret: string, message: string): Promise<HmacOutput> {
  if (!secret) throw new Error("Enter a secret. Web Crypto does not support zero-length HMAC keys.");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const base64 = toBase64(sig);
  return { hex: toHex(sig), base64, base64url: base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
}

export async function hmacAll(secret: string, message: string): Promise<Record<HmacAlgorithm, HmacOutput>> {
  const results = await Promise.all(HMAC_ALGORITHMS.map((a) => hmac(a, secret, message)));
  return Object.fromEntries(HMAC_ALGORITHMS.map((a, i) => [a, results[i]])) as Record<HmacAlgorithm, HmacOutput>;
}
