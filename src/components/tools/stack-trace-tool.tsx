"use client";

import { Fragment, useMemo, useState } from "react";
import { STACK_TRACE_SAMPLE, parseStackTrace, type Frame } from "@/lib/tools/stack-trace";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const PLATFORM_LABEL: Record<string, string> = { javascript: "JavaScript / Node / React", android: "Android / Java / Kotlin", ios: "iOS / Swift", unknown: "Unknown format" };

type Group = { kind: "app"; frame: Frame } | { kind: "noise"; frames: Frame[]; key: string };

function groupFrames(frames: Frame[], blockIndex: number): Group[] {
  const groups: Group[] = [];
  let noise: Frame[] = [];
  const flush = () => {
    if (noise.length) groups.push({ kind: "noise", frames: noise, key: `${blockIndex}-${noise[0].index}` });
    noise = [];
  };
  for (const f of frames) {
    if (f.origin === "app" || f.origin === "unknown") {
      flush();
      groups.push({ kind: "app", frame: f });
    } else noise.push(f);
  }
  flush();
  return groups;
}

export function StackTraceTool() {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const parsed = useMemo(() => (input.trim() ? parseStackTrace(input) : null), [input]);

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="space-y-4">
      <InputPanel
        title="Stack trace"
        description="JavaScript, Node, React / React Native, Android, Java and symbolicated iOS traces."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(STACK_TRACE_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="TypeError: Cannot read properties of undefined&#10;    at fn (file.js:10:5)…" className="min-h-[160px]" />
      </InputPanel>

      {!parsed ? (
        <EmptyState title="Paste a stack trace" description="Application frames get highlighted; framework and runtime frames are collapsed." />
      ) : parsed.frameCount === 0 && !parsed.blocks.length ? (
        <EmptyState title="No frames recognised" description="This doesn't look like a stack trace format we know." />
      ) : (
        <>
          <Alert tone="info">
            Frames are classified by path and package heuristics. The highlighted frames are the most likely places to look, but the actual root cause is not determined automatically.
          </Alert>

          <div className="grid gap-4 lg:grid-cols-5">
            <OutputPanel
              title="Cleaned trace"
              className="lg:col-span-3"
              actions={
                <>
                  <Badge tone="accent">{PLATFORM_LABEL[parsed.platform]}</Badge>
                  <Badge>{parsed.frameCount} frames</Badge>
                  <Badge tone="success">{parsed.appFrames.length} app</Badge>
                  <CopyButton value={parsed.cleaned} label="Copy cleaned" variant="primary" />
                </>
              }
            >
              <div className="space-y-4">
                {parsed.blocks.map((b, bi) => (
                  <div key={bi} className="overflow-x-auto rounded-lg border bg-bg-elevated font-mono text-xs leading-5">
                    {b.message ? <div className="border-b bg-danger-soft/50 px-3 py-2 font-semibold text-danger">{b.message}</div> : null}
                    {groupFrames(b.frames, bi).map((g) =>
                      g.kind === "app" ? (
                        <div key={g.frame.index} className={cn("flex gap-2 px-3 py-0.5", g.frame.origin === "app" ? "bg-accent-soft/40" : "")}>
                          <span className={cn("w-1 shrink-0 rounded-full", g.frame.origin === "app" ? "bg-accent" : "bg-transparent")} />
                          <span className="whitespace-pre">
                            {g.frame.fn ? <span className="text-fg">{g.frame.fn}</span> : null}
                            {g.frame.file ? (
                              <span className="text-fg-muted">
                                {g.frame.fn ? " (" : ""}
                                <span className="text-accent-strong">{g.frame.file}</span>
                                {g.frame.line !== null ? `:${g.frame.line}` : ""}
                                {g.frame.column !== null ? `:${g.frame.column}` : ""}
                                {g.frame.fn ? ")" : ""}
                              </span>
                            ) : null}
                            {!g.frame.fn && !g.frame.file ? <span className="text-fg-muted">{g.frame.raw}</span> : null}
                          </span>
                        </div>
                      ) : (
                        <Fragment key={g.key}>
                          <button type="button" onClick={() => toggle(g.key)} className="flex w-full items-center gap-2 px-3 py-0.5 text-left text-fg-subtle hover:bg-surface-hover cursor-pointer">
                            <span className="w-1 shrink-0" />
                            <span>
                              {expanded.has(g.key) ? "▾" : "▸"} {g.frames.length} framework/system {g.frames.length === 1 ? "frame" : "frames"}
                            </span>
                          </button>
                          {expanded.has(g.key)
                            ? g.frames.map((f) => (
                                <div key={f.index} className="flex gap-2 px-3 py-0.5 text-fg-subtle">
                                  <span className="w-1 shrink-0" />
                                  <span className="whitespace-pre">{f.raw}</span>
                                </div>
                              ))
                            : null}
                        </Fragment>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </OutputPanel>

            <OutputPanel title="Application locations" description="Files and positions from app frames, top of stack first." className="lg:col-span-2">
              {parsed.files.length ? (
                <div className="space-y-2">
                  {parsed.files.map((f, i) => (
                    <OutputRow key={i} label={`${f.file.split("/").pop() ?? f.file}${f.count > 1 ? ` ×${f.count}` : ""}`} value={`${f.file}${f.line !== null ? `:${f.line}` : ""}${f.column !== null ? `:${f.column}` : ""}`} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-subtle">No application frames were identified. Every frame looks like framework or runtime code.</p>
              )}
            </OutputPanel>
          </div>
        </>
      )}
    </div>
  );
}
