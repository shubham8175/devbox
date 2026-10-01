/**
 * Comparing several digests at once: shared by the Hash Generator ("Compare inputs")
 * and File Checksum ("Compare files") tools. Pure, so it can be unit-tested.
 */

import { algorithmForLength, normalizeHash, type ChecksumAlgorithm } from "@/lib/tools/checksum";

/** Upper bound on compared inputs / files, so a huge paste or drop can't render hundreds of rows. */
export const MAX_DIGEST_COMPARE = 20;

export interface DigestEntry {
  /** 1-based field / file number shown as "#n". */
  line: number;
  /** Lowercase hex digest. */
  digest: string;
}

export interface DigestCompareRow extends DigestEntry {
  /** Other lines with the same digest, in order (empty when this one is unique). */
  sameAs: number[];
}

export interface DigestCompareResult {
  rows: DigestCompareRow[];
  /** Sets of two or more lines sharing a digest, ordered by their first line. */
  groups: Array<{ lines: number[]; digest: string }>;
  /** Number of distinct digests. */
  unique: number;
  /** True when there are at least two entries and every digest is the same. */
  allIdentical: boolean;
}

/** Groups entries by digest (case-insensitive) so the UI can say "#1 = #3". */
export function compareDigests(entries: DigestEntry[]): DigestCompareResult {
  const byDigest = new Map<string, number[]>();
  for (const e of entries) {
    const d = e.digest.toLowerCase();
    byDigest.set(d, [...(byDigest.get(d) ?? []), e.line]);
  }
  const rows = entries.map((e) => ({
    line: e.line,
    digest: e.digest.toLowerCase(),
    sameAs: (byDigest.get(e.digest.toLowerCase()) ?? []).filter((l) => l !== e.line),
  }));
  const groups = Array.from(byDigest, ([digest, lines]) => ({ lines, digest })).filter((g) => g.lines.length > 1);
  return { rows, groups, unique: byDigest.size, allIdentical: entries.length >= 2 && byDigest.size === 1 };
}

/** "#1 = #3 = #4" */
export function groupLabel(lines: number[]): string {
  return lines.map((l) => `#${l}`).join(" = ");
}

/** "#1 and #3", "#1, #2 and #4" */
export function joinLines(lines: number[]): string {
  const tags = lines.map((l) => `#${l}`);
  return tags.length <= 1 ? (tags[0] ?? "") : `${tags.slice(0, -1).join(", ")} and ${tags[tags.length - 1]}`;
}

/** Shortens a long digest for a table cell: first and last few characters. */
export function truncateDigest(hex: string, keep = 12): string {
  return hex.length <= keep * 2 + 1 ? hex : `${hex.slice(0, keep)}…${hex.slice(-keep)}`;
}

export type ExpectedHash =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ok"; hex: string; /** Algorithm implied by the length, if any. */ algorithm: ChecksumAlgorithm | null };

/** Parses a pasted "expected" digest: hex only, case-insensitive, "sha256:" prefixes and spaces/colons ignored. */
export function parseExpectedHash(raw: string): ExpectedHash {
  const hex = normalizeHash(raw);
  if (!hex) return { status: "empty" };
  if (!/^[0-9a-f]+$/.test(hex)) return { status: "invalid", message: "Not a hex digest." };
  return { status: "ok", hex, algorithm: algorithmForLength(hex.length) };
}

/** Whether an expected digest was given for the wrong algorithm (by length), e.g. a SHA-1 pasted while SHA-256 is selected. */
export function expectedLengthHint(expected: ExpectedHash, algorithm: ChecksumAlgorithm): string | null {
  if (expected.status !== "ok" || expected.algorithm === algorithm) return null;
  return expected.algorithm
    ? `That looks like a ${expected.algorithm} digest, but ${algorithm} is selected.`
    : `${expected.hex.length} hex chars doesn't match any SHA digest length.`;
}

/** Plain-text report for "Copy report". `label` describes each line (the input text or file name). */
export function digestReport(
  algorithm: ChecksumAlgorithm,
  result: DigestCompareResult,
  label: (line: number) => string,
  expected: ExpectedHash,
  upper = false,
): string {
  const fmt = (hex: string) => (upper ? hex.toUpperCase() : hex);
  const lines = [`Algorithm: ${algorithm}`];
  if (expected.status === "ok") lines.push(`Expected: ${fmt(expected.hex)}`);
  for (const r of result.rows) {
    const match = expected.status === "ok" ? (r.digest === expected.hex ? "  [matches expected]" : "  [no match]") : "";
    lines.push(`#${r.line} ${label(r.line)}`, `   ${fmt(r.digest)}${match}`);
  }
  lines.push(
    result.allIdentical
      ? "All identical."
      : `${result.unique} unique digest${result.unique === 1 ? "" : "s"}${result.groups.length ? `; identical: ${result.groups.map((g) => groupLabel(g.lines)).join(", ")}` : ""}.`,
  );
  return lines.join("\n");
}
