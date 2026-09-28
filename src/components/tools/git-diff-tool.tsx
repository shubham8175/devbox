"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileMinus2, FilePlus2, FileSymlink, FileText, Binary } from "lucide-react";
import { GIT_DIFF_SAMPLE, parseGitDiff, type DiffFile } from "@/lib/tools/git-diff";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const STATUS: Record<DiffFile["status"], { label: string; tone: "success" | "danger" | "accent" | "neutral" | "warning"; Icon: typeof FileText }> = {
  modified: { label: "modified", tone: "warning", Icon: FileText },
  added: { label: "added", tone: "success", Icon: FilePlus2 },
  deleted: { label: "deleted", tone: "danger", Icon: FileMinus2 },
  renamed: { label: "renamed", tone: "accent", Icon: FileSymlink },
  binary: { label: "binary", tone: "neutral", Icon: Binary },
};

export function GitDiffTool() {
  const [input, setInput] = useState("");
  const parsed = useMemo(() => (input.trim() ? parseGitDiff(input) : null), [input]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="space-y-4">
      <InputPanel
        title="Raw diff"
        description="Output of git diff, git show or a .patch file."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(GIT_DIFF_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="diff --git a/file b/file…" className="min-h-[160px]" />
      </InputPanel>

      {!parsed ? (
        <EmptyState title="Paste a diff" description="Files, hunks and line numbers will be rendered here." />
      ) : parsed.files.length === 0 ? (
        <EmptyState title="No diff detected" description="Expected lines starting with diff --git, ---/+++ or @@ hunk headers." />
      ) : (
        <>
          <OutputPanel
            title="Summary"
            actions={
              <>
                <Badge>{parsed.files.length} {parsed.files.length === 1 ? "file" : "files"} changed</Badge>
                <Badge tone="success">+{parsed.totalAdded}</Badge>
                <Badge tone="danger">−{parsed.totalRemoved}</Badge>
              </>
            }
          >
            <ul className="space-y-1">
              {parsed.files.map((f, i) => {
                const meta = STATUS[f.status];
                const total = f.added + f.removed || 1;
                return (
                  <li key={i} className="flex items-center gap-3 rounded-lg border bg-bg-elevated px-3 py-1.5 text-xs">
                    <meta.Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <button type="button" onClick={() => document.getElementById(`diff-file-${i}`)?.scrollIntoView({ block: "start", behavior: "smooth" })} className="min-w-0 flex-1 truncate text-left font-mono hover:text-accent-strong cursor-pointer">
                      {f.status === "renamed" ? `${f.oldPath} → ${f.newPath}` : f.newPath === "/dev/null" ? f.oldPath : f.newPath}
                    </button>
                    <span className="hidden font-mono text-success sm:inline">+{f.added}</span>
                    <span className="hidden font-mono text-danger sm:inline">−{f.removed}</span>
                    <span className="flex h-1.5 w-20 overflow-hidden rounded-full bg-surface-hover">
                      <span className="bg-success" style={{ width: `${(f.added / total) * 100}%` }} />
                      <span className="bg-danger" style={{ width: `${(f.removed / total) * 100}%` }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </OutputPanel>

          {parsed.files.map((f, i) => {
            const meta = STATUS[f.status];
            const open = !collapsed.has(i);
            return (
              <div key={i} id={`diff-file-${i}`} className="shadow-card overflow-hidden rounded-card border bg-surface">
                <button type="button" onClick={() => toggle(i)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-hover cursor-pointer" aria-expanded={open}>
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle" /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />}
                  <meta.Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 break-all font-mono text-sm">{f.status === "renamed" ? `${f.oldPath} → ${f.newPath}` : f.newPath === "/dev/null" ? f.oldPath : f.newPath}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="font-mono text-xs text-success">+{f.added}</span>
                  <span className="font-mono text-xs text-danger">−{f.removed}</span>
                </button>
                {open ? (
                  f.binary || !f.hunks.length ? (
                    <div className="border-t px-4 py-3 text-xs text-fg-subtle">{f.binary ? "Binary file, no text diff." : "No hunks."}</div>
                  ) : (
                    <div className="overflow-x-auto border-t bg-bg-elevated font-mono text-xs leading-5">
                      {f.hunks.map((h, hi) => (
                        <div key={hi}>
                          <div className="bg-accent-soft/50 px-3 py-1 text-accent-strong">{h.header}</div>
                          {h.lines.map((l, li) => (
                            <div key={li} className={cn("flex", l.kind === "add" && "diff-add", l.kind === "del" && "diff-del", l.kind === "meta" && "text-fg-subtle italic")}>
                              <span className="w-10 shrink-0 select-none border-r px-1.5 text-right text-fg-subtle">{l.oldNo ?? ""}</span>
                              <span className="w-10 shrink-0 select-none border-r px-1.5 text-right text-fg-subtle">{l.newNo ?? ""}</span>
                              <span className={cn("w-5 shrink-0 select-none text-center", l.kind === "add" ? "text-success" : l.kind === "del" ? "text-danger" : "text-fg-subtle")}>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
                              <span className="flex-1 whitespace-pre pr-3">{l.text || " "}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
