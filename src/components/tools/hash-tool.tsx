"use client";

import { useEffect, useMemo, useState } from "react";
import { Eraser } from "lucide-react";
import { digest, digestAll, HASH_ALGORITHMS, HASH_COMPARE_SAMPLE, type HashAlgorithm } from "@/lib/tools/hash";
import { compareDigests, digestReport, MAX_DIGEST_COMPARE, parseExpectedHash, truncateDigest } from "@/lib/tools/digest-compare";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { OutputRow } from "@/components/output-row";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";
import { DigestSummaryBadges, DigestTable, ExpectedHashField } from "@/components/digest-compare";

type Casing = "lower" | "upper";

export function HashTool() {
  const [input, setInput] = useState("");
  const [casing, setCasing] = useState<Casing>("lower");
  const [hashes, setHashes] = useState<Record<HashAlgorithm, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!("crypto" in globalThis) || !crypto.subtle) {
          throw new Error("Web Crypto is unavailable. Hashing requires a secure context (https or localhost).");
        }
        return digestAll(input);
      })
      .then((h) => {
        if (!cancelled) {
          setHashes(h);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hashing failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  const transform = (s: string) => (casing === "upper" ? s.toUpperCase() : s);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Hash"
          description="Live digests of the UTF-8 bytes of your input, computed with the Web Crypto API."
          actions={
            <>
              <Segmented
                size="sm"
                value={casing}
                onChange={setCasing}
                options={[
                  { value: "lower", label: "abc" },
                  { value: "upper", label: "ABC" },
                ]}
              />
              <Button size="sm" variant="ghost" onClick={() => setInput("")} disabled={!input}>
                Clear
              </Button>
            </>
          }
        />
        <Label htmlFor="hash-in" hint={`${input.length.toLocaleString()} chars · ${new TextEncoder().encode(input).length.toLocaleString()} bytes`}>
          Input
        </Label>
        <Textarea
          id="hash-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or paste text to hash"
          className="min-h-[140px]"
        />
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
        <div className="mt-4 grid gap-2">
          {HASH_ALGORITHMS.map((alg) => (
            <OutputRow key={alg} label={alg} value={hashes ? transform(hashes[alg]) : ""} hint={hashes ? `${hashes[alg].length} hex chars` : undefined} />
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          Empty input still produces a valid digest. SHA-1 is shown for compatibility only; prefer SHA-256 or stronger for new work.
        </p>
      </Card>

      <HashCompare upper={casing === "upper"} />
    </div>
  );
}

/** Digests of several inputs, keyed to the exact field values they were computed from. */
interface CompareDigests {
  algorithm: HashAlgorithm;
  values: string[];
  digests: Array<string | null>;
}

/** "Compare inputs": one box per text, hashed with one algorithm, identical digests grouped. */
function HashCompare({ upper }: { upper: boolean }) {
  const list = useValueList({ max: MAX_DIGEST_COMPARE });
  const { values, hasInput, reset } = list;
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>("SHA-256");
  const [expectedRaw, setExpectedRaw] = useState("");
  const [computed, setComputed] = useState<CompareDigests | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Hashes the exact text (whitespace is significant); empty fields are skipped.
    Promise.resolve()
      .then(() => {
        if (!("crypto" in globalThis) || !crypto.subtle) throw new Error("Web Crypto is unavailable. Hashing requires a secure context (https or localhost).");
        return Promise.all(values.map((v) => (v ? digest(algorithm, v) : null)));
      })
      .then((digests) => {
        // A newer edit or algorithm change superseded this run.
        if (cancelled) return;
        setComputed({ algorithm, values, digests });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hashing failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [values, algorithm]);

  // Only trust results computed from the current fields, so a slow run never shows against newer input.
  const digests = computed && computed.values === values && computed.algorithm === algorithm ? computed.digests : null;
  const expected = useMemo(() => parseExpectedHash(expectedRaw), [expectedRaw]);
  const entries = useMemo(
    () => (digests ?? []).flatMap((d, i) => (d ? [{ line: i + 1, digest: d }] : [])),
    [digests],
  );
  const result = useMemo(() => compareDigests(entries), [entries]);
  const fmt = (hex: string) => (upper ? hex.toUpperCase() : hex);
  const report = digestReport(algorithm, result, (line) => JSON.stringify(values[line - 1]), expected, upper);

  return (
    <Card>
      <CardHeader
        title="Compare inputs"
        description="Hash several texts with one algorithm to see which are identical. Whitespace counts."
        actions={
          <>
            <Segmented size="sm" value={algorithm} onChange={setAlgorithm} options={HASH_ALGORITHMS.map((a) => ({ value: a, label: a }))} />
            {!hasInput ? (
              <Button size="sm" variant="ghost" onClick={() => reset(HASH_COMPARE_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  reset([]);
                  setExpectedRaw("");
                }}
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </>
        }
      />

      <ValueList
        list={list}
        id="hash-compare"
        placeholder="hello world"
        itemLabel="input"
        mono={false}
        status={(_, i) => {
          const d = digests?.[i];
          if (!d) return null;
          const match = expected.status === "ok" ? (d === expected.hex ? " · matches expected" : " · no match") : "";
          return {
            tone: "ok",
            content: (
              <span className="font-mono" title={fmt(d)}>
                {fmt(truncateDigest(d))}
                {match}
              </span>
            ),
          };
        }}
      />

      <div className="mt-4">
        <ExpectedHashField id="hash-compare-expected" value={expectedRaw} onChange={setExpectedRaw} expected={expected} algorithm={algorithm} />
      </div>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {result.rows.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <DigestSummaryBadges result={result} expected={expected} />
          <DigestTable
            rows={result.rows.map((r) => ({
              line: r.line,
              digest: r.digest,
              cells: [<span key="in" className="line-clamp-2 break-all text-[13px]" title={values[r.line - 1]}>{values[r.line - 1]}</span>],
            }))}
            headers={["Input"]}
            result={result}
            expected={expected}
            upper={upper}
          />
          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {result.rows.length === 1 ? "Add at least one more input to compare." : "Enter two or more inputs to compare their digests."}
        </p>
      )}
    </Card>
  );
}
