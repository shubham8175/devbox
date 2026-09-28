"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HEADERS_SAMPLE, headersToJson, jsonToHeaders, parseRawHeaders } from "@/lib/tools/http-headers";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { Highlight } from "@/components/highlight";

type Mode = "parse" | "from-json";

export function HttpHeadersTool() {
  const [mode, setMode] = useState<Mode>("parse");
  const [raw, setRaw] = useState("");
  const [json, setJson] = useState("");
  const [search, setSearch] = useState("");
  const [preserveCase, setPreserveCase] = useState(false);

  const parsed = useMemo(() => (raw.trim() ? parseRawHeaders(raw) : null), [raw]);
  const jsonOut = useMemo(() => (parsed ? JSON.stringify(headersToJson(parsed.headers, preserveCase), null, 2) : ""), [parsed, preserveCase]);
  const fromJson = useMemo(() => (json.trim() ? jsonToHeaders(json) : null), [json]);

  const q = search.trim().toLowerCase();
  const visible = parsed?.headers.filter((h) => !q || h.name.toLowerCase().includes(q) || h.value.toLowerCase().includes(q)) ?? [];
  const duplicateNames = parsed ? Array.from(new Set(parsed.headers.filter((h) => h.count > 1).map((h) => h.name.toLowerCase()))) : [];

  return (
    <div className="space-y-4">
      <InputPanel
        title={mode === "parse" ? "Raw HTTP headers" : "JSON headers"}
        description={mode === "parse" ? "Paste headers from DevTools, curl -v or a HAR. A status/request line is optional." : "Object of header names to string or array values."}
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "parse", label: "Headers → JSON" },
                { value: "from-json", label: "JSON → Headers" },
              ]}
            />
            {mode === "parse" ? (
              !raw ? (
                <Button size="sm" variant="ghost" onClick={() => setRaw(HEADERS_SAMPLE)}>
                  Load sample
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setRaw("")}>
                  Clear
                </Button>
              )
            ) : !json ? (
              <Button size="sm" variant="ghost" onClick={() => setJson(jsonOut || '{\n  "content-type": "application/json",\n  "set-cookie": ["a=1; Path=/", "b=2; Path=/"]\n}')}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setJson("")}>
                Clear
              </Button>
            )}
          </>
        }
      >
        {mode === "parse" ? (
          <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-cache"} className="min-h-[180px]" aria-label="Raw headers" />
        ) : (
          <>
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"content-type": "application/json"}' className="min-h-[180px]" invalid={fromJson ? !fromJson.ok : false} aria-label="JSON headers" />
            {fromJson && !fromJson.ok ? (
              <Alert tone="danger" className="mt-3">
                {fromJson.error}
              </Alert>
            ) : null}
          </>
        )}
      </InputPanel>

      {mode === "from-json" && fromJson?.ok ? (
        <OutputPanel title="Raw headers" actions={<CopyButton value={fromJson.text} label="Copy headers" variant="primary" />}>
          <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{fromJson.text}</pre>
        </OutputPanel>
      ) : null}

      {mode === "parse" && parsed ? (
        <>
          <OutputPanel
            title="Headers"
            description={`${parsed.headers.length} header${parsed.headers.length === 1 ? "" : "s"}${parsed.startLine ? ` · ${parsed.startLine}` : ""}`}
            actions={
              <>
                {duplicateNames.length ? <Badge tone="warning">{duplicateNames.length} duplicated name{duplicateNames.length === 1 ? "" : "s"}</Badge> : null}
                <CopyButton value={parsed.headers.map((h) => `${h.name}: ${h.value}`).join("\n")} label="Copy all" />
              </>
            }
          >
            {parsed.errors.length ? (
              <Alert tone="warning" className="mb-3">
                <ul className="list-disc space-y-0.5 pl-4">
                  {parsed.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or value (case-insensitive)" className="pl-9" aria-label="Filter headers" />
            </div>
            {visible.length === 0 ? (
              <EmptyState title="No headers match" className="py-6" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[38%] sm:w-[30%]" />
                    <col />
                    <col className="w-11" />
                  </colgroup>
                  <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                      <th className="px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visible.map((h, i) => (
                      <tr key={`${h.name}-${i}`} className="bg-bg-elevated align-top">
                        <td className="break-words px-3 py-2 font-mono text-xs text-accent-strong">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Highlight text={h.name} query={search} />
                            {h.count > 1 ? <Badge tone="warning">×{h.count}</Badge> : null}
                          </div>
                          {h.description ? <div className="mt-0.5 font-sans text-[11px] text-fg-subtle">{h.description}</div> : null}
                        </td>
                        <td className="break-all px-3 py-2 font-mono text-xs">
                          <Highlight text={h.value} query={search} />
                        </td>
                        <td className="px-1 py-1 text-right">
                          <CopyButton value={h.value} iconOnly />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OutputPanel>

          <OutputPanel
            title="As JSON"
            description="Repeated headers become arrays."
            actions={
              <>
                <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                  <input type="checkbox" checked={preserveCase} onChange={(e) => setPreserveCase(e.target.checked)} className="accent-accent" /> Preserve case
                </label>
                <CopyButton value={jsonOut} label="Copy JSON" variant="primary" />
              </>
            }
          >
            <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{jsonOut}</pre>
          </OutputPanel>
        </>
      ) : mode === "parse" ? (
        <EmptyState title="Paste some headers" description="You'll get a searchable table, duplicate detection and a JSON version." />
      ) : null}
    </div>
  );
}
