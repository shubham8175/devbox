"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Eraser, Wand2 } from "lucide-react";
import { parseColor, rgbToHex, type RGBA } from "@/lib/tools/color";
import {
  CONTRAST_PAIRS_SAMPLE,
  CONTRAST_SAMPLE,
  checkContrast,
  checkPalette,
  contrastRatio,
  formatRatio,
  MAX_PALETTE_COLORS,
  PALETTE_SAMPLE,
  splitColors,
  WCAG_THRESHOLDS,
  type PaletteRow,
  type WcagGrades,
} from "@/lib/tools/contrast";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { useValueList, ValueList } from "@/components/value-list";
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
    <div className="space-y-4">
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

      {/* Outside the grid so the sticky Preview card can't slide over it. */}
      <PaletteCard />
    </div>
  );
}

/** Ratio colour used everywhere: green passes AA normal, amber only large text, red fails both. */
const ratioClass = (g: WcagGrades) => (g.normalAA ? "text-success" : g.largeAA ? "text-warning" : "text-danger");

const GRADE_COLUMNS: Array<{ key: keyof WcagGrades; label: string }> = [
  { key: "normalAA", label: "AA" },
  { key: "normalAAA", label: "AAA" },
  { key: "largeAA", label: "AA large" },
  { key: "largeAAA", label: "AAA large" },
];

type PaletteOrder = "input" | "ratio";

/** One background, one box per text colour: every colour graded against it, with a fix for the failures. */
function PaletteCard({ className }: { className?: string }) {
  const list = useValueList({ max: MAX_PALETTE_COLORS });
  const { values, hasInput, reset } = list;
  const [bgText, setBgText] = useState(PALETTE_SAMPLE.bg);
  const [order, setOrder] = useState<PaletteOrder>("ratio");
  const bg = useMemo(() => parseColor(bgText), [bgText]);
  const result = useMemo(() => (bg ? checkPalette(values, bg) : null), [values, bg]);
  const rows = useMemo(
    () => (result ? (order === "ratio" ? [...result.rows].sort((a, b) => b.ratio - a.ratio) : result.rows) : []),
    [result, order],
  );

  const hex = (c: RGBA) => rgbToHex(c, c.a < 1);
  const report =
    result && bg
      ? [
          `Background ${hex(bg)}`,
          ...rows.map((r) => {
            const passes = GRADE_COLUMNS.filter((g) => r.grades[g.key]).map((g) => g.label);
            const fix = r.suggestion?.ok && r.suggestion.steps > 0 ? ` → try ${r.suggestion.hex} (${formatRatio(r.suggestion.ratio)})` : "";
            return `#${r.line} ${r.input}: ${formatRatio(r.ratio)} · ${passes.length ? `passes ${passes.join(", ")}` : "fails all"}${fix}`;
          }),
        ].join("\n")
      : "";

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader
        title="Check several text colours"
        description="One background, one text colour per box. Each is graded against WCAG 2.x as in the checker above."
        actions={
          !hasInput ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBgText(PALETTE_SAMPLE.bg);
                reset(PALETTE_SAMPLE.fgs);
              }}
            >
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => reset([])}>
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div>
          <ColorField id="palette-bg" label="Background" value={bgText} parsed={bg} onChange={setBgText} />
          {!bg && bgText.trim() ? <p className="mt-1 text-[11px] text-danger">Unrecognised colour.</p> : null}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted">Text colours</div>
          <ValueList
            list={list}
            id="palette-fg"
            itemLabel="colour"
            placeholder="#1d4ed8"
            splitPaste={splitColors}
            status={(value) => {
              const fg = parseColor(value);
              if (!fg) return { tone: "error", content: "Unrecognised colour. Try #ff8800, rgb(255, 136, 0) or hsl(32, 100%, 50%)." };
              const ratio = bg ? contrastRatio(fg, bg) : null;
              return {
                tone: "ok",
                content: (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: toCss(fg) }} />
                    <span className="font-mono">{hex(fg)}</span>
                    {ratio !== null ? <span className="font-mono">· {formatRatio(ratio)}</span> : null}
                  </span>
                ),
              };
            }}
          />
        </div>
      </div>

      {result && bg && rows.length ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">{result.counts.normalAA} pass AA</Badge>
              {result.counts.largeOnly ? <Badge tone="warning">{result.counts.largeOnly} large text only</Badge> : null}
              {result.counts.fail ? <Badge tone="danger">{result.counts.fail} fail</Badge> : null}
            </div>
            <Segmented
              size="sm"
              value={order}
              onChange={setOrder}
              options={[
                { value: "ratio", label: "By ratio" },
                { value: "input", label: "Input order" },
              ]}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Preview</th>
                  <th className="px-3 py-2 font-medium">Ratio</th>
                  {GRADE_COLUMNS.map((g) => (
                    <th key={g.key} className="px-3 py-2 font-medium">
                      {g.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PaletteTableRow
                    key={r.line}
                    row={r}
                    bg={bg}
                    flag={rows.length > 1 && r === result.best ? "Best" : rows.length > 1 && r === result.worst ? "Worst" : null}
                    onApply={(v) => list.setFields((fs) => fs.map((f, i) => (i === r.line - 1 ? { ...f, value: v } : f)))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {bg ? "Enter one or more text colours to grade them against the background." : "Enter a valid background colour."}
        </p>
      )}
    </Card>
  );
}

function PaletteTableRow({ row: r, bg, flag, onApply }: { row: PaletteRow; bg: RGBA; flag: "Best" | "Worst" | null; onApply: (hex: string) => void }) {
  const s = r.suggestion;
  return (
    <tr className="border-t align-middle">
      <td className="px-3 py-2 text-fg-subtle">{r.line}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 min-w-24 items-center rounded-md border px-2 text-sm font-medium" style={{ color: toCss(r.fg), backgroundColor: toCss(bg) }}>
            Sample text
          </span>
          <span className="font-mono text-[12px] text-fg-muted">{r.input}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <span className={cn("font-mono text-[13px] font-semibold", ratioClass(r.grades))}>{formatRatio(r.ratio)}</span>
        {flag ? (
          <Badge tone={flag === "Best" ? "accent" : "neutral"} className="ml-1.5">
            {flag}
          </Badge>
        ) : null}
      </td>
      {GRADE_COLUMNS.map((g) => (
        <td key={g.key} className="px-3 py-2">
          <Badge tone={r.grades[g.key] ? "success" : "danger"}>{r.grades[g.key] ? "Pass" : "Fail"}</Badge>
        </td>
      ))}
      <td className="px-3 py-2">
        {!s ? (
          <span className="text-fg-subtle">—</span>
        ) : s.ok ? (
          <button
            type="button"
            onClick={() => onApply(s.hex)}
            title={`Replace #${r.line} with ${s.hex}`}
            className="inline-flex items-center gap-1.5 rounded-md border bg-bg-elevated px-2 py-1 text-xs transition-colors hover:border-border-strong cursor-pointer"
          >
            <span className="inline-block h-3 w-3 rounded-sm border" style={{ backgroundColor: s.hex }} />
            <span className="font-mono">{s.hex}</span>
            <span className="text-fg-subtle">{formatRatio(s.ratio)}</span>
            <Wand2 className="h-3 w-3 text-fg-subtle" />
          </button>
        ) : (
          <span className="text-[11px] text-warning">{s.error}</span>
        )}
      </td>
    </tr>
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
