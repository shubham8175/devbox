"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Link2, Unlink2, X } from "lucide-react";
import { canEncodeWebP, checkOutputSize, downloadBlob, baseName, FORMAT_EXT, FORMAT_LABELS, MAX_OUTPUT_SIDE, renderImage, type OutputFormat } from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/image";
import { useDebounced } from "@/hooks/use-debounced";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSourceImage, CHECKER_STYLE } from "@/components/tools/image-source";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";

type Mode = "pixels" | "percent";
const PRESETS = [
  { label: "Thumbnail", w: 256 },
  { label: "Small", w: 640 },
  { label: "Medium", w: 1024 },
  { label: "HD", w: 1920 },
  { label: "2K", w: 2560 },
];
const PERCENTS = [25, 50, 75, 150, 200];
const MAX_SIDE = MAX_OUTPUT_SIDE;

interface Output {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  key: string;
}

export function ImageResizeTool() {
  const hydrated = useHydrated();
  const { image, error, loading, load, clear, tooLarge } = useSourceImage();
  const [mode, setMode] = useState<Mode>("pixels");
  const [width, setWidth] = useState<string | null>(null);
  const [height, setHeight] = useState<string | null>(null);
  const [percent, setPercent] = useState("50");
  const [locked, setLocked] = useState(true);
  const [format, setFormat] = useState<OutputFormat | "auto">("auto");
  const [quality, setQuality] = useState(90);
  const [output, setOutput] = useState<Output | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const webp = hydrated && canEncodeWebP();

  const ratio = image ? image.width / image.height : 1;
  const wStr = width ?? (image ? String(image.width) : "");
  const hStr = height ?? (image ? String(image.height) : "");

  const target = useMemo(() => {
    if (!image) return null;
    if (mode === "percent") {
      const p = Number(percent);
      if (!Number.isFinite(p) || p <= 0) return null;
      return { w: Math.max(1, Math.round((image.width * p) / 100)), h: Math.max(1, Math.round((image.height * p) / 100)) };
    }
    const w = Number(wStr);
    const h = Number(hStr);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
    return { w: Math.round(w), h: Math.round(h) };
  }, [image, mode, percent, wStr, hStr]);

  const sizeError = target ? checkOutputSize(target.w, target.h) : null;
  const tooBig = sizeError !== null;
  const debouncedTarget = useDebounced(target, 200);
  const debouncedQuality = useDebounced(quality, 150);

  const outFormat: OutputFormat = format === "auto" ? (image?.file.type === "image/jpeg" ? "image/jpeg" : image?.file.type === "image/webp" && webp ? "image/webp" : "image/png") : format;
  const renderable = !!image && !!debouncedTarget && checkOutputSize(debouncedTarget.w, debouncedTarget.h) === null;
  const renderKey = renderable ? `${image.url}|${debouncedTarget.w}x${debouncedTarget.h}|${outFormat}|${debouncedQuality}` : "";
  const processing = renderable && !encodeError && output?.key !== renderKey;

  useEffect(() => {
    if (!image || !debouncedTarget || checkOutputSize(debouncedTarget.w, debouncedTarget.h) !== null) return;
    let cancelled = false;
    const key = renderKey;
    renderImage(image.source, image.width, image.height, { width: debouncedTarget.w, height: debouncedTarget.h, format: outFormat, quality: debouncedQuality / 100 })
      .then((blob) => {
        if (cancelled) return;
        setOutput((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob), width: debouncedTarget.w, height: debouncedTarget.h, key };
        });
        setEncodeError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setEncodeError(e instanceof Error ? e.message : "Resize failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [image, debouncedTarget, outFormat, debouncedQuality, renderKey]);

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

  const onWidth = (v: string) => {
    setWidth(v);
    if (locked && image) {
      const n = Number(v);
      setHeight(Number.isFinite(n) && n > 0 ? String(Math.max(1, Math.round(n / ratio))) : hStr);
    }
  };
  const onHeight = (v: string) => {
    setHeight(v);
    if (locked && image) {
      const n = Number(v);
      setWidth(Number.isFinite(n) && n > 0 ? String(Math.max(1, Math.round(n * ratio))) : wStr);
    }
  };

  const reset = () => {
    clear();
    setWidth(null);
    setHeight(null);
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  if (!image) {
    return (
      <Card className="surface-gradient shadow-card">
        <Dropzone onFile={load} title="Drop an image to resize" />
        {loading ? <p className="mt-3 text-center text-xs text-fg-muted">Decoding…</p> : null}
        {error ? <ErrorState title="Couldn't read that image" description={error} className="mt-4" /> : null}
        <p className="mt-3 text-center text-[11px] text-fg-subtle">Resampled with the Canvas API in your browser. Nothing is uploaded.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tooLarge ? <Alert tone="warning">Very large source image; resizing may be slow.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:self-start">
          <CardHeader
            title="Size"
            description={`Original ${image.width} × ${image.height}`}
            actions={
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            }
          />
          <div className="space-y-4">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "pixels", label: "Pixels" },
                { value: "percent", label: "Percent" },
              ]}
              className="w-full [&>button]:flex-1"
            />
            {mode === "pixels" ? (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="ir-w">Width</Label>
                    <Input id="ir-w" mono type="number" min={1} max={MAX_SIDE} value={wStr} onChange={(e) => onWidth(e.target.value)} />
                  </div>
                  <Button size="icon" variant={locked ? "primary" : "secondary"} onClick={() => setLocked((l) => !l)} aria-pressed={locked} aria-label={locked ? "Unlock aspect ratio" : "Lock aspect ratio"} title={locked ? "Aspect ratio locked" : "Aspect ratio unlocked"} className="mb-0.5">
                    {locked ? <Link2 className="h-3.5 w-3.5" /> : <Unlink2 className="h-3.5 w-3.5" />}
                  </Button>
                  <div className="flex-1">
                    <Label htmlFor="ir-h">Height</Label>
                    <Input id="ir-h" mono type="number" min={1} max={MAX_SIDE} value={hStr} onChange={(e) => onHeight(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => onWidth(String(p.w))} className="rounded-md border bg-bg-elevated px-2 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
                      {p.label} <span className="font-mono text-fg-subtle">{p.w}w</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="ir-pct" hint={target ? `${target.w} × ${target.h}` : undefined}>
                    Scale (%)
                  </Label>
                  <Input id="ir-pct" mono type="number" min={1} max={1000} value={percent} onChange={(e) => setPercent(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PERCENTS.map((p) => (
                    <button key={p} type="button" onClick={() => setPercent(String(p))} className="rounded-md border bg-bg-elevated px-2 py-1 font-mono text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
                      {p}%
                    </button>
                  ))}
                </div>
              </>
            )}
            {!target ? <Alert tone="danger">Enter positive dimensions.</Alert> : tooBig ? <Alert tone="danger">{sizeError}</Alert> : null}
            <div>
              <Label htmlFor="ir-format">Format</Label>
              <Select id="ir-format" value={format} onChange={(e) => setFormat(e.target.value as OutputFormat | "auto")}>
                <option value="auto">Same as source</option>
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPEG</option>
                <option value="image/webp" disabled={!webp}>
                  WebP{webp ? "" : " (unsupported here)"}
                </option>
              </Select>
            </div>
            {outFormat !== "image/png" ? (
              <div>
                <Label htmlFor="ir-quality" hint={String(quality)}>
                  Quality
                </Label>
                <input id="ir-quality" type="range" min={1} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-accent" />
              </div>
            ) : null}
            <Button variant="primary" className="w-full" disabled={!output || processing} onClick={() => output && downloadBlob(output.blob, `${baseName(image.file.name)}-${output.width}x${output.height}.${FORMAT_EXT[outFormat]}`)}>
              <Download className="h-3.5 w-3.5" /> Download {output ? formatBytes(output.blob.size) : ""}
            </Button>
          </div>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader
            title="Preview"
            actions={
              <>
                {processing ? <Badge>Processing…</Badge> : output ? <Badge tone="accent">{output.width} × {output.height} · {FORMAT_LABELS[outFormat]}</Badge> : null}
              </>
            }
          />
          {encodeError ? (
            <Alert tone="danger" className="mb-3">
              {encodeError}
            </Alert>
          ) : null}
          <div className="overflow-hidden rounded-lg border" style={CHECKER_STYLE}>
            {output ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={output.url} alt="Resized preview" className="mx-auto block max-h-[60vh] max-w-full object-contain" style={{ opacity: processing ? 0.6 : 1 }} />
            ) : (
              <div className="h-64 skeleton" />
            )}
          </div>
          <OutputGrid className="mt-3 sm:grid-cols-3">
            <OutputRow label="Original" value={`${image.width} × ${image.height} · ${formatBytes(image.file.size)}`} copyable={false} />
            <OutputRow label="Resized" value={output ? `${output.width} × ${output.height} · ${formatBytes(output.blob.size)}` : ""} copyable={false} />
            <OutputRow label="Scale" value={output ? `${((output.width / image.width) * 100).toFixed(1)}%` : ""} copyable={false} />
          </OutputGrid>
          <Dropzone onFile={load} compact className="mt-4" title="Drop, paste or click to replace" description="" />
        </Card>
      </div>
    </div>
  );
}
