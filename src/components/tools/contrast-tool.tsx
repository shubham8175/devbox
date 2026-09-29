"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Wand2 } from "lucide-react";
import { parseColor, rgbToHex, type RGBA } from "@/lib/tools/color";
import { CONTRAST_PAIRS_SAMPLE, CONTRAST_SAMPLE, checkContrast, formatRatio, WCAG_THRESHOLDS, type WcagGrades } from "@/lib/tools/contrast";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

const CRITERIA: Array<{ key: keyof WcagGrades; label: string; hint: string }> = [
  { key: "normalAA", label: "AA normal text", hint: `≥ ${WCAG_THRESHOLDS.normalAA}:1` },
  { key: "normalAAA", label: "AAA normal text", hint: `≥ ${WCAG_THRESHOLDS.normalAAA}:1` },
  { key: "largeAA", label: "AA large text", hint: `≥ ${WCAG_THRESHOLDS.largeAA}:1` },
  { key: "largeAAA", label: "AAA large text", hint: `≥ ${WCAG_THRESHOLDS.largeAAA}:1` },
  { key: "uiAA", label: "AA UI components", hint: `≥ ${WCAG_THRESHOLDS.uiAA}:1` },
];

const toCss = (c: RGBA) => `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;

export function ContrastTool() {
  const [fgText, setFgText] = useState(CONTRAST_SAMPLE.fg);
  const [bgText, setBgText] = useState(CONTRAST_SAMPLE.bg);

  const fg = useMemo(() => parseColor(fgText), [fgText]);
  const bg = useMemo(() => parseColor(bgText), [bgText]);
  const result = useMemo(() => checkContrast(fgText, bgText), [fgText, bgText]);

  const swapColors = () => {
    setFgText(bgText);
    setBgText(fgText);
  };

  const previewStyle = fg && bg ? { color: toCss(fg), backgroundColor: toCss(bg) } : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader
            title="Colours"
            description="HEX, RGB(A) or HSL(A). A translucent foreground is composited over the background first."
            actions={
              <Button size="sm" variant="ghost" onClick={swapColors} aria-label="Swap foreground and background">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
              </Button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField id="contrast-fg" label="Foreground (text)" value={fgText} parsed={fg} onChange={setFgText} />
            <ColorField id="contrast-bg" label="Background" value={bgText} parsed={bg} onChange={setBgText} />
          </div>
          {(!fg && fgText.trim()) || (!bg && bgText.trim()) ? (
            <Alert tone="danger" className="mt-3">
              Unrecognised colour. Try #ff8800, rgb(255, 136, 0) or hsl(32, 100%, 50%).
            </Alert>
          ) : null}
        </Card>

        {result ? (
          <Card className="shadow-card">
            <CardHeader
              title="Fix it"
              description={
                result.suggestion.ok && result.suggestion.steps === 0
                  ? "This pair already meets AA for normal text."
                  : "Nearest foreground of the same hue that reaches 4.5:1 for normal text."
              }
            />
            {result.suggestion.ok ? (
              result.suggestion.steps > 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-bg-elevated p-3">
                  <div className="flex h-12 w-24 items-center justify-center rounded-md border text-sm font-semibold" style={{ color: result.suggestion.hex, backgroundColor: toCss(result.bg) }}>
                    Aa
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm text-fg">{result.suggestion.hex}</div>
                    <div className="text-xs text-fg-muted">
                      {formatRatio(result.suggestion.ratio)} · {result.suggestion.steps}% {result.suggestion.direction}
                    </div>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => setFgText(result.suggestion.ok ? result.suggestion.hex : fgText)}>
                    <Wand2 className="h-3.5 w-3.5" /> Apply
                  </Button>
                </div>
              ) : (
                <Alert tone="success">Nothing to fix: {formatRatio(result.ratio)} passes AA for normal text.</Alert>
              )
            ) : (
              <Alert tone="warning">{result.suggestion.error}</Alert>
            )}
          </Card>
        ) : null}

        <Card className="shadow-card">
          <CardHeader title="Common pairings" description="Click to load. Includes this app's own light and dark theme tokens." />
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTRAST_PAIRS_SAMPLE.map((p) => {
              const r = checkContrast(p.fg, p.bg);
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setFgText(p.fg);
                    setBgText(p.bg);
                  }}
                  className="flex items-center gap-3 rounded-lg border bg-bg-elevated p-2 text-left transition-colors hover:border-border-strong cursor-pointer"
                >
                  <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border text-sm font-semibold" style={{ color: p.fg, backgroundColor: p.bg }}>
                    Aa
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-fg">{p.name}</span>
                    <span className="block truncate font-mono text-[11px] text-fg-subtle">
                      {p.fg} on {p.bg}
                    </span>
                  </span>
                  {r ? <Badge tone={r.grades.normalAA ? "success" : r.grades.largeAA ? "warning" : "danger"}>{formatRatio(r.ratio)}</Badge> : null}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Preview" description="Nothing leaves this page and nothing is stored." />
        {result && previewStyle ? (
          <>
            <div className="rounded-lg border p-4" style={previewStyle}>
              <p className="text-[16px] leading-relaxed">Normal text at 16px. The quick brown fox jumps over the lazy dog.</p>
              <p className="mt-3 text-[24px] font-bold leading-tight">Large text, 24px bold</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-9 items-center rounded-lg border-2 px-3 text-sm font-medium" style={{ borderColor: previewStyle.color }}>
                  Outline button
                </span>
                <span className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium" style={{ backgroundColor: previewStyle.color, color: previewStyle.backgroundColor }}>
                  Solid button
                </span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Contrast ratio</div>
              <div className={cn("font-mono text-4xl font-semibold", result.grades.normalAA ? "text-success" : result.grades.largeAA ? "text-warning" : "text-danger")}>{formatRatio(result.ratio)}</div>
            </div>
            <div className="mt-4 space-y-1.5">
              {CRITERIA.map((cr) => (
                <div key={cr.key} className="flex items-center justify-between gap-2 rounded-lg border bg-bg-elevated px-3 py-1.5 text-xs">
                  <span className="text-fg">
                    {cr.label} <span className="text-fg-subtle">{cr.hint}</span>
                  </span>
                  <Badge tone={result.grades[cr.key] ? "success" : "danger"}>{result.grades[cr.key] ? "Pass" : "Fail"}</Badge>
                </div>
              ))}
            </div>
            <OutputGrid className="mt-4 sm:grid-cols-1">
              <OutputRow label="Foreground" value={rgbToHex(result.fg, result.fg.a < 1)} />
              <OutputRow label="Background" value={rgbToHex(result.bg, result.bg.a < 1)} />
            </OutputGrid>
          </>
        ) : (
          <p className="text-xs text-fg-muted">Enter two valid colours to see the ratio.</p>
        )}
      </Card>
    </div>
  );
}

function ColorField({ id, label, value, parsed, onChange }: { id: string; label: string; value: string; parsed: RGBA | null; onChange: (v: string) => void }) {
  const hex = parsed ? rgbToHex({ ...parsed, a: 1 }) : "#000000";
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} mono value={value} onChange={(e) => onChange(e.target.value)} invalid={!parsed && value.trim() !== ""} placeholder="#767676" />
        <label className="relative h-9 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border" title="Pick a colour">
          <input
            type="color"
            value={hex}
            onChange={(e) => {
              const p = parseColor(e.target.value);
              if (p) onChange(rgbToHex({ ...p, a: parsed?.a ?? 1 }, (parsed?.a ?? 1) < 1));
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} picker`}
          />
          <span className="block h-full w-full" style={{ backgroundColor: parsed ? toCss(parsed) : "transparent" }} />
        </label>
      </div>
    </div>
  );
}
