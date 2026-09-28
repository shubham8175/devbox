"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { ExternalLink, X } from "lucide-react";
import { imageDataFrom, loadImageFile, type LoadedImage } from "@/lib/tools/image";
import { classifyPayload, parseWifiPayload } from "@/lib/tools/qr";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

interface Decoded {
  text: string;
  version: number;
}

export function QrReaderTool() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setDecoded(null);
    try {
      const loaded = await loadImageFile(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return loaded;
      });
      // Try at a few scales: tiny screenshots and huge photos both trip up detection.
      // Full resolution is attempted last and only for images that fit comfortably in memory.
      const attempts = [1200, 600, 2400];
      if (loaded.width * loaded.height <= 12_000_000) attempts.push(0);
      let result: ReturnType<typeof jsQR> = null;
      for (const max of attempts) {
        const data = imageDataFrom(loaded.bitmap, max);
        result = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
        if (result?.data) break;
      }
      if (result?.data) setDecoded({ text: result.data, version: result.version });
      else setError("No QR code found. Try a sharper, larger or better-lit image, and make sure the whole code (including the quiet zone) is visible.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image.");
    } finally {
      setBusy(false);
    }
  }, []);

  const imageRef = useRef<LoadedImage | null>(null);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);
  useEffect(() => {
    return () => {
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.url);
    };
  }, []);

  const clear = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
    setDecoded(null);
    setError(null);
  };

  const kind = decoded ? classifyPayload(decoded.text) : null;
  const wifi = decoded ? parseWifiPayload(decoded.text) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="surface-gradient shadow-card lg:col-span-2">
          <CardHeader
            title="Image"
            actions={
              image ? (
                <Button size="sm" variant="ghost" onClick={clear}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              ) : null
            }
          />
          {image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="QR code source" className="max-h-[50vh] w-full rounded-lg border bg-bg-elevated object-contain" />
              <Dropzone onFile={onFile} compact className="mt-3" title="Drop, paste or click to scan another" description="" />
            </>
          ) : (
            <Dropzone onFile={onFile} title="Drop a QR code image" description={<>or <span className="text-accent-strong">click to upload</span> · or paste a screenshot (⌘V)</>} />
          )}
          {busy ? <p className="mt-3 text-center text-xs text-fg-muted">Scanning…</p> : null}
          <p className="mt-3 text-center text-[11px] text-fg-subtle">Decoded with jsQR on a local canvas. The image is never uploaded.</p>
        </Card>

        <Card className="shadow-card lg:col-span-3">
          <CardHeader
            title="Decoded content"
            description={decoded ? `QR version ${decoded.version} · ${decoded.text.length} characters` : undefined}
            actions={
              decoded ? (
                <>
                  <Badge tone="accent">{kind?.label}</Badge>
                  <CopyButton value={decoded.text} label="Copy result" variant="primary" />
                </>
              ) : null
            }
          />
          {error ? <ErrorState title="Nothing decoded" description={error} /> : null}
          {!decoded && !error ? <p className="text-sm text-fg-subtle">The decoded text will appear here.</p> : null}
          {decoded ? (
            <div className="space-y-4">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-sm">{decoded.text}</pre>

              {kind?.kind === "url" && kind.href ? (
                <Alert tone="info">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      This looks like a link to <span className="font-mono text-fg">{safeHost(kind.href)}</span>. It was not opened automatically.
                    </span>
                    <a
                      href={kind.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 rounded-md border bg-surface px-2 py-1 text-xs font-medium text-fg transition-colors hover:border-border-strong"
                    >
                      Open in new tab <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </Alert>
              ) : null}

              {wifi ? (
                <OutputGrid>
                  <OutputRow label="SSID" value={wifi.ssid ?? ""} />
                  <OutputRow label="Password" value={wifi.password ?? ""} placeholder="(none)" />
                  <OutputRow label="Security" value={wifi.security ?? ""} />
                  <OutputRow label="Hidden" value={wifi.hidden ? "Yes" : "No"} mono={false} copyable={false} />
                </OutputGrid>
              ) : null}

              {(kind?.kind === "email" || kind?.kind === "phone") && kind.href ? (
                <a href={kind.href} rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-strong hover:underline">
                  Open with default app <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function safeHost(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}
