export const CHECKSUM_ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
export type ChecksumAlgorithm = (typeof CHECKSUM_ALGORITHMS)[number];

export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function digestBuffer(algorithm: ChecksumAlgorithm, data: ArrayBuffer): Promise<string> {
  return bufferToHex(await crypto.subtle.digest(algorithm, data));
}

/** Largest file we will load into memory for hashing. */
export const MAX_CHECKSUM_BYTES = 1024 * 1024 * 1024;

export async function digestAllBuffers(data: ArrayBuffer): Promise<Record<ChecksumAlgorithm, string>> {
  // Sequential on purpose: each digest copies its input, so running four at once
  // multiplies peak memory for large files.
  const out: Partial<Record<ChecksumAlgorithm, string>> = {};
  for (const a of CHECKSUM_ALGORITHMS) out[a] = await digestBuffer(a, data);
  return out as Record<ChecksumAlgorithm, string>;
}

/** Normalise a pasted hash for comparison: trim, lowercase, strip spaces/colons and "sha256:" prefixes. */
export function normalizeHash(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^(sha-?\d+|md5)\s*[:=]\s*/i, "")
    .replace(/[\s:]/g, "");
}

/** Which algorithm a hash length corresponds to (hex chars). */
export function algorithmForLength(len: number): ChecksumAlgorithm | null {
  switch (len) {
    case 40:
      return "SHA-1";
    case 64:
      return "SHA-256";
    case 96:
      return "SHA-384";
    case 128:
      return "SHA-512";
    default:
      return null;
  }
}

export interface CompareResult {
  status: "empty" | "invalid" | "match" | "mismatch";
  algorithm: ChecksumAlgorithm | null;
}

export function compareHash(expected: string, hashes: Record<ChecksumAlgorithm, string> | null): CompareResult {
  const norm = normalizeHash(expected);
  if (!norm) return { status: "empty", algorithm: null };
  if (!/^[0-9a-f]+$/.test(norm)) return { status: "invalid", algorithm: null };
  const algorithm = algorithmForLength(norm.length);
  if (!algorithm) return { status: "invalid", algorithm: null };
  if (!hashes) return { status: "empty", algorithm };
  return { status: hashes[algorithm] === norm ? "match" : "mismatch", algorithm };
}
