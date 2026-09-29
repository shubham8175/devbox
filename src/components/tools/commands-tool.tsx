"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Search, SearchX, TriangleAlert, X } from "lucide-react";
import { COMMAND_SECTIONS, COMMAND_STACKS, MAX_QUERY_LENGTH, TOTAL_COMMANDS, platformOf, searchCommands, splitPlaceholders, type CommandEntry, type CommandSection, type CommandStack } from "@/lib/tools/commands";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { Highlight } from "@/components/highlight";
import { cn } from "@/lib/utils";

const QUICK = ["undo commit", "kill port", "clear cache", "deep link", "migrate", "venv", "force push", "disk space", "ssh key"];

/** Rows shown per section while browsing; searching or picking a section shows every row. */
const PREVIEW_ROWS = 8;

const stackCount = (stack: CommandStack) => COMMAND_SECTIONS.filter((s) => s.stack === stack).reduce((n, s) => n + s.entries.length, 0);

function CommandText({ cmd, query }: { cmd: string; query: string }) {
  return (
    <code className="break-all font-mono text-[13px] leading-relaxed text-fg">
      {splitPlaceholders(cmd).map((part, i) =>
        part.placeholder ? (
          <span key={i} className="italic text-accent-strong">
            {part.text}
          </span>
        ) : (
          <Highlight key={i} text={part.text} query={query} />
        ),
      )}
    </code>
  );
}

function CommandRow({ entry, section, query }: { entry: CommandEntry; section: CommandSection; query: string }) {
  // The section header already names a section-wide platform; only flag rows that differ.
  const platform = platformOf(entry, section);
  const showPlatform = platform && platform !== section.platform;
  return (
    <li className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CommandText cmd={entry.cmd} query={query} />
          {showPlatform ? <Badge>{platform}</Badge> : null}
          {entry.danger ? (
            <Badge tone="warning" title="Deletes data, discards work or kills processes">
              <TriangleAlert className="h-3 w-3" />
              destructive
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">
          <Highlight text={entry.description} query={query} />
        </p>
      </div>
      <CopyButton value={entry.cmd} iconOnly label={`Copy ${entry.cmd}`} toastMessage="Command copied" className="shrink-0" />
    </li>
  );
}

export function CommandsTool() {
  const [query, setQuery] = useState("");
  const [stack, setStack] = useState<CommandStack | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState(false);

  // Seed the search from ?q= so a search can be shared as a link. Read once on
  // the client; the page itself is statically rendered without it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed from the URL, not derived render state.
    if (q) setQuery(q.slice(0, MAX_QUERY_LENGTH));
  }, []);

  const updateQuery = (next: string) => {
    setQuery(next);
    const url = new URL(window.location.href);
    if (next.trim()) url.searchParams.set("q", next);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const results = useMemo(() => searchCommands(query, { stack, sectionId }), [query, stack, sectionId]);
  const matchCount = results.reduce((n, r) => n + r.hits.length, 0);
  const stackSections = stack ? COMMAND_SECTIONS.filter((s) => s.stack === stack) : [];
  const searching = Boolean(query.trim());
  const filtered = searching || Boolean(stack);
  const canCollapse = (hits: number) => !searching && !sectionId && hits > PREVIEW_ROWS + 2;
  const isOpen = (id: string, hits: number) => !canCollapse(hits) || expandAll || Boolean(expanded[id]);
  // Expanding happens below the fold, so say how much is hidden to make the toggle's effect visible.
  const hiddenCount = results.reduce((n, r) => n + (isOpen(r.section.id, r.hits.length) ? 0 : r.hits.length - PREVIEW_ROWS), 0);

  const toggleExpandAll = () => {
    setExpandAll((v) => !v);
    setExpanded({});
  };

  const pickStack = (next: CommandStack | null) => {
    setStack(next);
    setSectionId(null);
  };

  const reset = () => {
    updateQuery("");
    pickStack(null);
  };

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                updateQuery("");
              }
            }}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Search commands or tasks, e.g. “kill port”"
            className="h-11 pl-9 pr-9 text-base"
            aria-label="Search commands"
          />
          {query ? (
            <button type="button" onClick={() => updateQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-fg-subtle transition-colors hover:text-fg" aria-label="Clear search" title="Clear (Esc)">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => updateQuery(query === q ? "" : q)}
              aria-pressed={query === q}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs transition-colors",
                query === q ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={stack === null} onClick={() => pickStack(null)}>
            All ({TOTAL_COMMANDS})
          </Chip>
          {COMMAND_STACKS.map((s) => (
            <Chip key={s} active={stack === s} onClick={() => pickStack(stack === s ? null : s)}>
              {s} ({stackCount(s)})
            </Chip>
          ))}
        </div>

        {stackSections.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-3">
            <Chip small active={sectionId === null} onClick={() => setSectionId(null)}>
              All {stack}
            </Chip>
            {stackSections.map((s) => (
              <Chip key={s.id} small active={sectionId === s.id} onClick={() => setSectionId(sectionId === s.id ? null : s.id)}>
                {s.title}
              </Chip>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-subtle" aria-live="polite">
            {filtered ? `${matchCount} of ${TOTAL_COMMANDS} commands` : `${TOTAL_COMMANDS} commands in ${COMMAND_SECTIONS.length} sections`}
            {hiddenCount ? ` · ${hiddenCount} hidden in collapsed sections` : null}
            {" · "}
            <span className="italic text-accent-strong">&lt;placeholders&gt;</span> need replacing before you run a command
          </p>
          {hiddenCount || expandAll ? (
            <Button size="sm" variant="ghost" onClick={toggleExpandAll} aria-pressed={expandAll}>
              {expandAll ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
              {expandAll ? "Collapse long sections" : `Show all ${matchCount} commands`}
            </Button>
          ) : null}
        </div>
      </Card>

      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No commands match"
          description={
            <>
              Try a tool name like “docker” or a task like “free disk space”.{" "}
              <Button variant="ghost" size="sm" onClick={reset} className="mt-2">
                Reset filters
              </Button>
            </>
          }
        />
      ) : (
        results.map(({ section, hits }) => {
          const collapsible = canCollapse(hits.length);
          const open = isOpen(section.id, hits.length);
          const visible = open ? hits : hits.slice(0, PREVIEW_ROWS);
          const listId = `cmd-list-${section.id}`;
          return (
            <section key={section.id} aria-labelledby={`cmd-${section.id}`} className="overflow-hidden rounded-card border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 id={`cmd-${section.id}`} className="text-sm font-semibold text-fg">
                  {section.title}
                </h2>
                <div className="flex items-center gap-1.5">
                  {section.platform ? <Badge>{section.platform}</Badge> : null}
                  <Badge>{section.stack}</Badge>
                  <Badge tone="accent">{hits.length}</Badge>
                </div>
              </div>
              <ul id={listId} className="divide-y">
                {visible.map(({ entry }) => (
                  <CommandRow key={entry.cmd} entry={entry} section={section} query={query} />
                ))}
              </ul>
              {collapsible && !expandAll ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [section.id]: !open }))}
                  aria-expanded={open}
                  aria-controls={listId}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                >
                  {open ? "Show fewer" : `Show all ${hits.length} commands`}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                </button>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}

function Chip({ active, onClick, small, children }: { active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-full border font-medium transition-colors",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs",
        active ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
