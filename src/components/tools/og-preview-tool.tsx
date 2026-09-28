"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, ImageOff, X } from "lucide-react";
import { displayHost, isSafeRemoteUrl, OG_LIMITS, ogTagsFor, truncate, type OgFields } from "@/lib/tools/og-preview";
import { Dropzone } from "@/components/ui/dropzone";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type ImageMode = "local" | "remote";

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={cn("font-mono", value === 0 ? "text-fg-subtle" : value <= max ? "text-success" : "text-warning")}>{value}/{max}</span>;
}

export function OgPreviewTool() {
  const [f, setF] = useState<OgFields>({ title: "DevBox — Developer tools without the noise", description: "80 local-first utilities for JSON, images, security and more. Nothing leaves your browser.", url: "https://devbox.example.com/tools/og-preview", siteName: "DevBox" });
  const [imageMode, setImageMode] = useState<ImageMode>("local");
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [remoteInput, setRemoteInput] = useState("");
  const [remoteLoaded, setRemoteLoaded] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);

  const set = <K extends keyof OgFields>(key: K, value: OgFields[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const localUrlRef = useRef<string | null>(null);
  useEffect(() => {
    localUrlRef.current = localUrl;
  }, [localUrl]);
  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  const onFile = (file: File) => {
    setLocalUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const imageSrc = imageMode === "local" ? localUrl : remoteLoaded && !remoteFailed ? remoteLoaded : null;
  const title = truncate(f.title, OG_LIMITS.title) || "Untitled";
  const description = truncate(f.description, OG_LIMITS.description);
  const host = displayHost(f.url) || "example.com";
  const tags = ogTagsFor(f, imageMode === "remote" ? remoteLoaded ?? remoteInput : "");

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card className="surface-gradient shadow-card">
          <CardHeader title="Content" />
          <div className="space-y-3">
            <div>
              <Label htmlFor="og-title" hint={<Counter value={f.title.trim().length} max={OG_LIMITS.title} />}>
                Title
              </Label>
              <Input id="og-title" value={f.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="og-desc" hint={<Counter value={f.description.trim().length} max={OG_LIMITS.description} />}>
                Description
              </Label>
              <Textarea id="og-desc" value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-[80px] font-sans" />
            </div>
            <div>
              <Label htmlFor="og-url">URL</Label>
              <Input id="og-url" mono value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com/page" />
            </div>
            <div>
              <Label htmlFor="og-site">Site name</Label>
              <Input id="og-site" value={f.siteName} onChange={(e) => set("siteName", e.target.value)} />
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader
            title="Image"
            description="1200 × 630 works everywhere."
            actions={
              <Segmented
                size="sm"
                value={imageMode}
                onChange={setImageMode}
                options={[
                  { value: "local", label: "Local file" },
                  { value: "remote", label: "Remote URL" },
                ]}
              />
            }
          />
          {imageMode === "local" ? (
            <>
              {localUrl ? (
                <div className="mb-3 flex items-center justify-between rounded-lg border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                  Local image loaded (never uploaded)
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLocalUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return null;
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              ) : null}
              <Dropzone onFile={onFile} compact title={localUrl ? "Drop, paste or click to replace" : "Drop a preview image"} />
            </>
          ) : (
            <div className="space-y-2">
              <Input mono value={remoteInput} onChange={(e) => setRemoteInput(e.target.value)} placeholder="https://example.com/og.png" aria-label="Remote image URL" />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setRemoteFailed(false);
                    setRemoteLoaded(remoteInput.trim());
                  }}
                  disabled={!isSafeRemoteUrl(remoteInput)}
                >
                  <Globe className="h-3.5 w-3.5" /> Load remote image
                </Button>
                {remoteLoaded ? (
                  <Button size="sm" variant="ghost" onClick={() => setRemoteLoaded(null)}>
                    Unload
                  </Button>
                ) : null}
              </div>
              <Alert tone="info">No request is made until you click “Load remote image”. Your browser then fetches that one URL directly; nothing goes through DevBox.</Alert>
              {remoteFailed ? <Alert tone="danger">That image could not be loaded (blocked by CORS/hotlink protection, or not an image).</Alert> : null}
            </div>
          )}
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Equivalent tags" actions={<CopyButton value={tags} />} />
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-[11px] leading-relaxed">{tags}</pre>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-3">
        <Card className="shadow-card">
          <CardHeader title="Twitter / X · large card" actions={<Badge>summary_large_image</Badge>} />
          <div className="mx-auto max-w-[520px] overflow-hidden rounded-2xl border border-border-strong bg-bg-elevated">
            <CardImage src={imageSrc} onError={() => setRemoteFailed(true)} ratio="1.91 / 1" />
            <div className="p-3">
              <div className="truncate text-[15px] font-medium text-fg">{title}</div>
              {description ? <div className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{description}</div> : null}
              <div className="mt-1 flex items-center gap-1 text-sm text-fg-subtle">
                <Globe className="h-3.5 w-3.5" /> {host}
              </div>
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Facebook / LinkedIn" />
          <div className="mx-auto max-w-[520px] overflow-hidden rounded-lg border border-border-strong bg-bg-elevated">
            <CardImage src={imageSrc} onError={() => setRemoteFailed(true)} ratio="1.91 / 1" />
            <div className="border-t bg-surface-hover/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle">{host}</div>
              <div className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-fg">{title}</div>
              {description ? <div className="mt-0.5 line-clamp-1 text-sm text-fg-muted">{description}</div> : null}
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Slack / Discord unfurl" />
          <div className="mx-auto max-w-[520px] rounded-lg border border-border-strong bg-bg-elevated p-3">
            <div className="flex gap-3 border-l-4 border-accent pl-3">
              <div className="min-w-0 flex-1">
                {f.siteName.trim() ? <div className="text-xs font-semibold text-fg-muted">{f.siteName.trim()}</div> : null}
                <div className="mt-0.5 truncate text-sm font-semibold text-accent-strong">{title}</div>
                {description ? <div className="mt-0.5 line-clamp-3 text-sm text-fg">{description}</div> : null}
              </div>
              <div className="w-20 shrink-0">
                <CardImage src={imageSrc} onError={() => setRemoteFailed(true)} ratio="1 / 1" compact />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CardImage({ src, onError, ratio, compact }: { src: string | null; onError: () => void; ratio: string; compact?: boolean }) {
  return (
    <div className="flex items-center justify-center overflow-hidden bg-surface-hover" style={{ aspectRatio: ratio }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={onError} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <div className={cn("flex flex-col items-center text-fg-subtle", compact ? "text-[10px]" : "text-xs")}>
          <ImageOff className={compact ? "h-4 w-4" : "h-5 w-5"} />
          {compact ? null : <span className="mt-1">No image</span>}
        </div>
      )}
    </div>
  );
}
