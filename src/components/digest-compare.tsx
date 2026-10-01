"use client";

import type { ReactNode } from "react";
import { expectedLengthHint, groupLabel, truncateDigest, type DigestCompareResult, type ExpectedHash } from "@/lib/tools/digest-compare";
import type { ChecksumAlgorithm } from "@/lib/tools/checksum";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the "compare digests" cards in the Hash Generator and
 * File Checksum tools: an expected-hash field, summary badges and a results table.
 */

interface ExpectedHashFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  expected: ExpectedHash;
  algorithm: ChecksumAlgorithm;
}

export function ExpectedHashField({ id, value, onChange, expected, algorithm }: ExpectedHashFieldProps) {
  const hint = expected.status === "invalid" ? expected.message : expectedLengthHint(expected, algorithm);
  return (
    <div>
      <Label htmlFor={id} hint="optional · case-insensitive">
        Expected hash
      </Label>
      <Input
        id={id}
        mono
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        invalid={expected.status === "invalid"}
        data-1p-ignore="true"
        data-lpignore="true"
      />
      {hint ? <p className={cn("mt-1 text-[11px]", expected.status === "invalid" ? "text-danger" : "text-warning")}>{hint}</p> : null}
    </div>
  );
}

/** "All identical" / "N unique", identical groups, and how many match the expected hash. */
export function DigestSummaryBadges({ result, expected }: { result: DigestCompareResult; expected: ExpectedHash }) {
  const matches = expected.status === "ok" ? result.rows.filter((r) => r.digest === expected.hex).length : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {result.allIdentical ? <Badge tone="success">All identical</Badge> : <Badge tone="accent">{result.unique} unique</Badge>}
      {!result.allIdentical
        ? result.groups.map((g) => (
            <Badge key={g.digest} tone="neutral">
              {groupLabel(g.lines)}
            </Badge>
          ))
        : null}
      {matches !== null ? (
        <Badge tone={matches ? "success" : "danger"}>
          {matches} of {result.rows.length} match expected
        </Badge>
      ) : null}
    </div>
  );
}

export interface DigestTableRow {
  line: number;
  /** Extra cells shown between "#" and the digest (e.g. file name and size). */
  cells?: ReactNode[];
  /** Lowercase hex, or null while hashing / on error. */
  digest: string | null;
  /** Shown in the digest cell instead of a digest. */
  pending?: boolean;
  error?: string;
}

interface DigestTableProps {
  rows: DigestTableRow[];
  /** Headers for `cells`. */
  headers?: string[];
  result: DigestCompareResult;
  expected: ExpectedHash;
  upper: boolean;
}

/** One row per input: digest (truncated, full value on hover/copy), identical-to badges and expected-hash match. */
export function DigestTable({ rows, headers = [], result, expected, upper }: DigestTableProps) {
  const sameAs = new Map(result.rows.map((r) => [r.line, r.sameAs]));
  const fmt = (hex: string) => (upper ? hex.toUpperCase() : hex);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Digest</th>
            <th className="px-3 py-2 font-medium">Same as</th>
            {expected.status === "ok" ? <th className="px-3 py-2 font-medium">Expected</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const same = sameAs.get(r.line) ?? [];
            return (
              <tr key={r.line} className="border-t align-top">
                <td className="px-3 py-2 text-fg-subtle">{r.line}</td>
                {(r.cells ?? []).map((c, i) => (
                  <td key={headers[i] ?? i} className="px-3 py-2">
                    {c}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {r.digest ? (
                    <div className="flex items-center gap-1">
                      <span className="whitespace-nowrap font-mono text-[13px]" title={fmt(r.digest)}>
                        {fmt(truncateDigest(r.digest))}
                      </span>
                      <CopyButton value={fmt(r.digest)} iconOnly className="shrink-0" />
                    </div>
                  ) : r.error ? (
                    <span className="text-xs text-danger">{r.error}</span>
                  ) : (
                    <span className="text-xs text-fg-subtle">{r.pending ? "Hashing…" : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {same.length ? <Badge tone="accent">{same.map((l) => `#${l}`).join(", ")}</Badge> : <span className="text-fg-subtle">—</span>}
                </td>
                {expected.status === "ok" ? (
                  <td className="px-3 py-2">
                    {r.digest ? (
                      r.digest === expected.hex ? (
                        <Badge tone="success">Match</Badge>
                      ) : (
                        <Badge tone="danger">No match</Badge>
                      )
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
