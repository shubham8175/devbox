"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { buildUrl, isValidBase, parseTarget, type QueryParam } from "@/lib/tools/query-string";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

let nextId = 1;
const row = (key = "", value = ""): QueryParam => ({ id: nextId++, key, value });

export function QueryStringTool() {
  const [base, setBase] = useState("https://api.example.com/search");
  const [hash, setHash] = useState("");
  const [params, setParams] = useState<QueryParam[]>(() => [row("q", "dev tools"), row("page", "2")]);
  const [spaces, setSpaces] = useState<"percent" | "plus">("percent");
  const [parseInput, setParseInput] = useState("");

  const url = useMemo(() => buildUrl(base, params, hash, spaces), [base, params, hash, spaces]);
  const baseOk = isValidBase(base);
  const keyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of params) if (p.key) m.set(p.key, (m.get(p.key) ?? 0) + 1);
    return m;
  }, [params]);

  const update = (id: number, patch: Partial<QueryParam>) => setParams((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const move = (index: number, dir: -1 | 1) =>
    setParams((ps) => {
      const next = [...ps];
      const j = index + dir;
      if (j < 0 || j >= next.length) return ps;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const doParse = () => {
    const t = parseTarget(parseInput);
    if (t.base) setBase(t.base);
    setHash(t.hash.replace(/^#/, ""));
    setParams(t.params.length ? t.params.map((p) => row(p.key, p.value)) : [row()]);
    setParseInput("");
  };

  return (
    <div className="space-y-4">
      <InputPanel
        title="Parse an existing URL"
        description="Fills the base URL, parameters and hash below."
        actions={
          <Button size="sm" variant="primary" onClick={doParse} disabled={!parseInput.trim()}>
            Parse
          </Button>
        }
      >
        <Input
          mono
          value={parseInput}
          onChange={(e) => setParseInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doParse();
          }}
          placeholder="https://example.com/path?a=1&b=two%20words#section"
          aria-label="URL to parse"
        />
      </InputPanel>

      <InputPanel
        title="Build"
        actions={
          <>
            <Segmented
              size="sm"
              value={spaces}
              onChange={setSpaces}
              options={[
                { value: "percent", label: "Space → %20" },
                { value: "plus", label: "Space → +" },
              ]}
            />
            <Button size="sm" onClick={() => setParams((ps) => [...ps, row()])}>
              <Plus className="h-3.5 w-3.5" /> Add parameter
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <Label htmlFor="qs-base">Base URL</Label>
            <Input id="qs-base" mono value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://api.example.com/path" invalid={!baseOk} />
          </div>
          <div>
            <Label htmlFor="qs-hash">Hash (fragment)</Label>
            <Input id="qs-hash" mono value={hash} onChange={(e) => setHash(e.target.value)} placeholder="section" />
          </div>
        </div>
        {!baseOk ? (
          <Alert tone="warning" className="mt-3">
            The base doesn&apos;t look like a URL or path. The query string is still generated.
          </Alert>
        ) : null}
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            <span>Key</span>
            <span>Value</span>
            <span className="w-[88px]" />
          </div>
          {params.map((p, i) => (
            <div key={p.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <div className="relative">
                <Input mono value={p.key} onChange={(e) => update(p.id, { key: e.target.value })} placeholder="key" aria-label="Parameter key" />
                {p.key && (keyCounts.get(p.key) ?? 0) > 1 ? <Badge tone="accent" className="absolute right-2 top-1/2 -translate-y-1/2">dup</Badge> : null}
              </div>
              <Input mono value={p.value} onChange={(e) => update(p.id, { value: e.target.value })} placeholder="value" aria-label="Parameter value" />
              <div className="flex gap-0.5">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === params.length - 1} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setParams((ps) => (ps.length > 1 ? ps.filter((x) => x.id !== p.id) : [row()]))} aria-label="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-fg-subtle">Duplicate keys are kept in order (e.g. tag=a&amp;tag=b). Keys and values are percent-encoded with encodeURIComponent.</p>
      </InputPanel>

      <OutputPanel title="Final URL" actions={<CopyButton value={url} label="Copy URL" variant="primary" />}>
        <div className="break-all rounded-lg border bg-bg-elevated p-3 font-mono text-sm">
          <span className="text-fg-muted">{base.trim()}</span>
          {params.some((p) => p.key) ? <span className="text-accent-strong">{url.slice(base.trim().length, url.length - (hash ? hash.length + 1 : 0))}</span> : null}
          {hash ? <span className="text-warning">#{hash}</span> : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <OutputRow label="Query string" value={url.includes("?") ? url.slice(url.indexOf("?") + 1).replace(/#.*$/, "") : ""} placeholder="(none)" />
          <OutputRow label="Parameters" value={String(params.filter((p) => p.key).length)} copyable={false} />
        </div>
      </OutputPanel>
    </div>
  );
}
