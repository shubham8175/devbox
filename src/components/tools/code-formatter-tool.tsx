"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { AlignLeft, Download, Minimize2 } from "lucide-react";
import {
  CODE_FORMATTER_SAMPLE,
  DEFAULT_FORMAT_OPTIONS,
  detectLanguage,
  formatCode,
  FORMATTER_LANGUAGES,
  getFormatterLanguage,
  minifyCode,
  type FormatOptions,
  type FormatterLanguageId,
  type PrettierLike,
} from "@/lib/tools/code-formatter";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type LanguageChoice = FormatterLanguageId | "auto";
type Mode = "format" | "minify";
type Outcome = { ok: true; output: string } | { ok: false; error: string };

/** Static import map so the bundler can split each Prettier plugin into its own chunk. */
const PLUGIN_LOADERS: Record<string, () => Promise<unknown>> = {
  "prettier/plugins/html": () => import("prettier/plugins/html"),
  "prettier/plugins/postcss": () => import("prettier/plugins/postcss"),
  "prettier/plugins/babel": () => import("prettier/plugins/babel"),
  "prettier/plugins/estree": () => import("prettier/plugins/estree"),
  "prettier/plugins/typescript": () => import("prettier/plugins/typescript"),
  "prettier/plugins/markdown": () => import("prettier/plugins/markdown"),
  "prettier/plugins/yaml": () => import("prettier/plugins/yaml"),
  "prettier/plugins/graphql": () => import("prettier/plugins/graphql"),
};

function download(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const JS_LIKE: FormatterLanguageId[] = ["javascript", "typescript", "jsx", "tsx"];

export function CodeFormatterTool() {
  const [input, setInput] = useState("");
  const [choice, setChoice] = useState<LanguageChoice>("auto");
  const [mode, setMode] = useState<Mode>("format");
  const [options, setOptions] = useState<FormatOptions>(DEFAULT_FORMAT_OPTIONS);
  const [engine, setEngine] = useState<{ language: FormatterLanguageId; prettier: PrettierLike } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formatted, setFormatted] = useState<Outcome | null>(null);
  const pluginCache = useRef(new Map<string, Promise<unknown>>());

  const debouncedInput = useDebounced(input, 250);
  const detected = useMemo(() => detectLanguage(debouncedInput), [debouncedInput]);
  const language: FormatterLanguageId | null = choice === "auto" ? detected : choice;

  // Lazy-load Prettier standalone plus only the plugins the current language needs.
  useEffect(() => {
    if (!language || mode !== "format") return;
    if (engine?.language === language) return;
    let cancelled = false;
    const cache = pluginCache.current;
    const load = (id: string) => {
      let p = cache.get(id);
      if (!p) {
        p = PLUGIN_LOADERS[id]();
        cache.set(id, p);
      }
      return p;
    };
    Promise.all([import("prettier/standalone"), ...getFormatterLanguage(language).plugins.map(load)])
      .then(([standalone, ...plugins]) => {
        if (cancelled) return;
        setEngine({ language, prettier: { format: (src, opts) => standalone.format(src, opts), plugins } });
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Prettier failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [language, mode, engine]);

  // Minifying is synchronous and cheap; derive it directly.
  const minified = useMemo<Outcome | null>(() => (mode === "minify" && language && debouncedInput.trim() ? minifyCode(debouncedInput, language) : null), [mode, language, debouncedInput]);

  // Formatting is async (Prettier returns a promise), so its result lives in state, set only from the promise callback.
  useEffect(() => {
    if (mode !== "format" || !debouncedInput.trim() || !language || !engine || engine.language !== language) return;
    let cancelled = false;
    formatCode(engine.prettier, debouncedInput, language, options).then((r) => {
      if (!cancelled) setFormatted(r);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedInput, language, mode, engine, options]);

  const outcome: Outcome | null = !debouncedInput.trim() || !language ? null : mode === "minify" ? minified : formatted;
  const lang = language ? getFormatterLanguage(language) : null;
  const loading = mode === "format" && Boolean(language) && engine?.language !== language && !loadError;
  const setOpt = <K extends keyof FormatOptions>(key: K, value: FormatOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Source"
        description="Formatting runs in your browser with Prettier. Nothing is uploaded."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(CODE_FORMATTER_SAMPLE)}>
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
            <Label htmlFor="fmt-language">Language</Label>
            <div className="flex items-center gap-2">
              <Select id="fmt-language" value={choice} onChange={(e) => setChoice(e.target.value as LanguageChoice)} className="w-40">
                <option value="auto">Auto-detect</option>
                {FORMATTER_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
              {choice === "auto" && input.trim() ? <Badge tone={detected ? "accent" : "warning"}>{detected ? getFormatterLanguage(detected).label : "Unknown"}</Badge> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="fmt-width">Print width</Label>
            <Input id="fmt-width" type="number" min={20} max={400} value={options.printWidth} onChange={(e) => setOpt("printWidth", Number(e.target.value) || 80)} className="w-24" mono />
          </div>
          <div>
            <Label>Tab width</Label>
            <Segmented
              size="sm"
              value={String(options.tabWidth) as "2" | "4"}
              onChange={(v) => setOpt("tabWidth", Number(v))}
              options={[
                { value: "2", label: "2" },
                { value: "4", label: "4" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="accent-accent" checked={options.semi} onChange={(e) => setOpt("semi", e.target.checked)} />
              Semicolons
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="accent-accent" checked={options.singleQuote} onChange={(e) => setOpt("singleQuote", e.target.checked)} />
              Single quotes
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="accent-accent" checked={options.useTabs} onChange={(e) => setOpt("useTabs", e.target.checked)} />
              Tabs
            </label>
          </div>
        </div>
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="<div><p>Paste HTML, CSS, JavaScript, TypeScript, JSON…</p></div>" className="min-h-[380px]" invalid={outcome ? !outcome.ok : false} aria-label="Source code" />
        {outcome && !outcome.ok ? (
          <Alert tone="danger" className="mt-2">
            <span className="font-mono">{outcome.error}</span>
          </Alert>
        ) : null}
        {input.trim() && !language ? (
          <Alert tone="warning" className="mt-2">
            Could not detect the language. Pick one from the list.
          </Alert>
        ) : null}
      </InputPanel>

      <OutputPanel
        title={mode === "format" ? "Formatted" : "Minified"}
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "format", label: "Format" },
                { value: "minify", label: "Minify" },
              ]}
            />
            <Button size="sm" onClick={() => outcome?.ok && setInput(outcome.output)} disabled={!outcome?.ok} title="Replace input with output">
              {mode === "format" ? <AlignLeft className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />} Apply
            </Button>
            <Button size="sm" onClick={() => outcome?.ok && download(outcome.output, `${mode === "format" ? "formatted" : "minified"}.${lang?.extension ?? "txt"}`)} disabled={!outcome?.ok}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <CopyButton value={outcome?.ok ? outcome.output : ""} variant="primary" />
          </>
        }
      >
        {loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !input.trim() ? (
          <EmptyState title="Paste code to format" description="HTML, CSS, SCSS, Less, JavaScript, TypeScript, JSX, TSX, JSON, Markdown, YAML, GraphQL and Vue." />
        ) : loading ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-[340px] skeleton" />
            <p className="text-xs text-fg-subtle">Loading Prettier for {lang?.label}…</p>
          </div>
        ) : outcome?.ok ? (
          <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{outcome.output}</pre>
        ) : (
          <EmptyState title={language ? "Fix the input to see output" : "Pick a language"} className="py-8" />
        )}
        {mode === "minify" && language && JS_LIKE.includes(language) ? (
          <Alert tone="info" className="mt-3">
            For JavaScript and TypeScript this only removes comments, blank lines and indentation (strings, template literals and regexes are kept intact). It is not a real minifier; use a bundler for production builds.
          </Alert>
        ) : null}
        {outcome?.ok ? (
          <div className="mt-3">
            <Badge>
              {debouncedInput.length.toLocaleString()} → {outcome.output.length.toLocaleString()} chars
            </Badge>
          </div>
        ) : null}
      </OutputPanel>
    </div>
  );
}
