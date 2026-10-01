"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Plus, Upload, X } from "lucide-react";
import { CHECKSUM_ALGORITHMS, compareHash, digestAllBuffers, digestBuffer, type ChecksumAlgorithm, MAX_CHECKSUM_BYTES } from "@/lib/tools/checksum";
import { compareDigests, digestReport, joinLines, MAX_DIGEST_COMPARE, parseExpectedHash } from "@/lib/tools/digest-compare";
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
import { DigestSummaryBadges, DigestTable, ExpectedHashField } from "@/components/digest-compare";
import { cn } from "@/lib/utils";

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

      <FileCompare upper={casing === "upper"} />
    </div>
  );
}

interface CompareFile {
  key: number;
  file: File;
  /** Digests computed so far, per algorithm (switching back doesn't re-read the file). */
  digests: Partial<Record<ChecksumAlgorithm, string>>;
  error?: string;
}

let nextFileKey = 0;

/** "Compare files": one row per file, each hashed with the chosen algorithm; identical files are grouped. */
function FileCompare({ upper }: { upper: boolean }) {
  const [files, setFiles] = useState<CompareFile[]>([]);
  const [algorithm, setAlgorithm] = useState<ChecksumAlgorithm>("SHA-256");
  const [expectedRaw, setExpectedRaw] = useState("");
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The one file currently being read ("key:algorithm"). Hashing runs one file at a time so
  // several large files never sit in memory together.
  const inFlightRef = useRef<string | null>(null);

  const add = (list: FileList | File[] | null | undefined) => {
    const incoming = Array.from(list ?? []);
    if (!incoming.length) return;
    const room = MAX_DIGEST_COMPARE - files.length;
    setNotice(incoming.length > room ? `Up to ${MAX_DIGEST_COMPARE} files; ${incoming.length - Math.max(room, 0)} skipped.` : null);
    const added = incoming.slice(0, Math.max(room, 0)).map((file) => ({
      key: nextFileKey++,
      file,
      digests: {},
      error: file.size > MAX_CHECKSUM_BYTES ? `Too large: files up to ${formatBytes(MAX_CHECKSUM_BYTES)} can be hashed in the browser.` : undefined,
    }));
    setFiles((fs) => [...fs, ...added].slice(0, MAX_DIGEST_COMPARE));
  };

  const remove = (key: number) => setFiles((fs) => fs.filter((f) => f.key !== key));

  useEffect(() => {
    if (inFlightRef.current) return;
    const next = files.find((f) => !f.error && !f.digests[algorithm]);
    if (!next) return;
    const id = `${next.key}:${algorithm}`;
    inFlightRef.current = id;
    // Results are stored against the file's key and algorithm, so a late result is never shown for the wrong file;
    // a removed file's result is simply dropped. Clearing the ref before setFiles lets the re-render pick the next file.
    Promise.resolve()
      .then(() => {
        if (!crypto?.subtle) throw new Error("Web Crypto is unavailable. Hashing needs a secure context (https or localhost).");
        return next.file.arrayBuffer();
      })
      .then((buf) => digestBuffer(algorithm, buf))
      .then(
        (hex) => {
          inFlightRef.current = null;
          setFiles((fs) => fs.map((f) => (f.key === next.key ? { ...f, digests: { ...f.digests, [algorithm]: hex } } : f)));
        },
        (e: unknown) => {
          inFlightRef.current = null;
          setFiles((fs) => fs.map((f) => (f.key === next.key ? { ...f, error: e instanceof Error ? e.message : "Could not read this file." } : f)));
        },
      );
  }, [files, algorithm]);

  const expected = useMemo(() => parseExpectedHash(expectedRaw), [expectedRaw]);
  const entries = useMemo(
    () => files.flatMap((f, i) => (f.digests[algorithm] ? [{ line: i + 1, digest: f.digests[algorithm] }] : [])),
    [files, algorithm],
  );
  const result = useMemo(() => compareDigests(entries), [entries]);
  const pending = files.some((f) => !f.error && !f.digests[algorithm]);
  const identical = result.groups.map((g) => `${joinLines(g.lines)} are identical`);
  const report = digestReport(algorithm, result, (line) => `${files[line - 1]?.file.name} (${files[line - 1]?.file.size.toLocaleString()} bytes)`, expected, upper);

  return (
    <Card className="shadow-card">
      <CardHeader
        title="Compare files"
        description="Hash several files with one algorithm to find identical ones or check them against a published hash."
        actions={
          <>
            <Segmented size="sm" value={algorithm} onChange={setAlgorithm} options={CHECKSUM_ALGORITHMS.map((a) => ({ value: a, label: a }))} />
            {files.length ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFiles([]);
                  setNotice(null);
                }}
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </Button>
            ) : null}
          </>
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {files.length ? (
        <div className="space-y-2">
          {files.map((f, i) => {
            const hex = f.digests[algorithm];
            return (
              <div key={f.key} className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-right text-xs text-fg-subtle">#{i + 1}</span>
                <div className={cn("min-w-0 flex-1 rounded-lg border bg-bg-elevated px-3 py-1.5", f.error && "border-danger")}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-fg" title={f.file.name}>
                      {f.file.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{formatBytes(f.file.size)}</span>
                  </div>
                  <div className={cn("mt-0.5 break-all text-[11px]", f.error ? "text-danger" : "text-fg-subtle")}>
                    {f.error ?? (hex ? <span className="font-mono">{upper ? hex.toUpperCase() : hex}</span> : "Hashing…")}
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="mt-0.5 shrink-0" onClick={() => remove(f.key)} aria-label={`Remove file ${i + 1}`} title="Remove">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-label="Add files to compare"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
          files.length ? "mt-3 px-4 py-3" : "px-6 py-8",
          over ? "border-accent bg-accent-soft/60" : "border-border bg-bg-elevated hover:border-border-strong hover:bg-surface-hover",
        )}
      >
        {files.length ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <Plus className="h-3.5 w-3.5" /> Add more files
          </p>
        ) : (
          <>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-fg-subtle">
              <Upload className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-fg">Drop two or more files to compare</p>
            <p className="mt-1 text-xs text-fg-muted">
              or <span className="text-accent-strong">click to choose files</span>
            </p>
          </>
        )}
        {notice ? <p className="mt-1 text-xs text-warning">{notice}</p> : null}
      </div>

      <div className="mt-4">
        <ExpectedHashField id="checksum-compare-expected" value={expectedRaw} onChange={setExpectedRaw} expected={expected} algorithm={algorithm} />
      </div>

      {files.length >= 2 ? (
        <div className="mt-4 space-y-3">
          {result.rows.length >= 2 ? <DigestSummaryBadges result={result} expected={expected} /> : null}
          {identical.length ? <p className="text-xs text-fg-muted">{identical.join("; ")}.</p> : null}
          <DigestTable
            rows={files.map((f, i) => ({
              line: i + 1,
              digest: f.digests[algorithm] ?? null,
              pending: !f.error,
              error: f.error,
              cells: [
                <span key="name" className="block max-w-[220px] truncate" title={f.file.name}>
                  {f.file.name}
                </span>,
                <span key="size" className="whitespace-nowrap text-fg-muted" title={`${f.file.size.toLocaleString()} bytes`}>
                  {formatBytes(f.file.size)}
                </span>,
              ],
            }))}
            headers={["Name", "Size"]}
            result={result}
            expected={expected}
            upper={upper}
          />
          <div className="flex justify-end">
            <CopyButton label="Copy report" value={pending ? "" : report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">{files.length === 1 ? "Add at least one more file to compare." : "Files are hashed one at a time and never leave your browser."}</p>
      )}
    </Card>
  );
}
