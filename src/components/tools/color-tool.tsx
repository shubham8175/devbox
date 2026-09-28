"use client";

import { useMemo, useState } from "react";
import { formatColor, luminance, parseColor, rgbToHex, rgbToHsl, hslToRgb, type RGBA } from "@/lib/tools/color";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";

const SWATCHES = ["#7c8cff", "#3ecf8e", "#f5b342", "#ff6b6b", "#0ea5e9", "#a855f7", "#111318", "#ffffff"];

export function ColorTool() {
  const [input, setInput] = useState("#7c8cff");
  const [color, setColor] = useState<RGBA>({ r: 124, g: 140, b: 255, a: 1 });
  const [error, setError] = useState<string | null>(null);

  const onInput = (v: string) => {
    setInput(v);
    const parsed = parseColor(v);
    if (parsed) {
      setColor(parsed);
      setError(null);
    } else {
      setError(v.trim() ? "Unrecognised color. Try #ff8800, rgb(255, 136, 0) or hsl(32, 100%, 50%)." : null);
    }
  };

  const setFromColor = (c: RGBA) => {
    setColor(c);
    setInput(rgbToHex(c, c.a < 1));
    setError(null);
  };

  const formats = useMemo(() => formatColor(color), [color]);
  const hsl = useMemo(() => rgbToHsl(color), [color]);
  const textOnPreview = luminance(color) > 0.4 ? "#15171c" : "#ffffff";

  const updateChannel = (key: keyof RGBA, value: number) => {
    setFromColor({ ...color, [key]: value });
  };
  const updateHsl = (key: "h" | "s" | "l", value: number) => {
    setFromColor(hslToRgb({ ...hsl, [key]: value }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader title="Input" description="Paste any HEX, RGB(A) or HSL(A) value." />
          <div className="flex gap-2">
            <Input mono value={input} onChange={(e) => onInput(e.target.value)} placeholder="#ff8800 · rgb(255,136,0) · hsl(32 100% 50%)" invalid={!!error} className="h-11 text-base" aria-label="Color value" />
            <label className="relative h-11 w-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border" title="Pick a color">
              <input
                type="color"
                value={formats.hex}
                onChange={(e) => {
                  const p = parseColor(e.target.value);
                  if (p) setFromColor({ ...p, a: color.a });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Color picker"
              />
              <span className="block h-full w-full" style={{ backgroundColor: formats.rgba }} />
            </label>
          </div>
          {error ? (
            <Alert tone="danger" className="mt-3">
              {error}
            </Alert>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onInput(s)}
                className="h-7 w-7 rounded-md border transition-transform hover:scale-110 cursor-pointer"
                style={{ backgroundColor: s }}
                aria-label={`Use ${s}`}
                title={s}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Adjust" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Slider label="Red" value={color.r} max={255} onChange={(v) => updateChannel("r", v)} />
              <Slider label="Green" value={color.g} max={255} onChange={(v) => updateChannel("g", v)} />
              <Slider label="Blue" value={color.b} max={255} onChange={(v) => updateChannel("b", v)} />
              <Slider label="Alpha" value={Math.round(color.a * 100)} max={100} suffix="%" onChange={(v) => updateChannel("a", v / 100)} />
            </div>
            <div className="space-y-3">
              <Slider label="Hue" value={Math.round(hsl.h)} max={360} suffix="°" onChange={(v) => updateHsl("h", v)} />
              <Slider label="Saturation" value={Math.round(hsl.s)} max={100} suffix="%" onChange={(v) => updateHsl("s", v)} />
              <Slider label="Lightness" value={Math.round(hsl.l)} max={100} suffix="%" onChange={(v) => updateHsl("l", v)} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Formats" />
          <OutputGrid>
            <OutputRow label="HEX" value={formats.hex} />
            <OutputRow label="HEX + alpha" value={formats.hexAlpha} />
            <OutputRow label="RGB" value={formats.rgb} />
            <OutputRow label="RGBA" value={formats.rgba} />
            <OutputRow label="HSL" value={formats.hsl} />
            <OutputRow label="HSLA" value={formats.hsla} />
            <OutputRow label="Modern CSS" value={formats.css} className="sm:col-span-2" />
          </OutputGrid>
        </Card>
      </div>

      <Card className="lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Preview" />
        <div
          className="flex h-56 flex-col items-center justify-center rounded-lg border font-mono text-sm"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #80808022 25%, transparent 25%), linear-gradient(-45deg, #80808022 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808022 75%), linear-gradient(-45deg, transparent 75%, #80808022 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center rounded-lg" style={{ backgroundColor: formats.rgba, color: textOnPreview }}>
            <span className="text-lg font-semibold">{formats.hex}</span>
            <span className="text-xs opacity-80">{formats.hsl}</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border bg-bg-elevated p-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Luminance</div>
            <div className="mt-0.5 font-mono">{luminance(color).toFixed(3)}</div>
          </div>
          <div className="rounded-lg border bg-bg-elevated p-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle">Text on it</div>
            <div className="mt-0.5 font-mono">{textOnPreview === "#ffffff" ? "white" : "dark"}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Slider({ label, value, max, suffix = "", onChange }: { label: string; value: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <Label hint={`${value}${suffix}`}>{label}</Label>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" aria-label={label} />
    </div>
  );
}
