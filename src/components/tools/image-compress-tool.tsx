"use client";

import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { canEncodeWebP, downloadBlob, baseName, FORMAT_EXT, FORMAT_LABELS, renderImage, savedPercent, type OutputFormat } from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/image";
import { useDebounced } from "@/hooks/use-debounced";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSourceImage, CHECKER_STYLE } from "@/components/tools/image-source";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

interface Output {
  blob: Blob;
  url: string;
  format: OutputFormat;
  /** Settings this output was rendered with; a mismatch means a re-encode is in flight */
  key: string;
}

function defaultFormat(mime: string): OutputFormat {
  if (mime === "image/jpeg") return "image/jpeg";
  if (mime === "image/webp") return "image/webp";
  return "image/png";
}

export function ImageCompressTool() {
  const hydrated = useHydrated();
  const { image, error, loading, load, clear, tooLarge } = useSourceImage();
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<OutputFormat | null>(null);
  const [background, setBackground] = useState("#ffffff");
  const [output, setOutput] = useState<Output | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const debouncedQuality = useDebounced(quality, 150);
  const webp = hydrated && canEncodeWebP();

  const effectiveFormat: OutputFormat = format ?? (image ? defaultFormat(image.file.type) : "image/png");
  const lossy = effectiveFormat !== "image/png";
  const renderKey = image ? `${image.url}|${effectiveFormat}|${debouncedQuality}|${background}` : "";
  const processing = !!image && !encodeError && output?.key !== renderKey;

  // Re-encode when the source or settings change. All async; state is set from promise callbacks.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const key = renderKey;
    renderImage(image.source, image.width, image.height, {
      width: image.width,
      height: image.height,
      format: effectiveFormat,
      quality: debouncedQuality / 100,
      background: effectiveFormat === "image/jpeg" ? background : undefined,
    })
      .then((blob) => {
        if (cancelled) return;
        setOutput((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob), format: effectiveFormat, key };
        });
        setEncodeError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setEncodeError(e instanceof Error ? e.message : "Encoding failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [image, effectiveFormat, debouncedQuality, background, renderKey]);

  // Track the latest output in a ref so the unmount cleanup revokes the current URL, not the first one.
  const outputRef = useRef<Output | null>(null);
  useEffect(() => {
    outputRef.current = output;
  }, [output]);
  useEffect(() => {
    return () => {
      if (outputRef.current) URL.revokeObjectURL(outputRef.current.url);
    };
  }, []);

  const reset = () => {
    clear();
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setFormat(null);
  };

  const saved = image && output ? savedPercent(image.file.size, output.blob.size) : 0;

  if (!image) {
    return (
      <Card className="surface-gradient shadow-card">
        <Dropzone onFile={load} title="Drop an image to compress" description={<>PNG, JPEG or WebP · or <span className="text-accent-strong">click to upload</span> · or paste</>} />
        {loading ? <p className="mt-3 text-center text-xs text-fg-muted">Decoding…</p> : null}
        {error ? <ErrorState title="Couldn't read that image" description={error} className="mt-4" /> : null}
        <p className="mt-3 text-center text-[11px] text-fg-subtle">Re-encoded with the Canvas API in your browser. Nothing is uploaded.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tooLarge ? <Alert tone="warning">This image is {(image.width * image.height / 1e6).toFixed(0)} megapixels. Encoding may be slow or fail in some browsers.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-1 lg:self-start">
          <CardHeader
            title="Settings"
            actions={
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            }
          />
          <div className="space-y-4">
            <div>
              <Label>Output format</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["image/png", "image/jpeg", "image/webp"] as OutputFormat[]).map((f) => {
                  const disabled = f === "image/webp" && !webp;
                  return (
                    <button
                      key={f}
                      type="button"
                      disabled={disabled}
                      onClick={() => setFormat(f)}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                        effectiveFormat === f ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                      )}
                      title={disabled ? "This browser cannot encode WebP" : undefined}
                    >
                      {FORMAT_LABELS[f]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-fg-subtle">
                {effectiveFormat === "image/png" ? "PNG is lossless; the quality slider has no effect. Switch to WebP or JPEG for smaller files." : effectiveFormat === "image/jpeg" ? "JPEG drops transparency; choose a background colour below." : "WebP keeps transparency and usually beats JPEG at the same quality."}
              </p>
            </div>
            <div>
              <Label htmlFor="ic-quality" hint={lossy ? `${quality}` : "n/a for PNG"}>
                Quality
              </Label>
              <input id="ic-quality" type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} disabled={!lossy} className="w-full accent-accent disabled:opacity-40" />
            </div>
            {effectiveFormat === "image/jpeg" ? (
              <div>
                <Label htmlFor="ic-bg">Background (replaces transparency)</Label>
                <div className="flex items-center gap-2">
                  <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
                    <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Background colour" />
                    <span className="block h-full w-full" style={{ backgroundColor: background }} />
                  </label>
                  <span className="font-mono text-xs text-fg-muted">{background}</span>
                </div>
              </div>
            ) : null}
            <Button variant="primary" className="w-full" disabled={!output || processing} onClick={() => output && downloadBlob(output.blob, `${baseName(image.file.name)}-compressed.${FORMAT_EXT[output.format]}`)}>
              <Download className="h-3.5 w-3.5" /> Download {output ? formatBytes(output.blob.size) : ""}
            </Button>
          </div>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader
            title="Result"
            actions={
              output ? (
                <Badge tone={saved > 0 ? "success" : "warning"}>
                  {saved > 0 ? `${saved.toFixed(1)}% smaller` : `${Math.abs(saved).toFixed(1)}% larger`}
                </Badge>
              ) : null
            }
          />
          <OutputGrid className="sm:grid-cols-3">
            <OutputRow label="Original" value={`${formatBytes(image.file.size)} · ${image.format}`} copyable={false} />
            <OutputRow label="Compressed" value={output ? `${formatBytes(output.blob.size)} · ${FORMAT_LABELS[output.format]}` : ""} copyable={false} placeholder={processing ? "Processing…" : "—"} />
            <OutputRow label="Dimensions" value={`${image.width} × ${image.height}`} copyable={false} />
          </OutputGrid>
          {encodeError ? (
            <Alert tone="danger" className="mt-3">
              {encodeError}
            </Alert>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <figure>
              <figcaption className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Original</figcaption>
              <div className="overflow-hidden rounded-lg border" style={CHECKER_STYLE}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="Original" className="block max-h-[50vh] w-full object-contain" />
              </div>
            </figure>
            <figure>
              <figcaption className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Compressed {processing ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" /> : null}
              </figcaption>
              <div className={cn("overflow-hidden rounded-lg border transition-opacity", processing && "opacity-60")} style={CHECKER_STYLE}>
                {output ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={output.url} alt="Compressed" className="block max-h-[50vh] w-full object-contain" />
                ) : (
                  <div className="h-48 skeleton" />
                )}
              </div>
            </figure>
          </div>
          <Dropzone onFile={load} compact className="mt-4" title="Drop, paste or click to replace" description="" />
        </Card>
      </div>
    </div>
  );
}
