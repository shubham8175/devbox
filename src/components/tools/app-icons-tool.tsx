"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Download, X } from "lucide-react";
import { downloadBlob, renderImage } from "@/lib/tools/canvas";
import { formatBytes } from "@/lib/tools/image";
import { headSnippet, ICON_SPECS, manifestSnippet, MASKABLE_SAFE_ZONE, PLATFORM_LABELS, squareCrop, type IconPlatform, type IconSpec } from "@/lib/tools/app-icons";
import { zipBlob, type ZipEntry } from "@/lib/tools/zip";
import { useDebounced } from "@/hooks/use-debounced";
import { useSourceImage, CHECKER_STYLE } from "@/components/tools/image-source";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Generated {
  spec: IconSpec;
  blob: Blob;
  url: string;
}

const PLATFORMS: IconPlatform[] = ["web", "ios", "android"];
/** Largest icon size in ICON_SPECS; the master render is never bigger than this. */
const MASTER_SIZE = 1024;

/** Render one icon: optional centre crop, optional opaque background, optional maskable padding. */
async function renderIcon(image: { source: ImageBitmap | HTMLImageElement; width: number; height: number }, spec: IconSpec, background: string): Promise<Blob> {
  const crop = squareCrop(image.width, image.height);
  if (!spec.maskable) {
    return renderImage(image.source, image.width, image.height, { width: spec.size, height: spec.size, format: "image/png", background: spec.opaque ? background : undefined, crop });
  }
  // Maskable: draw the icon scaled into the safe zone over a solid background.
  const inner = await renderImage(image.source, image.width, image.height, { width: Math.round(spec.size * MASKABLE_SAFE_ZONE), height: Math.round(spec.size * MASKABLE_SAFE_ZONE), format: "image/png", crop });
  const bitmap = await createImageBitmap(inner);
  const canvas = document.createElement("canvas");
  canvas.width = spec.size;
  canvas.height = spec.size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable.");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, spec.size, spec.size);
  const offset = Math.round((spec.size - bitmap.width) / 2);
  ctx.drawImage(bitmap, offset, offset);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode icon.");
  return blob;
}

export function AppIconsTool() {
  const { image, error, loading, load, clear } = useSourceImage();
  const [background, setBackground] = useState("#0b0c0f");
  const [platforms, setPlatforms] = useState<Set<IconPlatform>>(new Set(PLATFORMS));
  const [icons, setIcons] = useState<{ key: string; items: Generated[] }>({ key: "", items: [] });
  const [genError, setGenError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const debouncedBackground = useDebounced(background, 200);
  const { toast } = useToast();

  const specs = useMemo(() => ICON_SPECS.filter((s) => platforms.has(s.platform)), [platforms]);
  const renderKey = image ? `${image.url}|${Array.from(platforms).sort().join(",")}|${debouncedBackground}` : "";
  const processing = !!image && !genError && icons.key !== renderKey;
  const isSquare = image ? image.width === image.height : true;
  const smallSource = image ? Math.min(image.width, image.height) < 1024 : false;

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const key = renderKey;
    (async () => {
      const out: Generated[] = [];
      // Render one square master (at most 1024px, the largest icon) once, then derive every
      // icon from it instead of downscaling the full-resolution source ~24 times.
      const crop = squareCrop(image.width, image.height);
      const masterSize = Math.min(MASTER_SIZE, crop.w);
      const masterBlob = await renderImage(image.source, image.width, image.height, { width: masterSize, height: masterSize, format: "image/png", crop });
      const master = await createImageBitmap(masterBlob);
      try {
        for (const spec of specs) {
          if (cancelled) break;
          const blob = await renderIcon({ source: master, width: master.width, height: master.height }, spec, debouncedBackground);
          out.push({ spec, blob, url: URL.createObjectURL(blob) });
        }
      } catch (e) {
        out.forEach((g) => URL.revokeObjectURL(g.url));
        throw e;
      } finally {
        master.close();
      }
      if (cancelled) {
        out.forEach((g) => URL.revokeObjectURL(g.url));
        return null;
      }
      return out;
    })()
      .then((out) => {
        if (cancelled || !out) {
          out?.forEach((g) => URL.revokeObjectURL(g.url));
          return;
        }
        setIcons((prev) => {
          prev.items.forEach((g) => URL.revokeObjectURL(g.url));
          return { key, items: out };
        });
        setGenError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setGenError(e instanceof Error ? e.message : "Icon generation failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [image, specs, debouncedBackground, renderKey]);

  const iconsRef = useRef(icons);
  useEffect(() => {
    iconsRef.current = icons;
  }, [icons]);
  useEffect(() => {
    return () => {
      iconsRef.current.items.forEach((g) => URL.revokeObjectURL(g.url));
    };
  }, []);

  const togglePlatform = (p: IconPlatform) =>
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const reset = () => {
    clear();
    setIcons((prev) => {
      prev.items.forEach((g) => URL.revokeObjectURL(g.url));
      return { key: "", items: [] };
    });
  };

  const downloadZip = async () => {
    if (!icons.items.length) return;
    setZipping(true);
    try {
      const entries: ZipEntry[] = [];
      for (const g of icons.items) entries.push({ name: `${g.spec.platform}/${g.spec.file}`, data: new Uint8Array(await g.blob.arrayBuffer()) });
      if (platforms.has("web")) {
        entries.push({ name: "web/manifest-icons.json", data: new TextEncoder().encode(manifestSnippet()) });
        entries.push({ name: "web/head-snippet.html", data: new TextEncoder().encode(headSnippet()) });
      }
      downloadBlob(zipBlob(entries), "app-icons.zip");
      toast(`ZIP with ${icons.items.length} icons ready`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not build ZIP", "error");
    } finally {
      setZipping(false);
    }
  };

  const totalBytes = icons.items.reduce((n, g) => n + g.blob.size, 0);

  if (!image) {
    return (
      <Card className="surface-gradient shadow-card">
        <Dropzone onFile={load} title="Drop a square, high-resolution icon" description={<>1024×1024 PNG recommended · or <span className="text-accent-strong">click to upload</span> · or paste</>} />
        {loading ? <p className="mt-3 text-center text-xs text-fg-muted">Decoding…</p> : null}
        {error ? <ErrorState title="Couldn't read that image" description={error} className="mt-4" /> : null}
        <p className="mt-3 text-center text-[11px] text-fg-subtle">Every size is rendered with the Canvas API in your browser. Nothing is uploaded.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!isSquare ? (
        <Alert tone="warning">
          Source is {image.width} × {image.height}, not square. Icons are centre-cropped to {Math.min(image.width, image.height)} × {Math.min(image.width, image.height)}.
        </Alert>
      ) : null}
      {smallSource ? <Alert tone="warning">Source is smaller than 1024 px, so the largest icons will be upscaled and may look soft.</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="shadow-card lg:self-start">
          <CardHeader
            title="Source"
            actions={
              <Button size="sm" variant="ghost" onClick={reset}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            }
          />
          <div className="overflow-hidden rounded-lg border" style={CHECKER_STYLE}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="Source icon" className="mx-auto block max-h-48 object-contain" />
          </div>
          <p className="mt-2 text-center font-mono text-[11px] text-fg-subtle">
            {image.width} × {image.height} · {image.format}
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Platforms</Label>
              <div className="flex flex-col gap-1.5">
                {PLATFORMS.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
                    <input type="checkbox" checked={platforms.has(p)} onChange={() => togglePlatform(p)} className="accent-accent" />
                    {PLATFORM_LABELS[p]}
                    <span className="ml-auto font-mono text-[11px] text-fg-subtle">{ICON_SPECS.filter((s) => s.platform === p).length}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label hint="iOS, App Store, maskable">Background for opaque icons</Label>
              <div className="flex items-center gap-2">
                <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
                  <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Background colour" />
                  <span className="block h-full w-full" style={{ backgroundColor: background }} />
                </label>
                <span className="font-mono text-xs text-fg-muted">{background}</span>
              </div>
            </div>
            <Button variant="primary" className="w-full" onClick={downloadZip} disabled={!icons.items.length || processing || zipping}>
              <Archive className="h-3.5 w-3.5" /> {zipping ? "Building…" : `Download all (ZIP · ${formatBytes(totalBytes)})`}
            </Button>
            <Dropzone onFile={load} compact title="Replace source" description="" />
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {genError ? <Alert tone="danger">{genError}</Alert> : null}
          {PLATFORMS.filter((p) => platforms.has(p)).map((p) => {
            const group = icons.items.filter((g) => g.spec.platform === p);
            return (
              <Card key={p} className="shadow-card">
                <CardHeader title={PLATFORM_LABELS[p]} description={p === "web" ? "favicon.ico can't be written in the browser; modern browsers accept PNG favicons via <link rel=\"icon\">." : p === "ios" ? "Common AppIcon set. Alpha is flattened onto the background, as iOS requires." : "Launcher mipmaps plus the 512 px Play Store listing icon."} actions={processing ? <Badge>Rendering…</Badge> : <Badge>{group.length} icons</Badge>} />
                {group.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {group.map((g) => (
                      <div key={g.spec.file} className="group flex flex-col rounded-lg border bg-bg-elevated p-2">
                        <div className="flex h-16 items-center justify-center rounded-md" style={CHECKER_STYLE}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={g.url} alt={g.spec.label} width={Math.min(g.spec.size, 56)} height={Math.min(g.spec.size, 56)} className={cn("rounded", g.spec.maskable && "rounded-full")} style={{ imageRendering: g.spec.size < 48 ? "pixelated" : undefined }} />
                        </div>
                        <div className="mt-2 truncate text-[11px] font-medium text-fg" title={g.spec.label}>
                          {g.spec.label}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-fg-subtle">
                          <span className="font-mono">
                            {g.spec.size}px · {formatBytes(g.blob.size)}
                          </span>
                          <button type="button" onClick={() => downloadBlob(g.blob, g.spec.file.split("/").pop() ?? g.spec.file)} className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg cursor-pointer" aria-label={`Download ${g.spec.label}`} title="Download">
                            <Download className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-24 skeleton" />
                )}
                {p === "web" ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">manifest.json</span>
                        <CopyButton value={manifestSnippet()} iconOnly />
                      </div>
                      <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-2 font-mono text-[11px] leading-relaxed">{manifestSnippet()}</pre>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">&lt;head&gt;</span>
                        <CopyButton value={headSnippet()} iconOnly />
                      </div>
                      <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-2 font-mono text-[11px] leading-relaxed">{headSnippet()}</pre>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
