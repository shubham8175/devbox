"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CODE_TARGETS, HTTP_METHODS, REQUEST_SAMPLE, buildRequest, emptyRequest, generateCode, type AuthType, type BodyType, type CodeTarget, type HttpMethod, type KeyValueRow, type RequestModel } from "@/lib/tools/http-request";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Tab = "params" | "headers" | "auth" | "body";

const METHOD_TONE: Record<string, "success" | "accent" | "warning" | "danger" | "neutral"> = { GET: "success", POST: "accent", PUT: "warning", PATCH: "warning", DELETE: "danger" };

const BODY_HINT: Record<BodyType, string> = {
  none: "",
  json: "JSON object or array.",
  form: "One key=value per line, URL-encoded on send.",
  multipart: "One key=value per line. Use field=@path for files.",
  raw: "Sent verbatim with the Content-Type below.",
  graphql: "The query is wrapped as {\"query\": \"…\"} JSON.",
};

function KeyValueEditor({ rows, onChange, label }: { rows: KeyValueRow[]; onChange: (rows: KeyValueRow[]) => void; label: string }) {
  const update = (i: number, patch: Partial<KeyValueRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent" checked={row.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} aria-label={`${label} row ${i + 1} enabled`} />
          <Input mono value={row.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="key" aria-label={`${label} ${i + 1} key`} className="h-8 text-xs" />
          <Input mono value={row.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="value" aria-label={`${label} ${i + 1} value`} className="h-8 text-xs" />
          <Button size="icon" variant="ghost" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label={`Remove ${label} row ${i + 1}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...rows, { key: "", value: "", enabled: true }])}>
        <Plus className="h-3.5 w-3.5" /> Add row
      </Button>
    </div>
  );
}

export function HttpRequestTool() {
  const [model, setModel] = useState<RequestModel>(emptyRequest);
  const [tab, setTab] = useState<Tab>("params");
  const [target, setTarget] = useState<CodeTarget>("curl");

  const patch = (p: Partial<RequestModel>) => setModel((m) => ({ ...m, ...p }));
  const isEmpty = !model.url && model.body.content === "" && model.headers.every((h) => !h.key) && model.query.every((q) => !q.key);

  const resolved = useMemo(() => (model.url.trim() ? buildRequest(model) : null), [model]);
  const code = useMemo(() => {
    if (!model.url.trim()) return null;
    return generateCode(model, target);
  }, [model, target]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="Request"
        description="Compose the request here. Nothing is ever sent from this page; only code is generated."
        actions={
          isEmpty ? (
            <Button size="sm" variant="ghost" onClick={() => setModel(REQUEST_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setModel(emptyRequest())}>
              Clear
            </Button>
          )
        }
      >
        <div className="flex gap-2">
          <Select value={model.method} onChange={(e) => patch({ method: e.target.value as HttpMethod })} className="w-32 shrink-0" aria-label="Method">
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Input mono value={model.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://api.example.com/v1/users" invalid={resolved ? !resolved.ok : false} aria-label="URL" />
        </div>
        {resolved && !resolved.ok ? (
          <Alert tone="danger" className="mt-3">
            {resolved.error}
          </Alert>
        ) : null}

        <div className="mt-4">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "params", label: `Params${model.query.filter((q) => q.enabled && q.key).length ? ` (${model.query.filter((q) => q.enabled && q.key).length})` : ""}` },
              { value: "headers", label: `Headers${model.headers.filter((h) => h.enabled && h.key).length ? ` (${model.headers.filter((h) => h.enabled && h.key).length})` : ""}` },
              { value: "auth", label: model.auth.type === "none" ? "Auth" : "Auth ·" },
              { value: "body", label: model.body.type === "none" ? "Body" : `Body · ${model.body.type}` },
            ]}
          />
        </div>

        <div className="mt-3">
          {tab === "params" ? <KeyValueEditor label="Query param" rows={model.query} onChange={(query) => patch({ query })} /> : null}
          {tab === "headers" ? <KeyValueEditor label="Header" rows={model.headers} onChange={(headers) => patch({ headers })} /> : null}
          {tab === "auth" ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="req-auth-type">Type</Label>
                <Select id="req-auth-type" value={model.auth.type} onChange={(e) => patch({ auth: { ...model.auth, type: e.target.value as AuthType } })} className="w-48">
                  <option value="none">None</option>
                  <option value="bearer">Bearer token</option>
                  <option value="basic">Basic</option>
                  <option value="api-key">API key</option>
                </Select>
              </div>
              {model.auth.type === "bearer" ? (
                <div>
                  <Label htmlFor="req-token">Token</Label>
                  <Input id="req-token" mono value={model.auth.token ?? ""} onChange={(e) => patch({ auth: { ...model.auth, token: e.target.value } })} placeholder="eyJhbGci…" data-lpignore="true" data-1p-ignore="true" />
                </div>
              ) : null}
              {model.auth.type === "basic" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="req-user">Username</Label>
                    <Input id="req-user" mono value={model.auth.username ?? ""} onChange={(e) => patch({ auth: { ...model.auth, username: e.target.value } })} />
                  </div>
                  <div>
                    <Label htmlFor="req-pass">Password</Label>
                    <Input id="req-pass" mono value={model.auth.password ?? ""} onChange={(e) => patch({ auth: { ...model.auth, password: e.target.value } })} data-lpignore="true" data-1p-ignore="true" />
                  </div>
                </div>
              ) : null}
              {model.auth.type === "api-key" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="req-key-name">Name</Label>
                    <Input id="req-key-name" mono value={model.auth.headerName ?? ""} onChange={(e) => patch({ auth: { ...model.auth, headerName: e.target.value } })} placeholder="X-API-Key" />
                  </div>
                  <div>
                    <Label htmlFor="req-key-value">Key</Label>
                    <Input id="req-key-value" mono value={model.auth.token ?? ""} onChange={(e) => patch({ auth: { ...model.auth, token: e.target.value } })} data-lpignore="true" data-1p-ignore="true" />
                  </div>
                  <div>
                    <Label>Send in</Label>
                    <Segmented
                      size="sm"
                      value={model.auth.in ?? "header"}
                      onChange={(v) => patch({ auth: { ...model.auth, in: v } })}
                      options={[
                        { value: "header", label: "Header" },
                        { value: "query", label: "Query" },
                      ]}
                    />
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-fg-subtle">Credentials stay in this page: they are only inlined into the generated code.</p>
            </div>
          ) : null}
          {tab === "body" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="req-body-type">Body type</Label>
                  <Select id="req-body-type" value={model.body.type} onChange={(e) => patch({ body: { ...model.body, type: e.target.value as BodyType } })} className="w-44">
                    <option value="none">None</option>
                    <option value="json">JSON</option>
                    <option value="form">Form (urlencoded)</option>
                    <option value="multipart">Multipart</option>
                    <option value="raw">Raw</option>
                    <option value="graphql">GraphQL</option>
                  </Select>
                </div>
                {model.body.type === "raw" ? (
                  <div className="min-w-48 flex-1">
                    <Label htmlFor="req-body-ct">Content-Type</Label>
                    <Input id="req-body-ct" mono value={model.body.contentType ?? ""} onChange={(e) => patch({ body: { ...model.body, contentType: e.target.value } })} placeholder="text/plain" />
                  </div>
                ) : null}
              </div>
              {model.body.type !== "none" ? (
                <>
                  <CodeTextarea value={model.body.content} onChange={(e) => patch({ body: { ...model.body, content: e.target.value } })} className="min-h-[160px]" aria-label="Request body" placeholder={model.body.type === "json" ? '{ "name": "Ada" }' : model.body.type === "graphql" ? "{ me { id } }" : "key=value"} />
                  <p className="text-xs text-fg-subtle">{BODY_HINT[model.body.type]}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </InputPanel>

      <div className="space-y-4">
        <OutputPanel
          title="Generated code"
          actions={
            <>
              <Segmented size="sm" value={target} onChange={setTarget} options={CODE_TARGETS.map((t) => ({ value: t.id, label: t.label }))} />
              <CopyButton value={code?.ok ? code.code : ""} label="Copy code" variant="primary" />
            </>
          }
        >
          {code?.ok ? (
            <pre className="max-h-[480px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed">{code.code}</pre>
          ) : (
            <EmptyState title="Enter a URL to generate code" description="Pick a method, add params, headers, auth and a body; code updates live." />
          )}
        </OutputPanel>

        {resolved?.ok ? (
          <Card className="shadow-card">
            <CardHeader title="Resolved request" description="Exactly what the client would send." actions={<Badge tone={METHOD_TONE[resolved.method] ?? "neutral"}>{resolved.method}</Badge>} />
            <OutputGrid>
              <OutputRow label="Final URL" value={resolved.url} className="sm:col-span-2" />
              <OutputRow label="Body" value={resolved.bodyType === "none" ? "" : `${resolved.bodyType} · ${resolved.bodyBytes.toLocaleString()} bytes`} mono={false} copyable={false} placeholder="none" />
              <OutputRow label="Headers" value={String(resolved.headers.length)} mono={false} copyable={false} />
            </OutputGrid>
            {resolved.headers.length ? (
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {resolved.headers.map((h) => (
                  <OutputRow key={h.name} label={h.name} value={h.value} />
                ))}
              </div>
            ) : null}
            {resolved.warnings.length ? (
              <Alert tone="warning" className="mt-3">
                <ul className="list-disc space-y-0.5 pl-4">
                  {resolved.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
