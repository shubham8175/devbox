"use client";

import { useMemo, useState } from "react";
import { useDebounced } from "@/hooks/use-debounced";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { LOGS_SAMPLE, LOG_LEVELS, countLevels, parseLogs, type LogEntry, type LogLevel } from "@/lib/tools/logs";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Highlight } from "@/components/highlight";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<LogLevel, { badge: "danger" | "warning" | "accent" | "neutral" | "success"; row: string }> = {
  FATAL: { badge: "danger", row: "border-l-danger bg-danger-soft/30" },
  ERROR: { badge: "danger", row: "border-l-danger bg-danger-soft/20" },
  WARN: { badge: "warning", row: "border-l-warning bg-warning-soft/20" },
  INFO: { badge: "accent", row: "border-l-accent" },
  DEBUG: { badge: "neutral", row: "border-l-border-strong" },
  TRACE: { badge: "neutral", row: "border-l-border text-fg-muted" },
  OTHER: { badge: "neutral", row: "border-l-border" },
};

const MAX_RENDER = 2000;

export function LogsTool() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(LOG_LEVELS));
  const [collapseDupes, setCollapseDupes] = useState(true);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const debouncedInput = useDebounced(input, 200);
  const entries = useMemo(() => (debouncedInput.trim() ? parseLogs(debouncedInput, collapseDupes) : []), [debouncedInput, collapseDupes]);
  const counts = useMemo(() => countLevels(entries), [entries]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => levels.has(e.level) && (!q || e.raw.toLowerCase().includes(q)));
  }, [entries, levels, search]);
  const visible = filtered.slice(0, MAX_RENDER);
  const hasJson = entries.some((e) => e.json);

  const toggleLevel = (l: LogLevel) =>
    setLevels((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });
  const toggleOpen = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="space-y-4">
      <InputPanel
        title="Logs"
        description="Plain lines, syslog, bracketed levels, key=value and JSON lines are all detected."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(LOGS_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste log output…" className="min-h-[140px]" />
      </InputPanel>

      {!entries.length ? (
        <EmptyState title="Waiting for logs" description="Levels are colour-coded, JSON is expandable, and you can search and filter." />
      ) : (
        <OutputPanel
          title="Pretty logs"
          description={`${filtered.length.toLocaleString()} of ${entries.length.toLocaleString()} entries${filtered.length > MAX_RENDER ? ` · showing first ${MAX_RENDER.toLocaleString()}` : ""}`}
          actions={<CopyButton value={filtered.map((e) => (e.repeat > 1 ? `${e.raw}   (×${e.repeat})` : e.raw)).join("\n")} label="Copy filtered" variant="primary" />}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search (case-insensitive)" className="h-8 pl-8 text-xs" aria-label="Search logs" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
              <input type="checkbox" checked={collapseDupes} onChange={(e) => setCollapseDupes(e.target.checked)} className="accent-accent" /> Collapse repeats
            </label>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {LOG_LEVELS.filter((l) => counts[l] > 0).map((l) => {
              const on = levels.has(l);
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggleLevel(l)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors cursor-pointer",
                    on ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-subtle line-through hover:border-border-strong",
                  )}
                >
                  {l} <span className="opacity-70">{counts[l]}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <EmptyState title="No entries match" description="Adjust the search or re-enable a level." className="py-8" />
          ) : (
            <div className="max-h-[640px] overflow-auto rounded-lg border bg-bg-elevated font-mono text-xs leading-5">
              {visible.map((e) => (
                <LogRow key={e.index} entry={e} query={search} open={open.has(e.index)} onToggle={() => toggleOpen(e.index)} />
              ))}
            </div>
          )}
          {hasJson ? <p className="mt-2 text-[11px] text-fg-subtle">Click a row with a JSON badge to expand its pretty-printed payload.</p> : null}
        </OutputPanel>
      )}
    </div>
  );
}

function LogRow({ entry, query, open, onToggle }: { entry: LogEntry; query: string; open: boolean; onToggle: () => void }) {
  const style = LEVEL_STYLE[entry.level];
  const expandable = !!entry.jsonPretty;
  return (
    <div className={cn("border-b border-l-2 last:border-b-0", style.row)}>
      <div
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={expandable ? onToggle : undefined}
        onKeyDown={expandable ? (ev) => (ev.key === "Enter" || ev.key === " ") && onToggle() : undefined}
        className={cn("flex flex-wrap items-start gap-x-2 gap-y-0.5 px-2 py-1", expandable && "cursor-pointer hover:bg-surface-hover")}
      >
        <span className="w-3 shrink-0 pt-0.5 text-fg-subtle">{expandable ? open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" /> : null}</span>
        {entry.timestamp ? <span className="min-w-0 break-all text-fg-subtle sm:shrink-0">{entry.timestamp}</span> : null}
        <Badge tone={style.badge} className="shrink-0 font-mono">
          {entry.level}
        </Badge>
        <span className="order-last min-w-0 flex-1 basis-full whitespace-pre-wrap break-all sm:order-none sm:basis-0">
          <Highlight text={entry.json ? entry.message : entry.raw} query={query} />
        </span>
        {entry.json ? <Badge className="shrink-0">JSON</Badge> : null}
        {entry.repeat > 1 ? <Badge tone="warning" className="shrink-0">×{entry.repeat}</Badge> : null}
      </div>
      {open && entry.jsonPretty ? <pre className="overflow-x-auto border-t bg-surface px-3 py-2 text-[11px] leading-relaxed text-fg-muted">{entry.jsonPretty}</pre> : null}
    </div>
  );
}
