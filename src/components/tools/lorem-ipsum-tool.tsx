"use client";

import { useMemo, useState } from "react";
import { Download, Minus, Plus, RefreshCw } from "lucide-react";
import { generateLorem, LOREM_LIMITS, PLACEHOLDER_MAX_SIDE, placeholderImageSvg, placeholderPresets, toDataUrl, type LoremFormat, type LoremMode } from "@/lib/tools/lorem-ipsum";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const DEFAULT_COUNT: Record<LoremMode, number> = { words: 50, sentences: 5, paragraphs: 3 };

function download(text: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Fresh seed from the CSPRNG; only called from click handlers so SSR markup stays stable. */
function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export function LoremIpsumTool() {
  const [mode, setMode] = useState<LoremMode>("paragraphs");
  const [count, setCount] = useState(DEFAULT_COUNT.paragraphs);
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [format, setFormat] = useState<LoremFormat>("plain");
  // Fixed initial seed so the server and first client render agree; "Regenerate" picks a new one.
  const [seed, setSeed] = useState(1);

  const max = LOREM_LIMITS[mode];
  const clamped = Math.max(1, Math.min(count, max));
  const output = useMemo(() => generateLorem({ mode, count: clamped, startWithLorem, format, seed }), [mode, clamped, startWithLorem, format, seed]);
  const wordCount = useMemo(() => output.split(/\s+/).filter(Boolean).length, [output]);

  const changeMode = (m: LoremMode) => {
    setMode(m);
    setCount(DEFAULT_COUNT[m]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Generate text"
          description="Classic Lorem ipsum. Deterministic until you regenerate; nothing is stored."
          actions={
            <>
              <Button size="sm" onClick={() => setSeed(randomSeed())}>
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <CopyButton value={output} variant="primary" />
            </>
          }
        />
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label>Unit</Label>
            <Segmented
              size="sm"
              value={mode}
              onChange={changeMode}
              options={[
                { value: "words", label: "Words" },
                { value: "sentences", label: "Sentences" },
                { value: "paragraphs", label: "Paragraphs" },
              ]}
            />
          </div>
          <div>
            <Label htmlFor="lorem-count" hint={`max ${max}`}>
              Count
            </Label>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="secondary" onClick={() => setCount((c) => Math.max(1, c - 1))} aria-label="Decrease count" disabled={clamped <= 1}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Input id="lorem-count" mono type="number" inputMode="numeric" min={1} max={max} value={count} onChange={(e) => setCount(Number(e.target.value) || 0)} className="w-20 text-center" invalid={count < 1 || count > max} />
              <Button size="icon" variant="secondary" onClick={() => setCount((c) => Math.min(max, c + 1))} aria-label="Increase count" disabled={clamped >= max}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Format</Label>
            <Segmented
              size="sm"
              value={format}
              onChange={setFormat}
              options={[
                { value: "plain", label: "Plain" },
                { value: "html", label: "HTML" },
                { value: "markdown", label: "Markdown" },
              ]}
            />
          </div>
          <label className="flex h-8 items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" className="accent-accent" checked={startWithLorem} onChange={(e) => setStartWithLorem(e.target.checked)} />
            Start with “Lorem ipsum…”
          </label>
        </div>
        <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{output}</pre>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>{wordCount.toLocaleString()} words</Badge>
          <Badge>{output.length.toLocaleString()} chars</Badge>
        </div>
      </Card>

      <PlaceholderImageCard />
    </div>
  );
}

function PlaceholderImageCard() {
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(180);
  const [text, setText] = useState("");
  const [background, setBackground] = useState("#e5e7eb");
  const [foreground, setForeground] = useState("#6b7280");

  const svg = useMemo(() => placeholderImageSvg({ width, height, text, background, foreground }), [width, height, text, background, foreground]);
  const dataUrl = useMemo(() => toDataUrl(svg, "utf8"), [svg]);
  const dataUrlB64 = useMemo(() => toDataUrl(svg, "base64"), [svg]);
  const activePreset = placeholderPresets.find((p) => p.width === width && p.height === height)?.id;

  return (
    <Card>
      <CardHeader
        title="Placeholder image"
        description="An SVG box with its dimensions as a label, ready to inline as a data URL."
        actions={
          <Button size="sm" onClick={() => download(svg, `placeholder-${width}x${height}.svg`, "image/svg+xml")}>
            <Download className="h-3.5 w-3.5" /> Download .svg
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {placeholderPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setWidth(p.width);
                  setHeight(p.height);
                }}
                aria-pressed={activePreset === p.id}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer",
                  activePreset === p.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {p.label} <span className="font-mono text-fg-subtle">{p.width}×{p.height}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ph-width">Width</Label>
              <Input id="ph-width" mono type="number" min={1} max={PLACEHOLDER_MAX_SIDE} value={width} onChange={(e) => setWidth(Number(e.target.value) || 0)} />
            </div>
            <div>
              <Label htmlFor="ph-height">Height</Label>
              <Input id="ph-height" mono type="number" min={1} max={PLACEHOLDER_MAX_SIDE} value={height} onChange={(e) => setHeight(Number(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <Label htmlFor="ph-text" hint="defaults to W×H">
              Label
            </Label>
            <Input id="ph-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={`${width}×${height}`} maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField id="ph-bg" label="Background" value={background} onChange={setBackground} />
            <ColorField id="ph-fg" label="Text colour" value={foreground} onChange={setForeground} />
          </div>
        </div>
        <div>
          <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-lg border bg-bg-elevated p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an inline data: URL preview, not a remote image */}
            <img src={dataUrl} alt={`Placeholder ${width} by ${height}`} className="max-h-[320px] max-w-full rounded border" />
          </div>
          <OutputGrid className="mt-3 sm:grid-cols-1">
            <OutputRow label="Data URL" value={dataUrl} hint="Percent-encoded; works in src and CSS url()" className="[&_.break-all]:line-clamp-2" />
            <OutputRow label="Data URL (Base64)" value={dataUrlB64} className="[&_.break-all]:line-clamp-2" />
            <OutputRow label="SVG" value={svg} className="[&_.break-all]:line-clamp-2" />
          </OutputGrid>
        </div>
      </div>
    </Card>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1.5">
        <Input id={id} mono value={value} onChange={(e) => onChange(e.target.value)} invalid={!valid} maxLength={7} />
        <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border" title={`Pick ${label.toLowerCase()}`}>
          <input type="color" value={valid ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${label} picker`} />
          <span className="block h-full w-full" style={{ backgroundColor: valid ? value : undefined }} />
        </label>
      </div>
    </div>
  );
}
