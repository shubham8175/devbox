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
  key: string;
}

export function ImageConvertTool() {
  const hydrated = useHydrated();
  const { image, error, loading, load, clear, tooLarge } = useSourceImage();
  const [format, setFormat] = useState<OutputFormat>("image/webp");
  const [quality, setQuality] = useState(85);
  const [background, setBackground] = useState("#ffffff");
  const [output, setOutput] = useState<Output | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const debouncedQuality = useDebounced(quality, 150);
  const webp = hydrated && canEncodeWebP();
  const effective: OutputFormat = format === "image/webp" && hydrated && !webp ? "image/png" : format;
  const renderKey = image ? `${image.url}|${effective}|${debouncedQuality}|${background}` : "";
  const processing = !!image && !encodeError && output?.key !== renderKey;

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const key = renderKey;
    renderImage(image.source, image.width, image.height, { width: image.width, height: image.height, format: effective, quality: debouncedQuality / 100, background: effective === "image/jpeg" ? background : undefined })
      .then((blob) => {
        if (cancelled) return;
        setOutput((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob), format: effective, key };
        });
        setEncodeError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setEncodeError(e instanceof Error ? e.message : "Conversion failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [image, effective, debouncedQuality, background, renderKey]);

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
  };

  if (!image) {
    return (
      <Card className="surface-gradient shadow-card">
        <Dropzone onFile={load} title="Drop an image to convert" description={<>Any format the browser can decode · output PNG, JPEG or WebP · or <span className="text-accent-strong">click to upload</span></>} />
        {loading ? <p className="mt-3 text-center text-xs text-fg-muted">Decoding…</p> : null}
        {error ? <ErrorState title="Couldn't read that image" description={error} className="mt-4" /> : null}
        <p className="mt-3 text-center text-[11px] text-fg-subtle">Converted with the Canvas API in your browser. Nothing is uploaded.</p>
      </Card>
    );
  }

  const delta = output ? savedPercent(image.file.size, output.blob.size) : 0;

  return (
    <div className="space-y-4">
      {tooLarge ? <Alert tone="warning">Very large source image; conversion may be slow.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:self-start">
          <CardHeader
            title="Target"
            actions={
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            }
          />
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5">
              {(["image/png", "image/jpeg", "image/webp"] as OutputFormat[]).map((f) => {
                const disabled = f === "image/webp" && hydrated && !webp;
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={disabled}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                      effective === f ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                    title={disabled ? "This browser cannot encode WebP" : undefined}
                  >
                    {FORMAT_LABELS[f]}
                  </button>
                );
              })}
            </div>
            {hydrated && !webp ? <Alert tone="warning">This browser can&apos;t encode WebP, so PNG is used instead.</Alert> : null}
            {effective !== "image/png" ? (
              <div>
                <Label htmlFor="icv-quality" hint={String(quality)}>
                  Quality
                </Label>
                <input id="icv-quality" type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-accent" />
              </div>
            ) : (
              <p className="text-[11px] text-fg-subtle">PNG is lossless and keeps transparency.</p>
            )}
            {effective === "image/jpeg" ? (
              <div>
                <Label>Background (JPEG has no transparency)</Label>
                <div className="flex items-center gap-2">
                  <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
                    <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Background colour" />
                    <span className="block h-full w-full" style={{ backgroundColor: background }} />
                  </label>
                  <span className="font-mono text-xs text-fg-muted">{background}</span>
                </div>
              </div>
            ) : null}
            <Button variant="primary" className="w-full" disabled={!output || processing} onClick={() => output && downloadBlob(output.blob, `${baseName(image.file.name)}.${FORMAT_EXT[output.format]}`)}>
              <Download className="h-3.5 w-3.5" /> Download {output ? FORMAT_LABELS[output.format] : ""}
            </Button>
          </div>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader title="Result" actions={output ? <Badge tone={delta >= 0 ? "success" : "warning"}>{delta >= 0 ? `${delta.toFixed(1)}% smaller` : `${Math.abs(delta).toFixed(1)}% larger`}</Badge> : null} />
          <OutputGrid className="sm:grid-cols-2">
            <OutputRow label="Original" value={`${image.format} · ${formatBytes(image.file.size)}`} copyable={false} />
            <OutputRow label="Converted" value={output ? `${FORMAT_LABELS[output.format]} · ${formatBytes(output.blob.size)}` : ""} placeholder={processing ? "Processing…" : "—"} copyable={false} />
          </OutputGrid>
          {encodeError ? (
            <Alert tone="danger" className="mt-3">
              {encodeError}
            </Alert>
          ) : null}
          <div className={cn("mt-4 overflow-hidden rounded-lg border transition-opacity", processing && "opacity-60")} style={CHECKER_STYLE}>
            {output ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={output.url} alt="Converted preview" className="mx-auto block max-h-[55vh] max-w-full object-contain" />
            ) : (
              <div className="h-64 skeleton" />
            )}
          </div>
          <Dropzone onFile={load} compact className="mt-4" title="Drop, paste or click to replace" description="" />
        </Card>
      </div>
    </div>
  );
}
