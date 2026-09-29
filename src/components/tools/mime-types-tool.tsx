"use client";

import { useMemo, useState } from "react";
import { contentTypeHeader, detectQueryKind, isCompressible, lookupByExtension, lookupByType, MIME_CATEGORIES, MIME_SAMPLE, MIME_TABLE, normalizeExtension, searchMime, type MimeCategory, type MimeEntry } from "@/lib/tools/mime-types";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

const KIND_LABEL = { type: "media type", extension: "extension", text: "search" } as const;

function ResultCard({ entry, highlight }: { entry: MimeEntry; highlight?: string }) {
  const compressible = isCompressible(entry.type);
  return (
    <Card className="shadow-card">
      <CardHeader
        title={<span className="font-mono">{entry.type}</span>}
        description={entry.description}
        actions={
          <>
            <Badge tone="accent">{entry.category}</Badge>
            <Badge tone={compressible ? "success" : "neutral"}>{compressible ? "compressible" : "not compressible"}</Badge>
          </>
        }
      />
      <OutputGrid>
        <OutputRow label="Content-Type header" value={contentTypeHeader(entry.type)} className="sm:col-span-2" />
        <OutputRow label="Type" value={entry.type} />
        <OutputRow label="Extensions" value={entry.extensions.map((x) => `.${x}`).join(" ")} placeholder="none (used only in headers)" />
      </OutputGrid>
      {entry.extensions.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.extensions.map((x) => (
            <Badge key={x} tone={x === highlight ? "accent" : "neutral"} className="font-mono">
              .{x}
            </Badge>
          ))}
        </div>
      ) : null}
      {entry.aliases?.length ? (
        <p className="mt-3 text-xs text-fg-muted">
          Also seen as: <span className="font-mono">{entry.aliases.join(", ")}</span>
        </p>
      ) : null}
      {entry.notes ? (
        <Alert tone="info" className="mt-3">
          {entry.notes}
        </Alert>
      ) : null}
    </Card>
  );
}

export function MimeTypesTool() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MimeCategory | "all">("all");

  const kind = useMemo(() => detectQueryKind(query), [query]);
  const results = useMemo<MimeEntry[]>(() => {
    const q = query.trim();
    if (!q) return [];
    if (kind === "type") {
      const exact = lookupByType(q);
      return exact ? [exact] : searchMime(q);
    }
    if (kind === "extension") {
      const hits = lookupByExtension(q);
      return hits.length ? hits : searchMime(q);
    }
    return searchMime(q);
  }, [query, kind]);
  const highlight = kind === "extension" ? normalizeExtension(query) : undefined;

  const table = useMemo(() => {
    const groups = new Map<MimeCategory, MimeEntry[]>();
    for (const entry of MIME_TABLE) {
      if (category !== "all" && entry.category !== category) continue;
      groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);
    }
    return MIME_CATEGORIES.filter((c) => groups.has(c)).map((c) => ({ category: c, entries: (groups.get(c) ?? []).slice().sort((a, b) => a.type.localeCompare(b.type)) }));
  }, [category]);

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Look up"
          description="Type an extension (png, .woff2), a file name or URL, a media type (application/json; charset=utf-8) or a description."
          actions={
            !query ? (
              <Button size="sm" variant="ghost" onClick={() => setQuery(MIME_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setQuery("")}>
                Clear
              </Button>
            )
          }
        />
        <Input mono value={query} onChange={(e) => setQuery(e.target.value)} placeholder="png · report.xlsx · application/json · spreadsheet" className="h-11 text-base" aria-label="Extension, media type or search" />
        {query.trim() ? (
          <p className="mt-2 text-xs text-fg-subtle">
            Treated as {KIND_LABEL[kind]} · {results.length} match{results.length === 1 ? "" : "es"}
          </p>
        ) : null}
      </Card>

      {query.trim() ? (
        results.length ? (
          <div className="space-y-4">
            {results.slice(0, 12).map((entry) => (
              <ResultCard key={entry.type} entry={entry} highlight={highlight} />
            ))}
            {results.length > 12 ? <p className="text-xs text-fg-subtle">Showing the 12 best matches of {results.length}. Refine the search to narrow it down.</p> : null}
          </div>
        ) : (
          <EmptyState title="No MIME type found" description="Unknown extensions are usually served as application/octet-stream. Try a description like “archive” or “font”." />
        )
      ) : null}

      <Card className="shadow-card">
        <CardHeader title="Browse" description={`${MIME_TABLE.length} types grouped by category.`} />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["all", ...MIME_CATEGORIES] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className="cursor-pointer">
              <Badge tone={category === c ? "accent" : "neutral"}>{c}</Badge>
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {table.map((group) => (
            <div key={group.category}>
              <h3 className="mb-1.5 text-sm font-semibold capitalize text-fg">{group.category}</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[520px] border-collapse text-xs">
                  <thead className="bg-bg-elevated">
                    <tr className="border-b">
                      <th className="px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Type</th>
                      <th className="px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Extensions</th>
                      <th className="px-2.5 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => (
                      <tr key={entry.type} className="border-b last:border-0 hover:bg-surface-hover">
                        <td className="px-2.5 py-1.5 align-top">
                          <button type="button" onClick={() => setQuery(entry.type)} className={cn("cursor-pointer break-all text-left font-mono text-accent-strong hover:underline")}>
                            {entry.type}
                          </button>
                        </td>
                        <td className="px-2.5 py-1.5 align-top font-mono text-fg-muted">{entry.extensions.map((x) => `.${x}`).join(" ") || "—"}</td>
                        <td className="px-2.5 py-1.5 align-top text-fg-muted">{entry.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
