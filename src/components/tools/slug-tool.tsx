"use client";

import { useMemo, useState } from "react";
import { DEFAULT_SLUG_OPTIONS, SLUG_EXAMPLES, slugify, type SlugOptions } from "@/lib/tools/slug";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { OutputRow } from "@/components/output-row";

export function SlugTool() {
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState<SlugOptions>(DEFAULT_SLUG_OPTIONS);
  const set = <K extends keyof SlugOptions>(k: K, v: SlugOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const slug = useMemo(() => slugify(input, opts), [input, opts]);
  const kebab = useMemo(() => slugify(input, { ...opts, separator: "-", lowercase: true }), [input, opts]);
  const lower = useMemo(() => slugify(input, { ...opts, lowercase: true }), [input, opts]);
  const underscore = useMemo(() => slugify(input, { ...opts, separator: "_" }), [input, opts]);
  const lines = input.split("\n").filter((l) => l.trim());

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <InputPanel title="Text" description="One slug per line if you paste several lines." actions={input ? <Button size="sm" variant="ghost" onClick={() => setInput("")}>Clear</Button> : null}>
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hello World 2026" className="min-h-[100px] font-sans" aria-label="Text to slugify" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SLUG_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setInput(ex)} className="rounded-md border bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
                {ex.trim()}
              </button>
            ))}
          </div>
        </InputPanel>

        <OutputPanel title="Output">
          {lines.length > 1 ? (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <OutputRow key={i} label={l.trim()} value={slugify(l, opts)} />
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              <OutputRow label="URL slug (your options)" value={slug} className="border-accent/30 bg-accent-soft/40" />
              <OutputRow label="kebab-case" value={kebab} />
              <OutputRow label="lowercase slug" value={lower} />
              <OutputRow label="snake_case" value={underscore} />
            </div>
          )}
        </OutputPanel>
      </div>

      <OutputPanel title="Options" className="lg:col-span-2 lg:self-start">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="slug-sep">Separator</Label>
              <Input id="slug-sep" mono value={opts.separator} onChange={(e) => set("separator", e.target.value.slice(0, 3))} placeholder="-" />
            </div>
            <div>
              <Label htmlFor="slug-max" hint="0 = none">
                Max length
              </Label>
              <Input id="slug-max" mono type="number" min={0} value={opts.maxLength} onChange={(e) => set("maxLength", Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>
          {(
            [
              ["lowercase", "Lowercase"],
              ["removeAccents", "Remove accents (é → e, ß → ss)"],
              ["preserveNumbers", "Preserve numbers"],
            ] as Array<[keyof SlugOptions, string]>
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input type="checkbox" checked={Boolean(opts[k])} onChange={(e) => set(k, e.target.checked as SlugOptions[typeof k])} className="accent-accent" />
              {label}
            </label>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setOpts(DEFAULT_SLUG_OPTIONS)}>
            Reset options
          </Button>
          <p className="text-[11px] text-fg-subtle">Unicode letters are kept when accents are not removed (e.g. 日本語), which is valid in modern URLs but will be percent-encoded by browsers.</p>
        </div>
      </OutputPanel>
    </div>
  );
}
