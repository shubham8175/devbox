"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { buildDeepLink, DEEP_LINK_EXAMPLES, parseDeepLink, validateScheme, type DeepLinkFields } from "@/lib/tools/deep-link";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const INITIAL: DeepLinkFields = { scheme: "myapp", host: "device", path: "/123", params: [{ key: "source", value: "qr" }], fragment: "" };

export function DeepLinkTool() {
  const [fields, setFields] = useState<DeepLinkFields>(INITIAL);
  const [parseInput, setParseInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const schemeError = useMemo(() => validateScheme(fields.scheme), [fields.scheme]);
  const link = useMemo(() => (schemeError ? "" : buildDeepLink(fields)), [fields, schemeError]);
  const isHttps = /^https:\/\//i.test(link);

  const set = <K extends keyof DeepLinkFields>(k: K, v: DeepLinkFields[K]) => setFields((f) => ({ ...f, [k]: v }));
  const setParam = (i: number, p: Partial<{ key: string; value: string }>) => set("params", fields.params.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const parse = (text: string) => {
    setParseInput(text);
    if (!text.trim()) {
      setParseError(null);
      return;
    }
    const r = parseDeepLink(text);
    if (r.ok) {
      setFields(r.value);
      setParseError(null);
    } else setParseError(r.error);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader title="Build" description="Segments and parameters are percent-encoded automatically." />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="dl-scheme">Scheme</Label>
              <Input id="dl-scheme" mono value={fields.scheme} onChange={(e) => set("scheme", e.target.value)} placeholder="myapp" invalid={!!schemeError} />
            </div>
            <div>
              <Label htmlFor="dl-host">Host</Label>
              <Input id="dl-host" mono value={fields.host} onChange={(e) => set("host", e.target.value)} placeholder="device" />
            </div>
            <div>
              <Label htmlFor="dl-path">Path</Label>
              <Input id="dl-path" mono value={fields.path} onChange={(e) => set("path", e.target.value)} placeholder="/123" />
            </div>
          </div>
          {schemeError ? (
            <Alert tone="danger" className="mt-3">
              {schemeError}
            </Alert>
          ) : null}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">Query parameters</span>
              <Button size="sm" variant="ghost" onClick={() => set("params", [...fields.params, { key: "", value: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {fields.params.length === 0 ? <p className="text-xs text-fg-subtle">No parameters.</p> : null}
              {fields.params.map((p, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                  <Input mono value={p.key} onChange={(e) => setParam(i, { key: e.target.value })} placeholder="key" aria-label={`Parameter ${i + 1} key`} />
                  <span className="hidden text-fg-subtle sm:inline">=</span>
                  <Input mono value={p.value} onChange={(e) => setParam(i, { value: e.target.value })} placeholder="value" aria-label={`Parameter ${i + 1} value`} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                  <Button size="icon" variant="ghost" className="order-2 sm:order-none" onClick={() => set("params", fields.params.filter((_, j) => j !== i))} aria-label="Remove parameter">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="dl-frag">Fragment</Label>
            <Input id="dl-frag" mono value={fields.fragment} onChange={(e) => set("fragment", e.target.value)} placeholder="optional" />
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Parse an existing link" description="Fills the builder above." />
          <Textarea value={parseInput} onChange={(e) => parse(e.target.value)} placeholder="myapp://device/123?source=qr" className="min-h-[72px]" invalid={!!parseError} />
          {parseError ? (
            <Alert tone="danger" className="mt-2">
              {parseError}
            </Alert>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEEP_LINK_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => parse(ex)} className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
                {ex}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Result" actions={link ? <Badge tone={isHttps ? "success" : "accent"}>{isHttps ? "Universal link" : "Custom scheme"}</Badge> : null} />
        <div className="rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 font-mono text-sm break-all">{link || <span className="text-fg-subtle">Fix the scheme to build a link.</span>}</div>
        <div className="mt-3 flex items-center gap-2">
          <CopyButton value={link} label="Copy link" variant="primary" />
          {isHttps ? (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-8 items-center gap-1 rounded-lg border bg-surface px-2.5 text-xs font-medium text-fg transition-colors hover:border-border-strong">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <div className="mt-4 space-y-2">
          <OutputRow label="Scheme" value={fields.scheme} />
          <OutputRow label="Host" value={fields.host} placeholder="(none)" />
          <OutputRow label="Path" value={fields.path} placeholder="(none)" />
          <OutputRow label="Parameters" value={fields.params.filter((p) => p.key).map((p) => `${p.key}=${p.value}`).join("\n")} placeholder="(none)" />
        </div>
        <p className="mt-3 text-[11px] text-fg-subtle">Custom-scheme links are never opened automatically. Only https links get an Open button.</p>
      </Card>
    </div>
  );
}
