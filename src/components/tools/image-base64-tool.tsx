"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import { bufferToBase64, parseDataUrl, toDataUrl } from "@/lib/tools/image-base64";
import { formatBytes } from "@/lib/tools/image";
import { downloadBlob } from "@/lib/tools/canvas";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

interface Encoded {
  name: string;
  mime: string;
  size: number;
  base64: string;
  dataUrl: string;
}

const MAX_BYTES = 8 * 1024 * 1024;
/** Base64 inflates by 4/3; anything larger cannot decode to a file under MAX_BYTES. */
const MAX_DATA_URL_CHARS = Math.ceil((MAX_BYTES * 4) / 3) + 256;

export function ImageBase64Tool() {
  const [encoded, setEncoded] = useState<Encoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decodeInput, setDecodeInput] = useState("");

  const onFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`This file is ${formatBytes(file.size)}. Base64 for images over ${formatBytes(MAX_BYTES)} is impractical to display; try compressing it first.`);
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = bufferToBase64(buf);
      const mime = file.type || "application/octet-stream";
      setEncoded({ name: file.name, mime, size: file.size, base64, dataUrl: toDataUrl(mime, base64) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const decoded = useMemo<ReturnType<typeof parseDataUrl> | null>(() => {
    if (!decodeInput.trim()) return null;
    if (decodeInput.length > MAX_DATA_URL_CHARS) return { ok: false, error: `That data URL is over ${formatBytes(MAX_DATA_URL_CHARS)} of text; images above ${formatBytes(MAX_BYTES)} are not supported here.` };
    return parseDataUrl(decodeInput);
  }, [decodeInput]);
  const previewUrl = decoded?.ok && decoded.value.isImage ? toDataUrl(decoded.value.mime, decoded.value.base64) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="surface-gradient shadow-card lg:col-span-2">
          <CardHeader
            title="Image"
            actions={
              encoded ? (
                <Button size="sm" variant="ghost" onClick={() => setEncoded(null)}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              ) : null
            }
          />
          {encoded ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={encoded.dataUrl} alt={encoded.name} className="max-h-72 w-full rounded-lg border bg-bg-elevated object-contain" />
              <OutputGrid className="mt-3 sm:grid-cols-1">
                <OutputRow label="File" value={encoded.name} mono={false} copyable={false} />
                <OutputRow label="MIME" value={encoded.mime} />
                <OutputRow label="Original size" value={formatBytes(encoded.size)} hint={`Base64: ${formatBytes(encoded.base64.length)} (+${Math.round(((encoded.base64.length - encoded.size) / encoded.size) * 100)}%)`} copyable={false} />
              </OutputGrid>
              <Dropzone onFile={onFile} compact className="mt-3" title="Drop, paste or click to replace" description="" />
            </>
          ) : (
            <Dropzone onFile={onFile} title="Drop an image to encode" />
          )}
          {busy ? <p className="mt-3 text-center text-xs text-fg-muted">Encoding…</p> : null}
          {error ? <ErrorState title="Couldn't encode" description={error} className="mt-4" /> : null}
          <p className="mt-3 text-center text-[11px] text-fg-subtle">Encoded in memory; nothing is uploaded.</p>
        </Card>

        <Card className="shadow-card lg:col-span-3">
          <CardHeader
            title="Output"
            description="Base64 is about 33% larger than the binary. Inline only small assets."
            actions={
              encoded ? (
                <>
                  <Button size="sm" onClick={() => downloadBlob(new Blob([encoded.dataUrl], { type: "text/plain" }), `${encoded.name}.dataurl.txt`)}>
                    <Download className="h-3.5 w-3.5" /> .txt
                  </Button>
                </>
              ) : null
            }
          />
          {encoded ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">Data URL</Label>
                  <CopyButton value={encoded.dataUrl} variant="primary" />
                </div>
                <Textarea readOnly value={encoded.dataUrl} className="min-h-[120px] bg-surface text-[11px]" aria-label="Data URL" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="mb-0">Raw Base64</Label>
                  <CopyButton value={encoded.base64} />
                </div>
                <Textarea readOnly value={encoded.base64} className="min-h-[120px] bg-surface text-[11px]" aria-label="Raw Base64" />
              </div>
              <OutputGrid>
                <OutputRow label="CSS" value={`background-image: url("${encoded.dataUrl.slice(0, 40)}…");`} copyable={false} hint="Copy the data URL above and paste it inside url()" />
                <OutputRow label="HTML" value={`<img src="data:${encoded.mime};base64,…">`} copyable={false} />
              </OutputGrid>
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">Drop an image on the left to get its Base64 and data URL.</p>
          )}
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader title="Decode a data URL" description="Paste a data:image/…;base64,… string to preview it. Only image MIME types are rendered." actions={decodeInput ? <Button size="sm" variant="ghost" onClick={() => setDecodeInput("")}>Clear</Button> : null} />
        <Textarea value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)} placeholder="data:image/png;base64,iVBORw0KGgo…" className="min-h-[100px] text-[11px]" invalid={decoded ? !decoded.ok : false} aria-label="Data URL to decode" />
        {decoded && !decoded.ok ? (
          <Alert tone="danger" className="mt-3">
            {decoded.error}
          </Alert>
        ) : null}
        {decoded?.ok ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[auto_1fr]">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Decoded preview" className="max-h-64 max-w-full rounded-lg border bg-bg-elevated object-contain md:max-w-xs" />
            ) : (
              <Alert tone="warning">Payload is {decoded.value.mime || "of unknown type"}; not an image, so it is not rendered.</Alert>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="accent">{decoded.value.mime || "unknown"}</Badge>
                <Badge>{formatBytes(decoded.value.bytes)} decoded</Badge>
              </div>
              {previewUrl ? (
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    const bin = atob(decoded.value.base64);
                    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                    const ext = decoded.value.mime.split("/")[1]?.replace("+xml", "").replace("jpeg", "jpg") || "bin";
                    // Always octet-stream: a same-origin blob typed image/svg+xml could otherwise be opened as a document.
                    downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), `decoded.${ext}`);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Download image
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
