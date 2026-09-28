"use client";

import { useEffect, useState } from "react";
import { digestAll, HASH_ALGORITHMS, type HashAlgorithm } from "@/lib/tools/hash";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { OutputRow } from "@/components/output-row";
import { Alert } from "@/components/ui/alert";

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
  );
}
