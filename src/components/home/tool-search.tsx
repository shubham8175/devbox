"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Search, SearchX, Star, TrendingUp } from "lucide-react";
import { categories, getTool, popularTools, searchTools, toolsByCategory } from "@/data/tools";
import { useFavorites, useRecents } from "@/lib/store";
import { ToolCard } from "@/components/tool-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { ToolCategory, ToolWithRoute } from "@/types/tool";

function isCategory(v: string | null): v is ToolCategory {
  return !!v && (categories as string[]).includes(v);
}

export function ToolSearch() {
  const params = useSearchParams();
  const initialCategory = params.get("category");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ToolCategory | null>(isCategory(initialCategory) ? initialCategory : null);
  const favorites = useFavorites();
  const recents = useRecents();
  const trimmed = query.trim();

  const results = useMemo(() => searchTools(trimmed), [trimmed]);
  const filtering = trimmed.length > 0 || category !== null;
  const visible = useMemo(() => (category ? results.filter((t) => t.category === category) : results), [results, category]);

  const recentTools = recents.map(getTool).filter((t): t is ToolWithRoute => !!t).slice(0, 8);
  const favoriteTools = favorites.map(getTool).filter((t): t is ToolWithRoute => !!t);

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <div className="group relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle transition-colors group-focus-within:text-fg-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks: JSON, JWT, regex, CSV…"
            aria-label="Search tools"
            spellCheck={false}
            autoComplete="off"
            className={cn(
              "shadow-card h-12 w-full rounded-xl border bg-surface pl-10 pr-4 text-sm sm:pr-20 text-fg placeholder:text-fg-subtle",
              "transition-[border-color,box-shadow] hover:border-border-strong",
              "focus:border-accent/40 focus:outline-none focus:ring-3 focus:ring-accent/10",
            )}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={category === null} onClick={() => setCategory(null)}>
            All
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtering ? (
        <section>
          <SectionTitle>
            {visible.length} {visible.length === 1 ? "tool" : "tools"}
            {trimmed ? (
              <>
                {" "}
                for <span className="font-mono text-fg">&ldquo;{trimmed}&rdquo;</span>
              </>
            ) : null}
            {category ? <span className="text-fg-subtle"> in {category}</span> : null}
          </SectionTitle>
          {visible.length === 0 ? (
            <EmptyState icon={SearchX} title="No matching tools" description="Try a different keyword, or clear the category filter." />
          ) : (
            <Grid>
              {visible.map((t) => (
                <ToolCard key={t.id} tool={t} query={trimmed} />
              ))}
            </Grid>
          )}
        </section>
      ) : (
        <>
          {recentTools.length ? (
            <section>
              <SectionTitle icon={Clock}>Recently used</SectionTitle>
              <Grid>
                {recentTools.map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
              </Grid>
            </section>
          ) : null}
          {/* Popular tools come first until the user has starred something, so the
              first screen offers a concrete next step instead of an empty state. */}
          {favoriteTools.length ? <FavoritesSection tools={favoriteTools} /> : null}
          <section>
            <SectionTitle icon={TrendingUp}>Popular</SectionTitle>
            <Grid>
              {popularTools.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </Grid>
          </section>
          {favoriteTools.length ? null : <FavoritesSection tools={favoriteTools} />}
          {categories.map((c) => (
            <section key={c} id={`category-${c.replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
              <SectionTitle>{c}</SectionTitle>
              <Grid>
                {toolsByCategory(c).map((t) => (
                  <ToolCard key={t.id} tool={t} />
                ))}
              </Grid>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function FavoritesSection({ tools }: { tools: ToolWithRoute[] }) {
  return (
    <section>
      <SectionTitle icon={Star}>Favorites</SectionTitle>
      {tools.length ? (
        <Grid>
          {tools.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </Grid>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-fg-subtle">
          <Star className="h-3.5 w-3.5 shrink-0" />
          No favorites yet. Star a tool to pin it here and in the sidebar.
        </p>
      )}
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors cursor-pointer",
        active ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: typeof Star }) {
  return (
    <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
      {Icon ? <Icon className="h-3.5 w-3.5 text-fg-subtle" /> : null}
      {children}
    </h2>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{children}</div>;
}
