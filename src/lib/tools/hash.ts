export const HASH_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function digest(algorithm: HashAlgorithm, text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest(algorithm, data);
  return toHex(hash);
}

export async function digestAll(text: string): Promise<Record<HashAlgorithm, string>> {
  const results = await Promise.all(HASH_ALGORITHMS.map((a) => digest(a, text)));
  return Object.fromEntries(HASH_ALGORITHMS.map((a, i) => [a, results[i]])) as Record<HashAlgorithm, string>;
}
