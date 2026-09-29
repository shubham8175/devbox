"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Config as PurifyConfig } from "dompurify";
import { useDebounced } from "@/hooks/use-debounced";
import { Bold, Code, Download, Heading2, Italic, Link2, List, Table } from "lucide-react";
import { MARKDOWN_SAMPLE, renderMarkdown, wrapHtmlDocument, type MarkedLike, type PurifierLike } from "@/lib/tools/markdown";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type View = "preview" | "html" | "outline";

/** Typographic styles for the rendered preview, scoped with arbitrary variants so no global CSS is needed. */
const PROSE =
  "prose-devbox max-h-[640px] overflow-auto rounded-lg border bg-bg-elevated px-4 py-3 text-sm leading-relaxed text-fg " +
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight " +
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold " +
  "[&_p]:my-2 [&_a]:text-accent-strong [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold " +
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-surface [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs " +
  "[&_code]:rounded [&_code]:bg-surface-hover [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ol]:my-2 [&_ol]:list-decimal [&_li]:ml-5 [&_li]:my-0.5 [&_li_input[type=checkbox]]:mr-1.5 [&_li_input[type=checkbox]]:accent-accent " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted " +
  "[&_table]:my-3 [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:bg-surface-hover [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:px-2 [&_td]:py-1 " +
  "[&_hr]:my-4 [&_hr]:border-border [&_img]:max-w-full [&_img]:rounded-lg [&_del]:text-fg-subtle";

function download(text: string, name: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function MarkdownTool() {
  const [input, setInput] = useState("");
  const [breaks, setBreaks] = useState(false);
  const [view, setView] = useState<View>("preview");
  const [libs, setLibs] = useState<{ marked: MarkedLike; purify: PurifierLike } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // Lazy-load marked + DOMPurify together, only on this route.
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("marked"), import("dompurify")])
      .then(([m, d]) => {
        if (cancelled) return;
        setLibs({
          marked: { parse: (src, opts) => m.marked.parse(src, { ...opts, async: false }) },
          purify: { sanitize: (html, cfg) => d.default.sanitize(html, cfg as PurifyConfig) },
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The Markdown renderer failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the caret after a toolbar edit re-renders the textarea.
  useEffect(() => {
    const sel = pendingSelection.current;
    const ta = editorRef.current;
    if (sel && ta) {
      pendingSelection.current = null;
      ta.focus();
      ta.setSelectionRange(sel[0], sel[1]);
    }
  }, [input]);

  const debouncedInput = useDebounced(input, 150);
  const result = useMemo(() => {
    if (!libs || !debouncedInput.trim()) return null;
    return renderMarkdown(libs.marked, libs.purify, debouncedInput, { gfm: true, breaks });
  }, [libs, debouncedInput, breaks]);

  /** Wrap the selection (or insert a placeholder) with inline syntax. */
  const wrap = (before: string, after: string, placeholder: string) => {
    const ta = editorRef.current;
    const start = ta?.selectionStart ?? input.length;
    const end = ta?.selectionEnd ?? input.length;
    const selected = input.slice(start, end) || placeholder;
    setInput(input.slice(0, start) + before + selected + after + input.slice(end));
    pendingSelection.current = [start + before.length, start + before.length + selected.length];
  };
  /** Insert a block snippet on its own line at the caret. */
  const insertBlock = (block: string) => {
    const ta = editorRef.current;
    const start = ta?.selectionStart ?? input.length;
    const lineStart = input.lastIndexOf("\n", start - 1) + 1;
    // Blocks need a blank line above them; add one unless we are at the top or one is already there.
    const gap = lineStart > 0 && !input.slice(0, lineStart).endsWith("\n\n") ? "\n" : "";
    const snippet = `${gap}${block}\n`;
    setInput(input.slice(0, lineStart) + snippet + input.slice(lineStart));
    pendingSelection.current = [lineStart + snippet.length, lineStart + snippet.length];
  };

  const scrollToHeading = (id: string) => {
    // Scoped to the preview container, never document-wide, so page elements with the same id are untouched.
    const container = previewRef.current;
    if (!container) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")).find((el) => el.id === id);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const title = result?.ok ? (result.headings.find((h) => h.level === 1)?.text ?? "Document") : "Document";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Markdown"
        description="GitHub-flavoured: tables, task lists, strikethrough and fenced code."
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="accent-accent" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} />
              Line breaks
            </label>
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(MARKDOWN_SAMPLE)}>
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
        <div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formatting">
          <ToolbarButton label="Bold" onClick={() => wrap("**", "**", "bold text")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => wrap("_", "_", "italic text")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Inline code" onClick={() => wrap("`", "`", "code")}>
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Link" onClick={() => wrap("[", "](https://example.com)", "link text")}>
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Heading 2" onClick={() => insertBlock("## Heading")}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Bullet list" onClick={() => insertBlock("- First item\n- Second item")}>
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Table" onClick={() => insertBlock("| Column | Column |\n| --- | --- |\n| cell | cell |")}>
            <Table className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>
        <CodeTextarea ref={editorRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="# Hello\n\nWrite some **Markdown**…" className="min-h-[480px]" invalid={result ? !result.ok : false} aria-label="Markdown source" />
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-2">
            {result.error}
          </Alert>
        ) : null}
      </InputPanel>

      <OutputPanel
        title="Preview"
        actions={
          <>
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "preview", label: "Preview" },
                { value: "html", label: "HTML" },
                { value: "outline", label: "Outline" },
              ]}
            />
            <Button size="sm" onClick={() => result?.ok && download(wrapHtmlDocument(result.html, title), "document.html", "text/html")} disabled={!result?.ok} title="Download a standalone HTML file">
              <Download className="h-3.5 w-3.5" /> .html
            </Button>
            <Button size="sm" onClick={() => download(input, "document.md", "text/markdown")} disabled={!input.trim()} title="Download the Markdown source">
              <Download className="h-3.5 w-3.5" /> .md
            </Button>
            <CopyButton value={result?.ok ? result.html : ""} label="Copy HTML" variant="primary" />
          </>
        }
      >
        {loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !input.trim() ? (
          <EmptyState title="Start typing on the left" description="The preview renders live. Nothing leaves this page and nothing is stored." />
        ) : !libs ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-[420px] skeleton" />
            <p className="text-xs text-fg-subtle">Loading renderer…</p>
          </div>
        ) : !result?.ok ? (
          <EmptyState title="Fix the input to see the preview" className="py-8" />
        ) : (
          <>
            {/*
              Safe to inject: `result.html` is marked's output passed through DOMPurify
              (HTML profile, no style attributes, javascript: URLs removed) before the
              id/target post-passes, and marked itself never receives untrusted HTML
              from anywhere but this textarea.
            */}
            <article ref={previewRef} className={cn(PROSE, view !== "preview" && "hidden")} dangerouslySetInnerHTML={{ __html: result.html }} />
            {view === "html" ? <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{result.html}</pre> : null}
            {view === "outline" ? (
              result.headings.length ? (
                <ul className="space-y-0.5 rounded-lg border bg-bg-elevated p-2 text-sm">
                  {result.headings.map((h, i) => (
                    <li key={`${h.id}-${i}`} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                      <button
                        type="button"
                        onClick={() => {
                          setView("preview");
                          requestAnimationFrame(() => scrollToHeading(h.id));
                        }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-hover"
                      >
                        <span className="font-mono text-[10px] text-fg-subtle">h{h.level}</span>
                        <span className="truncate text-fg">{h.text}</span>
                        <span className="ml-auto truncate font-mono text-[10px] text-fg-subtle">#{h.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No headings yet" description="Add # headings to build an outline." className="py-8" />
              )
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{result.stats.words.toLocaleString()} words</Badge>
              <Badge>{result.stats.headings} headings</Badge>
              <Badge>{result.stats.links} links</Badge>
              <Badge>{result.stats.images} images</Badge>
              <Badge>{result.stats.codeBlocks} code blocks</Badge>
              <Badge>{result.stats.tables} tables</Badge>
            </div>
          </>
        )}
      </OutputPanel>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="icon" variant="ghost" onClick={onClick} aria-label={label} title={label}>
      {children}
    </Button>
  );
}
