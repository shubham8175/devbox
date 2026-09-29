"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CornerDownLeft, Search, Star } from "lucide-react";
import { getTool, searchTools } from "@/data/tools";
import { useFavorites, useRecents } from "@/lib/store";
import { Highlight } from "@/components/highlight";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { ToolWithRoute } from "@/types/tool";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Mounts the panel only while open, so its search state resets every time. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  if (!open) return null;
  return <CommandPalettePanel onOpenChange={onOpenChange} />;
}

interface Group {
  label: string;
  icon?: typeof Star;
  items: ToolWithRoute[];
  /** Index of the first item within the flattened list */
  offset: number;
}

function CommandPalettePanel({ onOpenChange }: Pick<CommandPaletteProps, "onOpenChange">) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const favorites = useFavorites();
  const recents = useRecents();

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    const raw: Array<Omit<Group, "offset">> = [];
    if (q) {
      raw.push({ label: "Results", items: searchTools(q) });
    } else {
      const rec = recents.map(getTool).filter((t): t is ToolWithRoute => !!t);
      const fav = favorites.map(getTool).filter((t): t is ToolWithRoute => !!t);
      if (rec.length) raw.push({ label: "Recently used", icon: Clock, items: rec });
      if (fav.length) raw.push({ label: "Favorites", icon: Star, items: fav });
      const seen = new Set([...rec, ...fav].map((t) => t.id));
      raw.push({ label: rec.length || fav.length ? "All tools" : "Tools", items: searchTools("").filter((t) => !seen.has(t.id)) });
    }
    let offset = 0;
    return raw.map((g) => {
      const withOffset = { ...g, offset };
      offset += g.items.length;
      return withOffset;
    });
  }, [query, favorites, recents]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Lock the document behind the overlay and close on Esc even if focus has left the input.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onOpenChange]);

  const select = useCallback(
    (index: number) => {
      const tool = flat[index];
      if (!tool) return;
      onOpenChange(false);
      router.push(tool.href);
    },
    [flat, onOpenChange, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
        break;
      case "Enter":
        e.preventDefault();
        select(active);
        break;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,calc(env(safe-area-inset-top)+1.5rem))] backdrop-blur-[2px] sm:pt-[14vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="flex max-h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl animate-fade-in sm:max-h-[70dvh]">
        <div className="flex h-11 shrink-0 items-center gap-2.5 border-b px-3.5">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tools…"
            aria-label="Search tools"
            aria-controls="command-palette-results"
            aria-activedescendant={flat[active] ? `cmd-${flat[active].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            className="h-full w-full bg-transparent text-sm text-fg outline-none! placeholder:text-fg-subtle"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul ref={listRef} id="command-palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {flat.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-fg-muted">
              No tools match <span className="font-mono text-fg">&ldquo;{query}&rdquo;</span>
            </li>
          ) : (
            groups.map((group) => (
              <li key={group.label} role="presentation">
                <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-medium text-fg-subtle">
                  {group.icon ? <group.icon className="h-3 w-3" /> : null}
                  {group.label}
                </div>
                <ul role="group" aria-label={group.label}>
                  {group.items.map((tool, j) => {
                    const i = group.offset + j;
                    const Icon = tool.icon;
                    const isActive = i === active;
                    return (
                      <li
                        key={tool.id}
                        id={`cmd-${tool.id}`}
                        data-index={i}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => select(i)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                          isActive ? "bg-accent-soft text-fg" : "text-fg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                            isActive ? "border-accent/40 bg-surface text-accent-strong" : "border-border bg-bg-elevated text-fg-subtle",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-fg">
                            <Highlight text={tool.name} query={query} />
                          </span>
                          <span className="block truncate text-xs text-fg-muted">
                            <Highlight text={tool.description} query={query} />
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-fg-subtle sm:block">
                          <Highlight text={tool.category} query={query} />
                        </span>
                        {tool.shortcut ? (
                          <span className="hidden shrink-0 items-center gap-0.5 sm:flex" title={`Press ${tool.shortcut} anywhere`}>
                            {tool.shortcut.split(" ").map((k, ki) => (
                              <Kbd key={ki}>{k}</Kbd>
                            ))}
                          </span>
                        ) : null}
                        <CornerDownLeft className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle", isActive ? "opacity-100" : "opacity-0")} />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-3.5 py-1.5 text-[11px] text-fg-subtle">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>B</Kbd> sidebar
            </span>
            <span className="hidden items-center gap-1 md:flex">
              <Kbd>g</Kbd>
              <Kbd>h</Kbd> home
            </span>
          </div>
          <span className="hidden sm:inline">Your data stays on your device.</span>
        </div>
      </div>
    </div>
  );
}
