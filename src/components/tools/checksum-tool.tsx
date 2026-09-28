"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { CHECKSUM_ALGORITHMS, compareHash, digestAllBuffers, type ChecksumAlgorithm, MAX_CHECKSUM_BYTES } from "@/lib/tools/checksum";
import { formatBytes } from "@/lib/tools/image";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Casing = "lower" | "upper";

interface Result {
  name: string;
  size: number;
  type: string;
  hashes: Record<ChecksumAlgorithm, string>;
}

export function ChecksumTool() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [casing, setCasing] = useState<Casing>("lower");
  const [expected, setExpected] = useState("");

  const requestRef = useRef(0);

  const onFile = useCallback(async (file: File) => {
    const request = ++requestRef.current;
    setError(null);
    setBusy(`Hashing ${file.name} (${formatBytes(file.size)})…`);
    try {
      if (!crypto?.subtle) throw new Error("Web Crypto is unavailable. Hashing needs a secure context (https or localhost).");
      if (file.size > MAX_CHECKSUM_BYTES) throw new Error(`This file is ${formatBytes(file.size)}. Files up to ${formatBytes(MAX_CHECKSUM_BYTES)} can be hashed in the browser.`);
      const buf = await file.arrayBuffer();
      const hashes = await digestAllBuffers(buf);
      if (request !== requestRef.current) return; // a newer file replaced this one
      setResult({ name: file.name, size: file.size, type: file.type || "unknown", hashes });
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(e instanceof Error ? e.message : "Could not hash this file.");
      setResult(null);
    } finally {
      if (request === requestRef.current) setBusy(null);
    }
  }, []);

  const transform = (s: string) => (casing === "upper" ? s.toUpperCase() : s);
  const comparison = useMemo(() => compareHash(expected, result?.hashes ?? null), [expected, result]);
  const allText = result ? CHECKSUM_ALGORITHMS.map((a) => `${a}: ${transform(result.hashes[a])}`).join("\n") : "";

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="File"
          description="Any file type. It is read once in memory and hashed with the Web Crypto API."
          actions={
            result ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
              >
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            ) : null
          }
        />
        <Dropzone onFile={onFile} accept="*" paste={false} compact={!!result} title={result ? "Drop or click to hash another file" : "Drop a file to hash"} description={<>or <span className="text-accent-strong">click to choose a file</span></>} />
        {busy ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-fg-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" />
            {busy}
          </div>
        ) : null}
        {error ? <ErrorState title="Couldn't hash that file" description={error} className="mt-4" /> : null}
        <p className="mt-3 text-center text-[11px] text-fg-subtle">The file never leaves your browser.</p>
      </Card>

      {result ? (
        <>
          <Card className="shadow-card">
            <CardHeader title="Details" />
            <OutputGrid className="sm:grid-cols-3">
              <OutputRow label="Filename" value={result.name} mono={false} />
              <OutputRow label="Size" value={`${formatBytes(result.size)} (${result.size.toLocaleString()} bytes)`} />
              <OutputRow label="MIME type" value={result.type} />
            </OutputGrid>
          </Card>

          <Card className="shadow-card">
            <CardHeader
              title="Checksums"
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
                  <CopyButton value={allText} label="Copy all" />
                </>
              }
            />
            <div className="grid gap-2">
              {CHECKSUM_ALGORITHMS.map((a) => (
                <OutputRow key={a} label={a} value={transform(result.hashes[a])} hint={comparison.algorithm === a && comparison.status !== "empty" ? (comparison.status === "match" ? "Matches the expected hash" : comparison.status === "mismatch" ? "Does NOT match the expected hash" : undefined) : undefined} className={comparison.algorithm === a ? (comparison.status === "match" ? "border-success/50" : comparison.status === "mismatch" ? "border-danger/50" : undefined) : undefined} />
              ))}
            </div>
          </Card>

          <Card className="shadow-card">
            <CardHeader
              title="Verify"
              description="Paste the hash published alongside a download. The algorithm is detected from its length."
              actions={
                comparison.status === "match" ? <Badge tone="success">Match · {comparison.algorithm}</Badge> : comparison.status === "mismatch" ? <Badge tone="danger">Mismatch · {comparison.algorithm}</Badge> : comparison.status === "invalid" ? <Badge tone="warning">Not a recognised hash</Badge> : null
              }
            />
            <Label htmlFor="checksum-expected">Expected hash</Label>
            <Input id="checksum-expected" mono value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="e.g. sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08" invalid={comparison.status === "invalid" || comparison.status === "mismatch"} data-1p-ignore="true" data-lpignore="true" />
            {comparison.status === "mismatch" ? (
              <Alert tone="danger" className="mt-3">
                The {comparison.algorithm} hash of this file differs from the expected value. The file may be corrupted or tampered with.
              </Alert>
            ) : null}
            {comparison.status === "invalid" ? (
              <Alert tone="warning" className="mt-3">
                Expected a hex string of 40, 64, 96 or 128 characters (SHA-1 / 256 / 384 / 512).
              </Alert>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
