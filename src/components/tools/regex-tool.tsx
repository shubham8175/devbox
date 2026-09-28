"use client";

import { useState } from "react";
import { REGEX_FLAGS } from "@/lib/tools/regex";
import { useRegexWorker } from "@/hooks/use-regex-worker";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const SAMPLE_PATTERN = "(?<user>[\\w.+-]+)@(?<domain>[\\w-]+\\.[\\w.]+)";
const SAMPLE_TEXT = `Contact ada@example.com or grace.hopper@navy.mil for details.
Invalid: not-an-email@, @nope.com`;

export function RegexTool() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState<string>("g");
  const [text, setText] = useState("");

  const { result, running } = useRegexWorker(pattern, flags, text);

  const toggleFlag = (f: string) => {
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : cur + f));
  };

  const literal = pattern ? `/${pattern}/${flags}` : "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Pattern"
          actions={
            <>
              {!pattern && !text ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPattern(SAMPLE_PATTERN);
                    setText(SAMPLE_TEXT);
                    setFlags("gi");
                  }}
                >
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPattern("");
                    setText("");
                  }}
                >
                  Clear
                </Button>
              )}
              <CopyButton value={literal} label="Copy regex" />
            </>
          }
        />
        <div className="flex items-center gap-0">
          <span className="flex h-9 items-center rounded-l-lg border border-r-0 bg-surface-hover px-2.5 font-mono text-sm text-fg-subtle">/</span>
          <Input
            mono
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="([a-z]+)@([a-z]+)\.com"
            className="rounded-none"
            invalid={!result.ok}
            aria-label="Regular expression pattern"
          />
          <span className="flex h-9 items-center rounded-r-lg border border-l-0 bg-surface-hover px-2.5 font-mono text-sm text-fg-subtle">
            /{flags}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REGEX_FLAGS.map((f) => {
            const on = flags.includes(f.flag);
            return (
              <button
                key={f.flag}
                type="button"
                onClick={() => toggleFlag(f.flag)}
                title={f.description}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer",
                  on
                    ? "border-accent/40 bg-accent-soft text-accent-strong"
                    : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                <span className="font-mono font-semibold">{f.flag}</span>
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
        {!result.ok && result.error ? (
          <Alert tone="danger" className="mt-3">
            <span className="font-mono">{result.error}</span>
          </Alert>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Label htmlFor="regex-text" hint={`${text.length.toLocaleString()} chars`}>
            Test string
          </Label>
          <Textarea
            id="regex-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste text to test against"
            className="min-h-[220px]"
          />
        </Card>
        <Card>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-fg-muted">Highlighted</span>
            <Badge tone={result.matches.length ? "accent" : "neutral"}>
              {running ? "Evaluating…" : `${result.matches.length} ${result.matches.length === 1 ? "match" : "matches"}`}
            </Badge>
          </div>
          <div className="min-h-[220px] whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-[13px] leading-relaxed">
            {text ? (
              result.segments.map((s, i) =>
                s.matchIndex === null ? (
                  <span key={i}>{s.text}</span>
                ) : (
                  <mark key={i} className={s.matchIndex % 2 === 0 ? "mark-match" : "mark-match-alt"} title={`Match ${s.matchIndex + 1}`}>
                    {s.text}
                  </mark>
                ),
              )
            ) : (
              <span className="text-fg-subtle">Matches will be highlighted here</span>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Matches & groups" description={flags.includes("g") ? undefined : "Add the g flag to find every match."} />
        {result.matches.length === 0 ? (
          <EmptyState title="No matches yet" description="Enter a pattern and some text to see captures." className="py-8" />
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {result.matches.map((m, i) => (
              <div key={i} className="rounded-lg border bg-bg-elevated p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">#{i + 1}</Badge>
                  <span className="break-all font-mono text-sm">{m.match || <span className="text-fg-subtle">(empty)</span>}</span>
                  <span className="ml-auto font-mono text-[11px] text-fg-subtle">
                    {m.index}–{m.end}
                  </span>
                  <CopyButton value={m.match} iconOnly />
                </div>
                {m.groups.length ? (
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {m.groups.map((g, gi) => {
                      const name = Object.keys(m.named).find((k) => m.named[k] === g && g !== undefined);
                      return (
                        <div key={gi} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1 font-mono text-xs">
                          <span className="text-fg-subtle">
                            ${gi + 1}
                            {name ? ` · ${name}` : ""}
                          </span>
                          <span className="break-all">{g === undefined ? <span className="text-fg-subtle">undefined</span> : g}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
