"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { byteDetails, byteStats, bytesFromText, detectFileType, HEX_ROWS_PAGE, HEX_VIEWER_SAMPLE, hexDump, MAX_HEX_BYTES, parseHexInput, TEXT_ENCODINGS, toBase64, toHexString, type HexGroup, type OffsetBase, type TextEncodingId } from "@/lib/tools/hex-viewer";
import { formatBytes } from "@/lib/tools/image";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Source = "text" | "hex" | "file";
type BytesPerRow = 8 | 16 | 32;

const EMPTY = new Uint8Array(0);

function downloadBytes(data: Uint8Array | string, name: string, type: string) {
  const a = document.createElement("a");
  // Copy into a fresh ArrayBuffer so the Blob accepts it regardless of the view's backing buffer type.
  const part = typeof data === "string" ? data : new Uint8Array(data).buffer;
  a.href = URL.createObjectURL(new Blob([part], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function HexViewerTool() {
  const [source, setSource] = useState<Source>("text");
  const [text, setText] = useState("");
  const [encoding, setEncoding] = useState<TextEncodingId>("utf-8");
  const [hexText, setHexText] = useState("");
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [bytesPerRow, setBytesPerRow] = useState<BytesPerRow>(16);
  const [offsetBase, setOffsetBase] = useState<OffsetBase>("hex");
  const [uppercase, setUppercase] = useState(false);
  const [group, setGroup] = useState<HexGroup>(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [pages, setPages] = useState(1);

  const debouncedText = useDebounced(text, 120);
  const debouncedHex = useDebounced(hexText, 120);

  const parsed = useMemo(() => {
    if (source === "text") return { ok: true as const, bytes: debouncedText ? bytesFromText(debouncedText, encoding) : EMPTY };
    if (source === "hex") return parseHexInput(debouncedHex);
    return { ok: true as const, bytes: file?.bytes ?? EMPTY };
  }, [source, debouncedText, encoding, debouncedHex, file]);

  const bytes = parsed.ok ? parsed.bytes : EMPTY;
  const truncated = bytes.length > MAX_HEX_BYTES;
  const rows = useMemo(() => hexDump(bytes, { bytesPerRow, offsetBase, uppercase, group }), [bytes, bytesPerRow, offsetBase, uppercase, group]);
  const visibleRows = useMemo(() => rows.slice(0, pages * HEX_ROWS_PAGE), [rows, pages]);
  const stats = useMemo(() => byteStats(bytes), [bytes]);
  const fileType = useMemo(() => detectFileType(bytes), [bytes]);
  const details = useMemo(() => (selected === null ? null : byteDetails(bytes, selected)), [bytes, selected]);
  const hexString = useMemo(() => (bytes.length ? toHexString(bytes, " ", uppercase) : ""), [bytes, uppercase]);
  const base64 = useMemo(() => (bytes.length ? toBase64(bytes) : ""), [bytes]);

  const onFile = useCallback(async (f: File) => {
    setFileError(null);
    try {
      const buf = await f.arrayBuffer();
      setFile({ name: f.name, bytes: new Uint8Array(buf) });
      setSelected(null);
      setPages(1);
    } catch {
      setFileError("Could not read that file.");
    }
  }, []);

  const hasInput = source === "text" ? !!text : source === "hex" ? !!hexText : !!file;
  const clear = () => {
    setText("");
    setHexText("");
    setFile(null);
    setSelected(null);
    setPages(1);
  };

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Source"
          description="Text, a hex string or a file. Everything is decoded in this tab; nothing is uploaded or stored."
          actions={
            <>
              <Segmented
                size="sm"
                value={source}
                onChange={(s) => {
                  setSource(s);
                  setSelected(null);
                  setPages(1);
                }}
                options={[
                  { value: "text", label: "Text" },
                  { value: "hex", label: "Hex" },
                  { value: "file", label: "File" },
                ]}
              />
              {!hasInput && source !== "file" ? (
                <Button size="sm" variant="ghost" onClick={() => (source === "text" ? setText(HEX_VIEWER_SAMPLE) : setHexText("48 65 6c 6c 6f 2c 20 44 65 76 42 6f 78 21 0a 89 50 4e 47 0d 0a 1a 0a"))}>
                  Load sample
                </Button>
              ) : hasInput ? (
                <Button size="sm" variant="ghost" onClick={clear}>
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              ) : null}
            </>
          }
        />
        {source === "text" ? (
          <>
            <div className="mb-3 w-40">
              <Label htmlFor="hex-encoding">Encoding</Label>
              <Select id="hex-encoding" value={encoding} onChange={(e) => setEncoding(e.target.value as TextEncodingId)}>
                {TEXT_ENCODINGS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </div>
            <CodeTextarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to see its bytes" className="min-h-[120px]" aria-label="Text input" />
          </>
        ) : source === "hex" ? (
          <>
            <CodeTextarea value={hexText} onChange={(e) => setHexText(e.target.value)} placeholder="48 65 6c 6c 6f · 0x48,0x65 · 48656c · \x48\x65" className="min-h-[120px]" invalid={!parsed.ok} aria-label="Hex input" />
            {!parsed.ok ? (
              <Alert tone="danger" className="mt-3">
                {parsed.error}
              </Alert>
            ) : null}
          </>
        ) : (
          <>
            <Dropzone onFile={onFile} accept="*" maxBytes={MAX_HEX_BYTES} paste={false} compact={!!file} title={file ? `${file.name} · drop another file to replace it` : "Drop a file to inspect"} description={<>or <span className="text-accent-strong">click to choose a file</span> · up to {formatBytes(MAX_HEX_BYTES)}</>} />
            {fileError ? (
              <Alert tone="danger" className="mt-3">
                {fileError}
              </Alert>
            ) : null}
          </>
        )}
      </Card>

      {!bytes.length ? (
        <EmptyState title="Nothing to dump yet" description="Offsets, hex bytes and an ASCII column appear here. Click any byte to inspect it." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="shadow-card min-w-0">
            <CardHeader
              title="Hex dump"
              description={`${bytes.length.toLocaleString()} bytes · ${rows.length.toLocaleString()} rows`}
              actions={
                <>
                  <Segmented size="sm" value={String(bytesPerRow) as "8" | "16" | "32"} onChange={(v) => setBytesPerRow(Number(v) as BytesPerRow)} options={[{ value: "8", label: "8" }, { value: "16", label: "16" }, { value: "32", label: "32" }]} />
                  <Segmented size="sm" value={String(group) as "1" | "2" | "4"} onChange={(v) => setGroup(Number(v) as HexGroup)} options={[{ value: "1", label: "×1" }, { value: "2", label: "×2" }, { value: "4", label: "×4" }]} />
                  <Segmented size="sm" value={offsetBase} onChange={setOffsetBase} options={[{ value: "hex", label: "Hex offsets" }, { value: "dec", label: "Decimal" }]} />
                  <label className="flex items-center gap-2 text-xs text-fg-muted">
                    <input type="checkbox" className="accent-accent" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} />
                    Uppercase
                  </label>
                </>
              }
            />
            {truncated ? (
              <Alert tone="warning" className="mb-3">
                Only the first {formatBytes(MAX_HEX_BYTES)} are shown.
              </Alert>
            ) : null}
            <pre className="max-h-[600px] overflow-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed" aria-label="Hex dump">
              {visibleRows.map((row) => (
                <div key={row.index} className="flex gap-3 whitespace-pre">
                  <span className="select-none text-fg-subtle">{row.offset}</span>
                  <span className="flex gap-1">
                    {row.hex.map((cell, ci) => {
                      const start = row.index + ci * group;
                      const active = selected !== null && selected >= start && selected < start + cell.length / 2;
                      return (
                        <button
                          key={ci}
                          type="button"
                          onClick={() => setSelected(start)}
                          className={cn("rounded px-0.5 cursor-pointer hover:bg-surface-hover", active && "bg-accent-soft text-accent-strong")}
                          aria-label={`Byte at offset ${start}`}
                        >
                          {cell}
                        </button>
                      );
                    })}
                  </span>
                  <span className="text-fg-muted">
                    {Array.from(row.ascii, (ch, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelected(row.index + i)}
                        className={cn("cursor-pointer hover:bg-surface-hover", selected === row.index + i && "bg-accent-soft text-accent-strong")}
                        aria-label={`Character at offset ${row.index + i}`}
                      >
                        {ch}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
            {visibleRows.length < rows.length ? (
              <div className="mt-3 flex items-center gap-3">
                <Button size="sm" onClick={() => setPages((p) => p + 1)}>
                  Show more
                </Button>
                <span className="text-xs text-fg-subtle">
                  {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
                </span>
              </div>
            ) : null}
          </Card>

          <div className="space-y-4">
            <Card className="shadow-card">
              <CardHeader title="Summary" />
              <div className="mb-3 flex flex-wrap gap-1.5">
                <Badge tone={fileType ? "accent" : "neutral"}>{fileType ? fileType.name : "Unknown type"}</Badge>
                <Badge>{formatBytes(bytes.length)}</Badge>
              </div>
              <OutputGrid className="sm:grid-cols-1">
                <OutputRow label="Detected type" value={fileType ? `${fileType.name} · ${fileType.mime}` : "No known signature"} hint={fileType?.description} mono={false} copyable={!!fileType} />
                <OutputRow label="Size" value={`${bytes.length.toLocaleString()} bytes`} copyable={false} />
                <OutputRow label="Entropy" value={`${stats.entropy.toFixed(2)} / 8 bits`} hint={stats.entropyNote} copyable={false} />
                <OutputRow label="Printable" value={`${stats.printablePercent}%`} hint={`${stats.nullCount.toLocaleString()} null bytes · ${stats.uniqueBytes} distinct values`} copyable={false} />
              </OutputGrid>
            </Card>

            <Card className="shadow-card">
              <CardHeader title="Byte inspector" description={details ? undefined : "Click a byte in the dump."} />
              {details ? (
                <OutputGrid className="sm:grid-cols-2">
                  <OutputRow label="Offset" value={`${details.offset} (0x${details.offset.toString(16)})`} />
                  <OutputRow label="Hex" value={uppercase ? details.hex.toUpperCase() : details.hex} />
                  <OutputRow label="Decimal" value={String(details.dec)} />
                  <OutputRow label="Octal" value={details.octal} />
                  <OutputRow label="Binary" value={details.binary} className="sm:col-span-2" />
                  <OutputRow label="Char" value={details.char} />
                  <OutputRow label="UTF-8" value={details.utf8Char ?? "—"} hint={details.utf8} className={details.utf8Char ? undefined : "sm:col-span-1"} />
                </OutputGrid>
              ) : null}
            </Card>

            <Card className="shadow-card">
              <CardHeader
                title="Export"
                actions={
                  <>
                    <Button size="sm" onClick={() => downloadBytes(bytes, `${file?.name ?? "bytes"}.bin`, "application/octet-stream")}>
                      <Download className="h-3.5 w-3.5" /> .bin
                    </Button>
                    <Button size="sm" onClick={() => downloadBytes(hexString, `${file?.name ?? "bytes"}.hex`, "text/plain")}>
                      <Download className="h-3.5 w-3.5" /> .hex
                    </Button>
                  </>
                }
              />
              <OutputGrid className="sm:grid-cols-1">
                <OutputRow label="Hex string" value={hexString} className="[&_.break-all]:line-clamp-3" />
                <OutputRow label="Base64" value={base64} className="[&_.break-all]:line-clamp-3" />
              </OutputGrid>
              <div className="mt-2">
                <CopyButton value={hexString} label="Copy hex" variant="primary" />
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
