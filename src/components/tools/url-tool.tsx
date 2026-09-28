"use client";

import { useMemo, useState } from "react";
import { decodeComponent, encodeComponent, parseUrl } from "@/lib/tools/url";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/ui/empty-state";

type Mode = "encode" | "decode";

export function UrlTool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  const codec = useMemo(() => {
    if (!text) return { ok: true, output: "" };
    return mode === "encode" ? encodeComponent(text) : decodeComponent(text);
  }, [mode, text]);

  const parsed = useMemo(() => (url.trim() ? parseUrl(url) : null), [url]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Encode / decode component"
          description="encodeURIComponent and decodeURIComponent, for query values and path segments."
          actions={
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "encode", label: "Encode" },
                { value: "decode", label: "Decode" },
              ]}
            />
          }
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="url-in">{mode === "encode" ? "Plain text" : "Encoded"}</Label>
            <Textarea
              id="url-in"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "encode" ? "name=John Doe&city=São Paulo" : "name%3DJohn%20Doe%26city%3DS%C3%A3o%20Paulo"}
              className="min-h-[140px]"
              invalid={!codec.ok}
            />
          </div>
          <div>
            <Label htmlFor="url-out">{mode === "encode" ? "Encoded" : "Plain text"}</Label>
            <Textarea id="url-out" readOnly value={codec.output} className="min-h-[140px] bg-surface" placeholder="Output" />
          </div>
        </div>
        {!codec.ok && codec.error ? (
          <Alert tone="danger" className="mt-3">
            {codec.error}
          </Alert>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setText("")} disabled={!text}>
            Clear
          </Button>
          <div className="ml-auto">
            <CopyButton value={codec.ok ? codec.output : ""} label="Copy result" variant="primary" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Parse URL"
          description="Break a URL into its parts and list query parameters."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setUrl("")} disabled={!url}>
              Clear
            </Button>
          }
        />
        <Label htmlFor="url-parse">URL</Label>
        <Input
          id="url-parse"
          mono
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com:8443/v1/users?page=2&sort=name#top"
          invalid={parsed ? !parsed.ok : false}
        />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-3">
            {parsed.error}
          </Alert>
        ) : null}
        {parsed?.ok ? (
          <div className="mt-4 space-y-4">
            <OutputGrid>
              <OutputRow label="Protocol" value={parsed.protocol} />
              <OutputRow label="Origin" value={parsed.origin} />
              <OutputRow label="Hostname" value={parsed.hostname} />
              <OutputRow label="Port" value={parsed.port} placeholder="(default)" />
              <OutputRow label="Pathname" value={parsed.pathname} />
              <OutputRow label="Hash" value={parsed.hash} placeholder="(none)" />
              {parsed.username ? <OutputRow label="Username" value={parsed.username} /> : null}
              <OutputRow label="Search" value={parsed.search} placeholder="(none)" className="sm:col-span-2" />
            </OutputGrid>
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Query parameters ({parsed.params.length})
              </div>
              {parsed.params.length === 0 ? (
                <EmptyState title="No query parameters" className="py-6" />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                      <tr>
                        <th className="px-3 py-2 font-medium">Key</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsed.params.map((p, i) => (
                        <tr key={`${p.key}-${i}`} className="bg-bg-elevated">
                          <td className="px-3 py-2 font-mono text-xs text-accent-strong">{p.key}</td>
                          <td className="break-all px-3 py-2 font-mono text-xs">{p.value || <span className="text-fg-subtle">(empty)</span>}</td>
                          <td className="px-2 py-1 text-right">
                            <CopyButton value={p.value} iconOnly />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
