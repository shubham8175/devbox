"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pipette, X } from "lucide-react";
import { describePixel, extractPalette, imageDataFrom, loadImageFile, formatBytes, type LoadedImage, type PaletteColor } from "@/lib/tools/image";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColorSwatch } from "@/components/ui/color-swatch";
import { ErrorState } from "@/components/ui/error-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { useToast } from "@/components/ui/toast";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

interface Picked {
  x: number;
  y: number;
  hex: string;
  rgb: string;
  hsl: string;
}

const MAG_SIZE = 120;
const MAG_ZOOM = 8;
/** Largest side of the pixel buffer used for picking; keeps memory bounded on huge photos. */
const PICK_MAX_SIDE = 4096;

export function ImageColorTool() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pixels, setPixels] = useState<ImageData | null>(null);
  const [palette, setPalette] = useState<ReturnType<typeof extractPalette> | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const magRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setBusy(true);
    setPicked(null);
    try {
      const loaded = await loadImageFile(file);
      // Pick from a bounded pixel buffer (≤ PICK_MAX_SIDE per side, ~64 MB worst case) rather than the full bitmap.
      let full: ImageData;
      let sampled: ImageData;
      try {
        full = imageDataFrom(loaded.bitmap, PICK_MAX_SIDE);
        sampled = Math.max(full.width, full.height) > 400 ? imageDataFrom(loaded.bitmap, 400) : full;
      } catch (e) {
        URL.revokeObjectURL(loaded.url);
        throw e;
      }
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return loaded;
      });
      setPixels(full);
      setPalette(extractPalette(sampled, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load image.");
      setImage(null);
      setPixels(null);
      setPalette(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Release the current object URL on unmount (tracked in a ref so the cleanup is never stale)
  const imageRef = useRef<LoadedImage | null>(null);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);
  useEffect(() => {
    return () => {
      if (imageRef.current) URL.revokeObjectURL(imageRef.current.url);
    };
  }, []);

  // Build the magnifier's source canvas once per image instead of on every mouse move
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!pixels) {
      srcCanvasRef.current = null;
      return;
    }
    const src = document.createElement("canvas");
    src.width = pixels.width;
    src.height = pixels.height;
    src.getContext("2d")?.putImageData(pixels, 0, 0);
    srcCanvasRef.current = src;
    return () => {
      srcCanvasRef.current = null;
    };
  }, [pixels]);

  const pixelAt = useCallback(
    (x: number, y: number) => {
      if (!pixels) return null;
      const i = (y * pixels.width + x) * 4;
      return { r: pixels.data[i], g: pixels.data[i + 1], b: pixels.data[i + 2], a: 1 };
    },
    [pixels],
  );

  const toImageCoords = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = imgRef.current;
    if (!el || !image) return null;
    const rect = el.getBoundingClientRect();
    const w = pixels?.width ?? image.width;
    const h = pixels?.height ?? image.height;
    const x = Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * h)));
    return { x, y, cx: e.clientX - rect.left, cy: e.clientY - rect.top, rect };
  };

  const onClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const c = toImageCoords(e);
    if (!c) return;
    const rgb = pixelAt(c.x, c.y);
    if (!rgb) return;
    const d = describePixel(rgb);
    setPicked({ x: c.x, y: c.y, ...d });
    toast(`Picked ${d.hex}`, "info");
  };

  const onMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const c = toImageCoords(e);
    if (!c) return;
    setHover({ x: c.x, y: c.y, cx: c.cx, cy: c.cy });
  };

  // Draw magnifier
  useEffect(() => {
    const canvas = magRef.current;
    if (!canvas || !hover || !pixels) return;
    const ctx = canvas.getContext("2d");
    const src = srcCanvasRef.current;
    if (!ctx || !src) return;
    const half = MAG_SIZE / MAG_ZOOM / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);
    ctx.drawImage(src, hover.x - half + 0.5, hover.y - half + 0.5, half * 2, half * 2, 0, 0, MAG_SIZE, MAG_SIZE);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(MAG_SIZE / 2 - MAG_ZOOM / 2, MAG_SIZE / 2 - MAG_ZOOM / 2, MAG_ZOOM, MAG_ZOOM);
  }, [hover, pixels]);

  const hoverColor = useMemo(() => {
    if (!hover) return null;
    const rgb = pixelAt(hover.x, hover.y);
    return rgb ? describePixel(rgb) : null;
  }, [hover, pixelAt]);

  const clear = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
    setPixels(null);
    setPalette(null);
    setPicked(null);
    setHover(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      {!image ? (
        <Card className="surface-gradient shadow-card">
          <Dropzone onFile={onFile} title="Drop an image to pick colors from" />
          {busy ? <p className="mt-3 text-center text-xs text-fg-muted">Decoding image…</p> : null}
          {error ? <ErrorState title="Couldn't read that image" description={error} className="mt-4" /> : null}
          <p className="mt-3 text-center text-[11px] text-fg-subtle">Images are decoded with the Canvas API and never leave this tab.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="shadow-card lg:col-span-3">
            <CardHeader
              title="Image"
              description={`${image.width} × ${image.height} px · ${formatBytes(image.file.size)} · click anywhere to pick`}
              actions={
                <Button size="sm" variant="ghost" onClick={clear}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              }
            />
            <div
              className="relative overflow-hidden rounded-lg border bg-bg-elevated"
              style={{
                backgroundImage: "linear-gradient(45deg, #80808018 25%, transparent 25%), linear-gradient(-45deg, #80808018 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808018 75%), linear-gradient(-45deg, transparent 75%, #80808018 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={image.url}
                alt="Uploaded"
                onClick={onClick}
                onMouseMove={onMove}
                onMouseLeave={() => setHover(null)}
                className="block max-h-[70vh] w-full cursor-crosshair object-contain select-none"
                draggable={false}
              />
              {hover && hoverColor ? (
                <div
                  className="pointer-events-none absolute z-10 overflow-hidden rounded-full border-2 border-white shadow-xl"
                  style={{ left: hover.cx + 16, top: hover.cy + 16, width: MAG_SIZE, height: MAG_SIZE }}
                >
                  <canvas ref={magRef} width={MAG_SIZE} height={MAG_SIZE} className="block" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center font-mono text-[10px] text-white">{hoverColor.hex}</div>
                </div>
              ) : null}
            </div>
            <Dropzone onFile={onFile} compact className="mt-3" title="Drop, paste or click to replace" description="PNG, JPEG, WebP, GIF, SVG…" />
          </Card>

          <div className="space-y-4 lg:col-span-2">
            <Card className="shadow-card">
              <CardHeader title="Picked color" description={picked ? `Pixel (${picked.x}, ${picked.y})` : "Click the image to sample a pixel."} />
              {picked ? (
                <div className="space-y-3">
                  <div className="h-16 rounded-lg border" style={{ backgroundColor: picked.hex }} />
                  <OutputGrid className="sm:grid-cols-1">
                    <OutputRow label="HEX" value={picked.hex} />
                    <OutputRow label="RGB" value={picked.rgb} />
                    <OutputRow label="HSL" value={picked.hsl} />
                  </OutputGrid>
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-fg-muted">
                  <Pipette className="h-4 w-4 text-fg-subtle" />
                  Hover for a magnifier, click to lock a color.
                </div>
              )}
            </Card>

            {palette ? (
              <Card className="shadow-card">
                <CardHeader title="Dominant color" actions={palette.dominant ? <Badge tone="accent">{Math.round(palette.dominant.share * 100)}% of pixels</Badge> : null} />
                {palette.dominant ? <ColorSwatch hex={palette.dominant.hex} sublabel={palette.dominant.rgb ? `rgb(${palette.dominant.rgb.r}, ${palette.dominant.rgb.g}, ${palette.dominant.rgb.b})` : undefined} size="md" /> : <p className="text-xs text-fg-subtle">Image is fully transparent.</p>}
              </Card>
            ) : null}
          </div>

          {palette ? (
            <>
              <PaletteCard title="Top 5 colors" description="Most frequent colours by pixel count." colors={palette.top} className="lg:col-span-5" showShare />
              <PaletteCard title="Palette" description="Distinct hues that represent the image." colors={palette.palette} className="lg:col-span-5" />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PaletteCard({ title, description, colors, className, showShare }: { title: string; description: string; colors: PaletteColor[]; className?: string; showShare?: boolean }) {
  const all = colors.map((c) => c.hex).join(", ");
  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader title={title} description={description} actions={<CopyButton value={all} label="Copy all" />} />
      {colors.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-8">
          {colors.map((c, i) => (
            <ColorSwatch key={`${c.hex}-${i}`} hex={c.hex} size="sm" sublabel={showShare ? `${(c.share * 100).toFixed(1)}%` : `rgb(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b})`} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">No opaque pixels found.</p>
      )}
    </Card>
  );
}

