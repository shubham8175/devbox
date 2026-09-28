"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { httpStatusCodes, searchStatusCodes, statusCategories, type StatusCategory } from "@/data/http-status-codes";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const CATEGORY_TONE: Record<StatusCategory, "neutral" | "success" | "accent" | "warning" | "danger"> = {
  Informational: "neutral",
  Success: "success",
  Redirection: "accent",
  "Client Error": "warning",
  "Server Error": "danger",
};

const QUICK = [200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503];

export function HttpStatusTool() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StatusCategory | null>(null);

  const results = useMemo(() => {
    const base = searchStatusCodes(query);
    return category ? base.filter((s) => s.category === category) : base;
  }, [query, category]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or name, e.g. 404 or “too many”"
            className="h-11 pl-9"
            aria-label="Search status codes"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setQuery(String(c))}
              className={cn(
                "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors cursor-pointer",
                query === String(c)
                  ? "border-accent/40 bg-accent-soft text-accent-strong"
                  : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            All ({httpStatusCodes.length})
          </Chip>
          {statusCategories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Card>

      {results.length === 0 ? (
        <EmptyState icon={SearchX} title="No status codes match" description="Try a code like 418 or a word like “gateway”." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {results.map((s) => (
            <Card key={s.code} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{s.code}</span>
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone={CATEGORY_TONE[s.category]}>{s.category}</Badge>
                  <CopyButton value={`${s.code} ${s.name}`} iconOnly />
                </div>
              </div>
              <p className="text-sm text-fg-muted">{s.description}</p>
              <p className="text-xs leading-relaxed text-fg-subtle">
                <span className="font-medium text-fg-muted">Typical use: </span>
                {s.usage}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer",
        active ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
