"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { DEFAULT_JSX_OPTIONS, DEFAULT_SVG_OPTIONS, SVG_SAMPLE, optimizeSvg, svgToJsx, type SvgOptimizeOptions, type SvgToJsxOptions } from "@/lib/tools/svg";
import { useDebounced } from "@/hooks/use-debounced";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Mode = "optimize" | "jsx";

const OPTIMIZE_FLAGS: Array<{ key: keyof SvgOptimizeOptions; label: string }> = [
  { key: "removeComments", label: "Remove comments" },
  { key: "removeMetadata", label: "Remove metadata, title, desc" },
  { key: "keepTitle", label: "…but keep <title>" },
  { key: "removeEditorNamespaces", label: "Remove editor namespaces (Inkscape, Sketch, Figma…)" },
  { key: "removeXmlDeclaration", label: "Remove XML declaration / doctype" },
  { key: "removeDefaults", label: "Remove default-valued attributes" },
  { key: "removeEmptyGroups", label: "Remove empty groups" },
  { key: "collapseWhitespace", label: "Collapse whitespace" },
  { key: "roundNumbers", label: "Round numbers" },
  { key: "removeIds", label: "Remove unused IDs" },
  { key: "minifyStyles", label: "Minify style attributes" },
  { key: "removeDimensions", label: "Remove width/height (keep viewBox)" },
];

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function download(text: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function SvgTool() {
  const [mode, setMode] = useState<Mode>("optimize");
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState<SvgOptimizeOptions>(DEFAULT_SVG_OPTIONS);
  const [jsxOpts, setJsxOpts] = useState<SvgToJsxOptions>(DEFAULT_JSX_OPTIONS);
  const [fileError, setFileError] = useState<string | null>(null);

  const debounced = useDebounced(input, 200);
  const optimized = useMemo(() => (debounced.trim() ? optimizeSvg(debounced, opts) : null), [debounced, opts]);
  const jsx = useMemo(() => (mode === "jsx" && debounced.trim() ? svgToJsx(debounced, jsxOpts) : null), [mode, debounced, jsxOpts]);
  const result = mode === "optimize" ? optimized : jsx;
  const error = result && !result.ok ? result.error : null;

  // Preview the optimized markup through an <img> data URL: an <img> can never run
  // scripts or load external resources, unlike injecting the markup into the DOM.
  const previewUrl = useMemo(() => (optimized?.ok ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(optimized.svg)}` : null), [optimized]);

  const onFile = (file: File) => {
    setFileError(null);
    file
      .text()
      .then((text) => setInput(text.slice(0, 2_000_000)))
      .catch(() => setFileError("Could not read that file."));
  };

  const output = result?.ok ? (mode === "optimize" && optimized?.ok ? optimized.svg : jsx?.ok ? jsx.code : "") : "";
  const toggle = (key: keyof SvgOptimizeOptions) => setOpts((o) => ({ ...o, [key]: !o[key] }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <InputPanel
          title="SVG"
          description="Processed locally; the file never leaves this page."
          actions={
            <>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "optimize", label: "Optimize" },
                  { value: "jsx", label: "JSX" },
                ]}
              />
              {!input ? (
                <Button size="sm" variant="ghost" onClick={() => setInput(SVG_SAMPLE)}>
                  Load sample
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                  Clear
                </Button>
              )}
            </>
          }
        >
          <Dropzone accept=".svg,image/svg+xml" onFile={onFile} compact title="Drop an .svg file" paste={false} maxBytes={2_000_000} className="mb-3" />
          {fileError ? (
            <Alert tone="danger" className="mb-3">
              {fileError}
            </Alert>
          ) : null}
          <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <path d="M12 2 3 14h7.5L9 22l10-12h-7.5z"/>\n</svg>'} className="min-h-[280px]" invalid={!!error} aria-label="SVG markup" />
          {error ? (
            <Alert tone="danger" className="mt-2">
              {error}
            </Alert>
          ) : null}
        </InputPanel>

        <Card>
          <CardHeader title={mode === "optimize" ? "Optimizations" : "Component options"} />
          {mode === "optimize" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIMIZE_FLAGS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" className="accent-accent" checked={opts[f.key] as boolean} onChange={() => toggle(f.key)} disabled={f.key === "keepTitle" && !opts.removeMetadata} />
                  {f.label}
                </label>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="svg-precision" hint={`${opts.precision} decimals`}>
                  Number precision
                </Label>
                <input id="svg-precision" type="range" min={0} max={6} value={opts.precision} onChange={(e) => setOpts((o) => ({ ...o, precision: Number(e.target.value) }))} className="w-full accent-accent" aria-label="Number precision" disabled={!opts.roundNumbers} />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="svg-component-name">Component name</Label>
                <Input id="svg-component-name" mono value={jsxOpts.componentName} onChange={(e) => setJsxOpts((o) => ({ ...o, componentName: e.target.value }))} placeholder="Icon" />
              </div>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-accent" checked={jsxOpts.typescript} onChange={() => setJsxOpts((o) => ({ ...o, typescript: !o.typescript }))} />
                TypeScript (.tsx)
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-accent" checked={jsxOpts.exportDefault} onChange={() => setJsxOpts((o) => ({ ...o, exportDefault: !o.exportDefault }))} />
                Default export
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-accent" checked={jsxOpts.currentColor} onChange={() => setJsxOpts((o) => ({ ...o, currentColor: !o.currentColor }))} />
                Single colour → currentColor
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" className="accent-accent" checked={jsxOpts.sizeProps} onChange={() => setJsxOpts((o) => ({ ...o, sizeProps: !o.sizeProps }))} />
                width / height as props
              </label>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <OutputPanel
          title={mode === "optimize" ? "Optimized SVG" : jsx?.ok ? jsx.fileName : "Component"}
          actions={
            <>
              {mode === "optimize" && optimized?.ok ? (
                <>
                  <Badge>{formatBytes(optimized.before)}</Badge>
                  <span className="text-xs text-fg-subtle">→</span>
                  <Badge tone="success">{formatBytes(optimized.after)}</Badge>
                  <Badge tone={optimized.savedPercent > 0 ? "accent" : "neutral"}>−{optimized.savedPercent}%</Badge>
                </>
              ) : null}
              <Button size="sm" onClick={() => download(output, mode === "optimize" ? "optimized.svg" : (jsx?.ok ? jsx.fileName : "Icon.tsx"), mode === "optimize" ? "image/svg+xml" : "text/plain")} disabled={!output}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
              <CopyButton value={output} variant="primary" />
            </>
          }
        >
          {!input.trim() ? (
            <EmptyState title="Paste or drop an SVG" description={mode === "optimize" ? "Strips editor cruft, rounds numbers and removes unused IDs safely." : "Converts attributes to camelCase, style strings to objects and adds a props spread."} />
          ) : result?.ok ? (
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{output}</pre>
          ) : (
            <EmptyState title="Fix the SVG to see output" className="py-8" />
          )}
          {mode === "optimize" && optimized?.ok && optimized.steps.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {optimized.steps.map((s, i) => (
                <li key={i}>
                  <Badge>{s}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </OutputPanel>

        {previewUrl ? (
          <Card>
            <CardHeader title="Preview" description="Rendered from the optimized markup through an <img>, which cannot execute scripts." />
            <div
              className="flex h-48 items-center justify-center rounded-lg border"
              style={{
                backgroundImage: "linear-gradient(45deg, #80808022 25%, transparent 25%), linear-gradient(-45deg, #80808022 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808022 75%), linear-gradient(-45deg, transparent 75%, #80808022 75%)",
                backgroundSize: "16px 16px",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL preview; next/image cannot optimise it */}
              <img src={previewUrl} alt="Optimized SVG preview" className="max-h-40 max-w-full" />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
