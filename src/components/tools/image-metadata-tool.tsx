"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { loadImageFile, formatBytes, type LoadedImage } from "@/lib/tools/image";
import { checkImageFile } from "@/lib/tools/canvas";
import { readImageMetadata, simplifyRatio, type ContainerInfo, type ExifEntry } from "@/lib/tools/image-metadata";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

interface Result {
  image: LoadedImage | null;
  file: File;
  container: ContainerInfo;
  exif: ExifEntry[];
}

export function ImageMetadataTool() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const sizeError = checkImageFile(file);
      if (sizeError) throw new Error(sizeError);
      const buf = await file.arrayBuffer();
      const meta = readImageMetadata(buf);
      let image: LoadedImage | null = null;
      try {
        image = await loadImageFile(file);
      } catch {
        image = null; // e.g. HEIC on unsupported browsers: still show header metadata
      }
      setResult((prev) => {
        if (prev?.image) URL.revokeObjectURL(prev.image.url);
        return { image, file, ...meta };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file.");
    } finally {
      setBusy(false);
    }
  }, []);

  const resultRef = useRef<Result | null>(null);
  useEffect(() => {
    resultRef.current = result;
  }, [result]);
  useEffect(() => {
    return () => {
      if (resultRef.current?.image) URL.revokeObjectURL(resultRef.current.image.url);
    };
  }, []);

  const clear = () => {
    if (result?.image) URL.revokeObjectURL(result.image.url);
    setResult(null);
    setError(null);
  };

  const exifText = result?.exif.map((e) => `${e.tag}: ${e.value}`).join("\n") ?? "";
  const hasGps = result?.exif.some((e) => e.tag.startsWith("GPS"));

  return (
    <div className="space-y-4">
      {!result ? (
        <Card className="surface-gradient shadow-card">
          <Dropzone onFile={onFile} title="Drop an image to inspect" description={<>or <span className="text-accent-strong">click to upload</span> · or paste from the clipboard · JPEG, PNG, WebP, GIF, SVG, TIFF…</>} accept="image/*,.heic,.heif,.tif,.tiff" />
          {busy ? <p className="mt-3 text-center text-xs text-fg-muted">Reading…</p> : null}
          {error ? <ErrorState title="Couldn't read that file" description={error} className="mt-4" /> : null}
          <p className="mt-3 text-center text-[11px] text-fg-subtle">Headers are parsed locally. The file is never uploaded.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="shadow-card lg:col-span-2">
            <CardHeader
              title="Preview"
              actions={
                <Button size="sm" variant="ghost" onClick={clear}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              }
            />
            {result.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.image.url} alt={result.file.name} className="max-h-[50vh] w-full rounded-lg border bg-bg-elevated object-contain" />
            ) : (
              <EmptyState title="No preview" description="This browser can't decode the format, but the header metadata below is still available." className="py-8" />
            )}
            <Dropzone onFile={onFile} compact className="mt-3" title="Drop, paste or click to replace" description="" accept="image/*,.heic,.heif,.tif,.tiff" />
          </Card>

          <div className="space-y-4 lg:col-span-3">
            <Card className="shadow-card">
              <CardHeader title="File" />
              <OutputGrid>
                <OutputRow label="Name" value={result.file.name} mono={false} />
                <OutputRow label="MIME type" value={result.file.type || "(unknown)"} />
                <OutputRow label="Size" value={`${formatBytes(result.file.size)} (${result.file.size.toLocaleString()} bytes)`} />
                <OutputRow label="Last modified" value={new Date(result.file.lastModified).toLocaleString()} mono={false} />
              </OutputGrid>
            </Card>

            <Card className="shadow-card">
              <CardHeader title="Image" actions={<Badge tone="accent">{result.container.format}</Badge>} />
              <OutputGrid>
                <OutputRow label="Dimensions" value={result.image ? `${result.image.width} × ${result.image.height} px` : "—"} />
                <OutputRow label="Aspect ratio" value={result.image ? `${simplifyRatio(result.image.width, result.image.height)} (${(result.image.width / result.image.height).toFixed(3)})` : "—"} />
                <OutputRow label="Megapixels" value={result.image ? `${((result.image.width * result.image.height) / 1e6).toFixed(2)} MP` : "—"} />
                <OutputRow label="Container" value={result.container.format} />
                {result.container.colorType ? <OutputRow label="Color type" value={result.container.colorType} mono={false} /> : null}
                {result.container.bitDepth ? <OutputRow label="Bit depth" value={`${result.container.bitDepth}-bit per channel`} mono={false} /> : null}
                <OutputRow label="Alpha channel" value={result.container.hasAlpha === undefined ? "Unknown" : result.container.hasAlpha ? "Yes" : "No"} mono={false} copyable={false} />
                <OutputRow label="Color profile" value={result.container.iccProfile ?? "None embedded (assume sRGB)"} mono={false} copyable={false} />
                {result.container.progressive !== undefined ? <OutputRow label="Encoding" value={result.container.progressive ? "Progressive JPEG" : "Baseline JPEG"} mono={false} copyable={false} /> : null}
                {result.container.animated !== undefined ? <OutputRow label="Animated" value={result.container.animated ? "Yes" : "No"} mono={false} copyable={false} /> : null}
              </OutputGrid>
            </Card>

            <Card className="shadow-card">
              <CardHeader
                title="EXIF"
                description={result.exif.length ? `${result.exif.length} tags found` : "No EXIF data in this file (common for PNG, WebP and screenshots)."}
                actions={
                  <>
                    {hasGps ? <Badge tone="warning">Contains GPS location</Badge> : null}
                    <CopyButton value={exifText} />
                  </>
                }
              />
              {result.exif.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {result.exif.map((e, i) => (
                        <tr key={`${e.tag}-${i}`} className="bg-bg-elevated">
                          <td className="whitespace-nowrap px-3 py-1.5 text-xs text-fg-muted">{e.tag}</td>
                          <td className="break-all px-3 py-1.5 font-mono text-xs">{e.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
