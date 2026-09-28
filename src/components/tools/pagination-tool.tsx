"use client";

import { useMemo, useState } from "react";
import { paginate, validatePagination } from "@/lib/tools/pagination";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function PaginationTool() {
  const [page, setPage] = useState("3");
  const [pageSize, setPageSize] = useState("25");
  const [total, setTotal] = useState("1042");
  const [zeroBased, setZeroBased] = useState<"1" | "0">("1");

  const { error, r } = useMemo(() => {
    const input = { page: Number(page), pageSize: Number(pageSize), total: Number(total), zeroBased: zeroBased === "0" };
    const err = validatePagination(input);
    return { error: err, r: err ? null : paginate(input) };
  }, [page, pageSize, total, zeroBased]);

  const sql = r ? `SELECT * FROM items ORDER BY id LIMIT ${r.limit} OFFSET ${r.offset};` : "";
  const rest = r ? `GET /items?page=${zeroBased === "0" ? r.pageNormalized - 1 : r.pageNormalized}&pageSize=${r.limit}\nGET /items?offset=${r.offset}&limit=${r.limit}` : "";

  return (
    <div className="space-y-4">
      <InputPanel
        title="Inputs"
        actions={
          <Segmented
            size="sm"
            value={zeroBased}
            onChange={setZeroBased}
            options={[
              { value: "1", label: "Pages start at 1" },
              { value: "0", label: "Pages start at 0" },
            ]}
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="pg-page">Page</Label>
            <Input id="pg-page" mono type="number" value={page} onChange={(e) => setPage(e.target.value)} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="pg-size">Page size</Label>
            <Input id="pg-size" mono type="number" min={1} value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="pg-total">Total items</Label>
            <Input id="pg-total" mono type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className="h-11 text-base" />
          </div>
        </div>
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
      </InputPanel>

      {r ? (
        <>
          <OutputPanel
            title="Result"
            actions={
              <>
                {r.outOfRange ? <Badge tone="danger">Page out of range</Badge> : <Badge tone="success">{r.itemsOnPage} items on this page</Badge>}
                <Badge tone={r.hasPrev ? "accent" : "neutral"}>{r.hasPrev ? "has previous" : "first page"}</Badge>
                <Badge tone={r.hasNext ? "accent" : "neutral"}>{r.hasNext ? "has next" : "last page"}</Badge>
              </>
            }
          >
            <OutputGrid className="sm:grid-cols-3">
              <OutputRow label="Offset" value={String(r.offset)} hint="(page − 1) × pageSize" />
              <OutputRow label="Limit" value={String(r.limit)} />
              <OutputRow label="Total pages" value={String(r.totalPages)} hint="ceil(total ÷ pageSize)" />
              <OutputRow label="First item index" value={r.firstIndex !== null ? String(r.firstIndex) : "—"} hint="1-based" copyable={r.firstIndex !== null} />
              <OutputRow label="Last item index" value={r.lastIndex !== null ? String(r.lastIndex) : "—"} hint="1-based" copyable={r.lastIndex !== null} />
              <OutputRow label="Range (0-based)" value={r.firstIndex !== null && r.lastIndex !== null ? `[${r.firstIndex - 1}, ${r.lastIndex - 1}]` : "—"} copyable={r.firstIndex !== null} />
            </OutputGrid>
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Page window</div>
              <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
                <span className={cn("rounded-md border px-2 py-1", r.hasPrev ? "text-fg-muted" : "text-fg-subtle opacity-50")}>‹ prev</span>
                {r.window[0] > 1 ? <span className="px-1 text-fg-subtle">…</span> : null}
                {r.window.map((p) => (
                  <span key={p} className={cn("rounded-md border px-2 py-1", p === r.pageNormalized ? "border-accent/40 bg-accent-soft text-accent-strong" : "text-fg-muted")}>
                    {zeroBased === "0" ? p - 1 : p}
                  </span>
                ))}
                {r.window[r.window.length - 1] < r.totalPages ? <span className="px-1 text-fg-subtle">…</span> : null}
                <span className={cn("rounded-md border px-2 py-1", r.hasNext ? "text-fg-muted" : "text-fg-subtle opacity-50")}>next ›</span>
              </div>
            </div>
          </OutputPanel>

          <div className="grid gap-4 md:grid-cols-2">
            <OutputPanel title="SQL" actions={<CopyButton value={sql} />}>
              <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs">{sql}</pre>
            </OutputPanel>
            <OutputPanel title="REST" actions={<CopyButton value={rest} />}>
              <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs">{rest}</pre>
            </OutputPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
