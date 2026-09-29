"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { CSS_TO_TAILWIND_SAMPLE, cssToTailwind, TAILWIND_CSS_SAMPLE, tailwindToCss } from "@/lib/tools/tailwind-css";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Direction = "tw-to-css" | "css-to-tw";

export function TailwindCssTool() {
  const [direction, setDirection] = useState<Direction>("tw-to-css");
  const [classes, setClasses] = useState("");
  const [css, setCss] = useState("");
  const [unit, setUnit] = useState<"rem" | "px">("rem");
  const [selector, setSelector] = useState(".element");

  const forwardMode = direction === "tw-to-css";
  const input = forwardMode ? classes : css;
  const setInput = forwardMode ? setClasses : setCss;
  const debounced = useDebounced(input, 150);

  const forward = useMemo(() => (forwardMode && debounced.trim() ? tailwindToCss(debounced, { unit, selector }) : null), [forwardMode, debounced, unit, selector]);
  const reverse = useMemo(() => (!forwardMode && debounced.trim() ? cssToTailwind(debounced) : null), [forwardMode, debounced]);
  const output = forwardMode ? (forward?.css ?? "") : (reverse?.classes.join(" ") ?? "");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={forwardMode ? "Tailwind classes" : "CSS"}
        description={forwardMode ? "Core utilities, variants (hover:, md:, dark:, group-hover:) and ! important. v3 default palette and scale." : "A whole rule or bare declarations. Selectors and media queries are ignored."}
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(forwardMode ? TAILWIND_CSS_SAMPLE : CSS_TO_TAILWIND_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label>Direction</Label>
            <Segmented
              size="sm"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "tw-to-css", label: "Tailwind → CSS" },
                { value: "css-to-tw", label: "CSS → Tailwind" },
              ]}
            />
          </div>
          {forwardMode ? (
            <>
              <div>
                <Label>Units</Label>
                <Segmented
                  size="sm"
                  value={unit}
                  onChange={setUnit}
                  options={[
                    { value: "rem", label: "rem" },
                    { value: "px", label: "px" },
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="tw-selector">Selector</Label>
                <Input id="tw-selector" mono value={selector} onChange={(e) => setSelector(e.target.value.slice(0, 60))} className="h-8 w-36 text-xs" />
              </div>
            </>
          ) : null}
        </div>
        <CodeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={forwardMode ? "flex items-center gap-4 p-4 md:p-6 hover:bg-slate-100" : ".card {\n  display: flex;\n  padding: 1rem;\n}"}
          className="min-h-[300px]"
          aria-label={forwardMode ? "Tailwind classes" : "CSS input"}
        />
        <p className="mt-2 text-xs text-fg-subtle">Nothing leaves this page and nothing is stored.</p>
      </InputPanel>

      <OutputPanel title={forwardMode ? "CSS" : "Tailwind classes"} actions={<CopyButton value={output} variant="primary" />}>
        {!input.trim() ? (
          <EmptyState title={forwardMode ? "Paste classes to translate" : "Paste CSS to translate"} description={forwardMode ? "Spacing, sizing, flex, grid, typography, colours, borders, shadows, transitions and transforms." : "Exact matches first, then the nearest spacing step (with a note), then arbitrary values."} />
        ) : forwardMode && forward ? (
          <div className="space-y-3">
            {forward.css ? <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{forward.css}</pre> : <EmptyState title="No recognised classes" className="py-8" />}
            {forward.unknown.length ? (
              <Alert tone="warning">
                <div className="mb-1 font-medium">Unknown classes (not translated)</div>
                <div className="flex flex-wrap gap-1">
                  {forward.unknown.map((u) => (
                    <Badge key={u} tone="warning" className="font-mono">
                      {u}
                    </Badge>
                  ))}
                </div>
              </Alert>
            ) : null}
            {forward.notes.map((n) => (
              <Alert key={n} tone="info">
                {n}
              </Alert>
            ))}
            <div className="flex flex-wrap gap-1.5">
              <Badge>{forward.blocks.length} blocks</Badge>
              <Badge>{forward.blocks.reduce((n, b) => n + b.declarations.length, 0)} declarations</Badge>
            </div>
          </div>
        ) : reverse ? (
          <div className="space-y-3">
            {reverse.classes.length ? (
              <>
                <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{reverse.classes.join(" ")}</pre>
                <div className="flex flex-wrap gap-1">
                  {reverse.classes.map((c) => (
                    <Badge key={c} tone="accent" className="font-mono">
                      {c}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title="No declarations recognised" className="py-8" />
            )}
            {reverse.unmapped.length ? (
              <Alert tone="warning">
                <div className="mb-1 font-medium">No utility for these declarations</div>
                <ul className="font-mono">
                  {reverse.unmapped.map((d, i) => (
                    <li key={`${d.property}-${i}`}>
                      {d.property}: {d.value}
                    </li>
                  ))}
                </ul>
                <div className="mt-1">Tailwind accepts arbitrary properties as <code className="font-mono">[property:value]</code>.</div>
              </Alert>
            ) : null}
            {reverse.notes.map((n) => (
              <Alert key={n} tone="info">
                {n}
              </Alert>
            ))}
          </div>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-40 skeleton" />
          </div>
        )}
      </OutputPanel>
    </div>
  );
}
