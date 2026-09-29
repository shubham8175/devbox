"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Play, RotateCcw } from "lucide-react";
import { bezierOutputs, buildSvgPath, CUBIC_BEZIER_SAMPLE, formatBezier, parseBezier, PRESETS, Y_RANGE, type BezierPoints } from "@/lib/tools/cubic-bezier";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

const SIZE = 260;
/** Vertical room above and below the unit box so overshooting handles stay visible. */
const PAD = SIZE * 0.5;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function CubicBezierTool() {
  const [points, setPoints] = useState<BezierPoints>([0.25, 0.1, 0.25, 1]);
  const [text, setText] = useState(CUBIC_BEZIER_SAMPLE);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState(false);
  const [compare, setCompare] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<1 | 2 | null>(null);

  const outputs = useMemo(() => bezierOutputs(points), [points]);
  const path = useMemo(() => buildSvgPath(points, SIZE), [points]);

  const commit = (next: BezierPoints) => {
    setPoints(next);
    setText(formatBezier(next));
    setError(null);
  };
  const onText = (v: string) => {
    setText(v);
    const r = parseBezier(v);
    if (r.ok) {
      setPoints(r.points);
      setError(null);
    } else setError(r.error);
  };
  const setValue = (i: 0 | 1 | 2 | 3, v: number) => {
    if (!Number.isFinite(v)) return;
    const next = [...points] as BezierPoints;
    next[i] = i % 2 === 0 ? clamp(v, 0, 1) : clamp(v, -10, 10);
    commit(next);
  };
  const setHandle = (h: 1 | 2, x: number, y: number) => {
    const next = [...points] as BezierPoints;
    next[h === 1 ? 0 : 2] = round2(clamp(x, 0, 1));
    next[h === 1 ? 1 : 3] = round2(clamp(y, Y_RANGE.min, Y_RANGE.max));
    commit(next);
  };

  const toCurve = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = -PAD + ((e.clientY - rect.top) / rect.height) * (SIZE + 2 * PAD);
    return { x: x / SIZE, y: (SIZE - y) / SIZE };
  };
  const onPointerDown = (h: 1 | 2) => (e: PointerEvent<SVGCircleElement>) => {
    dragging.current = h;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGCircleElement>) => {
    const h = dragging.current;
    if (!h) return;
    const p = toCurve(e);
    if (p) setHandle(h, p.x, p.y);
  };
  const onPointerUp = () => {
    dragging.current = null;
  };
  const onKey = (h: 1 | 2) => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const x = points[h === 1 ? 0 : 2];
    const y = points[h === 1 ? 1 : 3];
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setHandle(h, x + m[0], y + m[1]);
  };

  const px = (x: number) => x * SIZE;
  const py = (y: number) => SIZE - y * SIZE;
  const [x1, y1, x2, y2] = points;
  const curveTransition = `transform 1.5s ${outputs.value}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Curve" description="Drag the handles (or focus one and use the arrow keys, Shift for bigger steps). y may overshoot beyond 0..1." />
        <div className="mx-auto max-w-[320px]">
          <svg ref={svgRef} viewBox={`0 ${-PAD} ${SIZE} ${SIZE + 2 * PAD}`} className="h-auto w-full select-none touch-none overflow-visible rounded-lg border bg-bg-elevated" role="img" aria-label="Cubic bezier curve editor">
            <rect x={0} y={0} width={SIZE} height={SIZE} className="fill-surface" />
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g} className="stroke-border" strokeWidth={1}>
                <line x1={px(g)} y1={0} x2={px(g)} y2={SIZE} />
                <line x1={0} y1={py(g)} x2={SIZE} y2={py(g)} />
              </g>
            ))}
            <rect x={0} y={0} width={SIZE} height={SIZE} className="fill-none stroke-border-strong" strokeWidth={1} />
            <line x1={0} y1={SIZE} x2={SIZE} y2={0} className="stroke-fg-subtle" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
            <line x1={0} y1={SIZE} x2={px(x1)} y2={py(y1)} className="stroke-accent" strokeWidth={1.5} opacity={0.7} />
            <line x1={SIZE} y1={0} x2={px(x2)} y2={py(y2)} className="stroke-warning" strokeWidth={1.5} opacity={0.7} />
            <path d={path} className="fill-none stroke-fg" strokeWidth={2.5} strokeLinecap="round" />
            {([1, 2] as const).map((h) => {
              const hx = h === 1 ? x1 : x2;
              const hy = h === 1 ? y1 : y2;
              return (
                <circle
                  key={h}
                  cx={px(hx)}
                  cy={py(hy)}
                  r={9}
                  className={cn("cursor-grab stroke-surface focus:outline-none focus-visible:stroke-ring", h === 1 ? "fill-accent" : "fill-warning")}
                  strokeWidth={2}
                  tabIndex={0}
                  role="slider"
                  aria-label={`Control point ${h}`}
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={hx}
                  aria-valuetext={`x ${hx}, y ${hy}`}
                  onPointerDown={onPointerDown(h)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onKeyDown={onKey(h)}
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {(["x1", "y1", "x2", "y2"] as const).map((k, i) => (
            <div key={k}>
              <Label htmlFor={`cb-${k}`}>{k}</Label>
              <Input id={`cb-${k}`} mono type="number" step="0.01" min={i % 2 === 0 ? 0 : undefined} max={i % 2 === 0 ? 1 : undefined} value={points[i]} onChange={(e) => setValue(i as 0 | 1 | 2 | 3, Number(e.target.value))} className="h-8 px-2 text-xs" />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Label htmlFor="cb-text">Paste a value</Label>
          <Input id="cb-text" mono value={text} onChange={(e) => onText(e.target.value)} invalid={!!error} placeholder="cubic-bezier(0.4, 0, 0.2, 1) or ease-in-out" />
          {error ? (
            <Alert tone="danger" className="mt-2">
              {error}
            </Alert>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => commit([...p.points] as BezierPoints)}
              className={cn("rounded-md border bg-bg-elevated px-2 py-1 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer", p.points.every((v, i) => v === points[i]) && "border-accent text-accent-strong")}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="shadow-card">
          <CardHeader
            title="Preview"
            description="Both balls run for 1.5 seconds."
            actions={
              <>
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-accent" /> Compare with linear
                </label>
                <Button size="sm" variant="primary" onClick={() => setAt((a) => !a)}>
                  {at ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {at ? "Back" : "Play"}
                </Button>
              </>
            }
          />
          <div className="space-y-3">
            <Track label={outputs.value} at={at} transition={curveTransition} tone="accent" />
            {compare ? <Track label="linear" at={at} transition="transform 1.5s linear" tone="muted" /> : null}
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Output" />
          <div className="space-y-2">
            <OutputRow label="Value" value={outputs.value} />
            <OutputRow label="Transition" value={outputs.transition} />
            <OutputRow label="Animation" value={outputs.animation} />
            <OutputRow label="Tailwind" value={outputs.tailwind} />
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Time</th>
                  {outputs.table.map((r) => (
                    <th key={r.percent} className="px-3 py-1.5 font-mono font-medium">
                      {r.percent}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-bg-elevated">
                  <td className="px-3 py-1.5 text-fg-muted">Progress</td>
                  {outputs.table.map((r) => (
                    <td key={r.percent} className="px-3 py-1.5 font-mono">
                      {Math.round(r.progress * 1000) / 10}%
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Track({ label, at, transition, tone }: { label: string; at: boolean; transition: string; tone: "accent" | "muted" }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] text-fg-subtle">{label}</div>
      <div className="relative h-10 rounded-lg border bg-bg-elevated">
        {/* The inner strip is (track - ball) wide, so translateX(100%) lands the ball exactly at the right edge. */}
        <div className="absolute inset-y-0 left-1 right-9" style={{ transform: at ? "translateX(100%)" : "translateX(0)", transition }}>
          <div className={cn("absolute top-1 h-8 w-8 rounded-full", tone === "accent" ? "bg-accent" : "bg-fg-subtle")} />
        </div>
      </div>
    </div>
  );
}
