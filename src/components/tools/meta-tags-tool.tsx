"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { buildMetaHtml, EMPTY_META, LIMITS, OG_TYPES, ROBOTS_OPTIONS, TWITTER_CARDS, type MetaFields } from "@/lib/tools/meta-tags";
import { downloadBlob } from "@/lib/tools/canvas";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

function Counter({ value, ideal, max }: { value: number; ideal: number; max: number }) {
  const tone = value === 0 ? "text-fg-subtle" : value <= ideal ? "text-success" : value <= max ? "text-warning" : "text-danger";
  return (
    <span className={cn("font-mono", tone)}>
      {value}/{ideal}
    </span>
  );
}

export function MetaTagsTool() {
  const [f, setF] = useState<MetaFields>(EMPTY_META);
  const set = <K extends keyof MetaFields>(key: K, value: MetaFields[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const html = useMemo(() => buildMetaHtml(f), [f]);
  const hasContent = Object.entries(f).some(([k, v]) => !["robots", "ogType", "twitterCard"].includes(k) && String(v).trim());

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader title="Basic" />
          <div className="space-y-3">
            <div>
              <Label htmlFor="mt-title" hint={<Counter value={f.title.trim().length} ideal={LIMITS.title.ideal} max={LIMITS.title.max} />}>
                Title
              </Label>
              <Input id="mt-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="DevBox — Developer tools without the noise" />
            </div>
            <div>
              <Label htmlFor="mt-desc" hint={<Counter value={f.description.trim().length} ideal={LIMITS.description.ideal} max={LIMITS.description.max} />}>
                Description
              </Label>
              <Textarea id="mt-desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="One or two sentences shown in search results and link previews." className="min-h-[80px] font-sans" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mt-canonical">Canonical URL</Label>
                <Input id="mt-canonical" mono value={f.canonical} onChange={(e) => set("canonical", e.target.value)} placeholder="https://example.com/page" />
              </div>
              <div>
                <Label htmlFor="mt-robots">Robots</Label>
                <Select id="mt-robots" value={f.robots} onChange={(e) => set("robots", e.target.value)}>
                  {ROBOTS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="mt-theme">Theme color</Label>
                <div className="flex items-center gap-2">
                  <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(f.themeColor) ? f.themeColor : "#0b0c0f"} onChange={(e) => set("themeColor", e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Pick theme color" />
                    <span className="block h-full w-full" style={{ backgroundColor: /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(f.themeColor) ? f.themeColor : "transparent" }} />
                  </label>
                  <Input id="mt-theme" mono value={f.themeColor} onChange={(e) => set("themeColor", e.target.value)} placeholder="#0b0c0f" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Open Graph" description="Used by Facebook, LinkedIn, Slack, WhatsApp and most link previews." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mt-ogtype">og:type</Label>
              <Select id="mt-ogtype" value={f.ogType} onChange={(e) => set("ogType", e.target.value)}>
                {OG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="mt-ogsite">og:site_name</Label>
              <Input id="mt-ogsite" value={f.ogSiteName} onChange={(e) => set("ogSiteName", e.target.value)} placeholder="DevBox" />
            </div>
            <div>
              <Label htmlFor="mt-ogurl" hint="defaults to canonical">
                og:url
              </Label>
              <Input id="mt-ogurl" mono value={f.ogUrl} onChange={(e) => set("ogUrl", e.target.value)} placeholder="https://example.com/page" />
            </div>
            <div>
              <Label htmlFor="mt-ogimage" hint="1200×630 recommended">
                og:image
              </Label>
              <Input id="mt-ogimage" mono value={f.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="https://example.com/og.png" />
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Twitter / X" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mt-twcard">twitter:card</Label>
              <Select id="mt-twcard" value={f.twitterCard} onChange={(e) => set("twitterCard", e.target.value)}>
                {TWITTER_CARDS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="mt-twsite">twitter:site</Label>
              <Input id="mt-twsite" mono value={f.twitterSite} onChange={(e) => set("twitterSite", e.target.value)} placeholder="@handle" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader
          title="Generated tags"
          actions={
            <>
              <Button size="sm" onClick={() => downloadBlob(new Blob([html], { type: "text/html" }), "index-head.html")} disabled={!hasContent}>
                <Download className="h-3.5 w-3.5" /> .html
              </Button>
              <CopyButton value={hasContent ? html : ""} variant="primary" />
            </>
          }
        />
        {hasContent ? (
          <>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-[11px] leading-relaxed">{html}</pre>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{html.split("\n").filter((l) => l.startsWith("<")).length} tags</Badge>
              {f.title.trim().length > LIMITS.title.max ? <Badge tone="danger">Title too long</Badge> : null}
              {f.description.trim().length > LIMITS.description.max ? <Badge tone="danger">Description too long</Badge> : null}
              {!f.ogImage.trim() ? <Badge tone="warning">No image: previews will be text-only</Badge> : null}
            </div>
          </>
        ) : (
          <EmptyState title="Fill in the fields" description="The <head> snippet appears here with values HTML-escaped." className="py-8" />
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">Paste inside &lt;head&gt;. Values are escaped so quotes and angle brackets are safe.</p>
      </Card>
    </div>
  );
}
