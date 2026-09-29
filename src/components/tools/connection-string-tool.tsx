"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import {
  CONNECTION_KINDS,
  CONNECTION_SAMPLE,
  DEFAULT_PORTS,
  buildConnectionString,
  parseConnectionString,
  toEnvLine,
  type ConnectionKind,
} from "@/lib/tools/connection-string";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Mode = "parse" | "build";
type BuildKind = Exclude<ConnectionKind, "other">;

interface HostRow {
  id: number;
  host: string;
  port: string;
}
interface ParamRow {
  id: number;
  key: string;
  value: string;
}

let nextId = 1;
const row = <T extends object>(fields: T): T & { id: number } => ({ id: nextId++, ...fields });

function maskUri(uri: string, password: string): string {
  if (!password) return uri;
  // The built URI percent-encodes the password, so mask the encoded form.
  return uri.split(encodeURIComponent(password).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("****");
}

export function ConnectionStringTool() {
  const [mode, setMode] = useState<Mode>("parse");
  const [input, setInput] = useState("");
  const [reveal, setReveal] = useState(false);

  const [kind, setKind] = useState<BuildKind>("postgres");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hosts, setHosts] = useState<HostRow[]>([row({ host: "localhost", port: "" })]);
  const [database, setDatabase] = useState("");
  const [params, setParams] = useState<ParamRow[]>([]);
  const [revealBuilt, setRevealBuilt] = useState(false);

  const parsed = useMemo(() => (input.trim() ? parseConnectionString(input) : null), [input]);

  const built = useMemo(() => {
    const cleanHosts = hosts.filter((h) => h.host.trim()).map((h) => ({ host: h.host.trim(), port: h.port.trim() ? Number(h.port) : null }));
    if (!cleanHosts.length) return null;
    const p: Record<string, string> = Object.create(null);
    for (const r of params) if (r.key.trim()) p[r.key.trim()] = r.value;
    return buildConnectionString({ kind, username, password, hosts: cleanHosts, database, params: p });
  }, [kind, username, password, hosts, database, params]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "parse", label: "Parse" },
            { value: "build", label: "Build" },
          ]}
        />
        <p className="text-xs text-fg-subtle">Parsed and built in your browser. Nothing is stored or sent anywhere.</p>
      </div>

      {mode === "parse" ? (
        <>
          <Card>
            <CardHeader
              title="Connection string"
              description="postgres://, mysql://, mongodb+srv://, redis://, amqp://, a jdbc: prefix or key=value DSN form. A leading DATABASE_URL= is ignored."
              actions={
                !input ? (
                  <Button size="sm" variant="ghost" onClick={() => setInput(CONNECTION_SAMPLE)}>
                    Load sample
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                    Clear
                  </Button>
                )
              }
            />
            <Input
              mono
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="postgresql://user:password@host:5432/dbname?sslmode=require"
              invalid={parsed ? !parsed.ok : false}
              aria-label="Connection string"
              data-lpignore="true"
              data-1p-ignore="true"
            />
            {parsed && !parsed.ok ? (
              <Alert tone="danger" className="mt-3">
                {parsed.error}
              </Alert>
            ) : null}
            {parsed?.ok && parsed.notes.length ? (
              <Alert tone="info" className="mt-3">
                {parsed.notes.join(" ")}
              </Alert>
            ) : null}
          </Card>

          {parsed?.ok ? (
            <>
              {parsed.warnings.length ? (
                <Alert tone="warning">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {parsed.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
              <Card>
                <CardHeader
                  title="Parts"
                  actions={
                    <>
                      <Badge tone="accent">{parsed.kind}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
                        {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {reveal ? "Hide password" : "Reveal password"}
                      </Button>
                    </>
                  }
                />
                <OutputGrid>
                  <OutputRow label="Scheme" value={parsed.scheme} />
                  <OutputRow label="Username" value={parsed.username} placeholder="(none)" />
                  <OutputRow label="Password" value={reveal ? parsed.password : parsed.passwordMasked} copyable={reveal} placeholder="(none)" hint={parsed.password && !reveal ? "Hidden. Reveal to copy." : undefined} />
                  <OutputRow label="Database" value={parsed.database} placeholder="(none)" />
                  {parsed.hosts.map((h, i) => (
                    <OutputRow key={`${h.host}:${h.port}:${i}`} label={parsed.hosts.length > 1 ? `Host ${i + 1}` : "Host"} value={h.port === null ? h.host : `${h.host}:${h.port}`} hint={h.defaultPort ? "Default port" : undefined} />
                  ))}
                </OutputGrid>
                {Object.keys(parsed.params).length ? (
                  <div className="mt-4">
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Parameters</div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(parsed.params).map(([k, v]) => (
                            <tr key={k} className="border-b last:border-b-0">
                              <td className="px-3 py-1.5 font-mono text-fg">{k}</td>
                              <td className="px-3 py-1.5 font-mono text-fg-muted">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </Card>
              <Card>
                <CardHeader title="Safe to share" description="Password replaced by ****." />
                <div className="space-y-2">
                  <OutputRow label="Masked URI" value={parsed.masked} />
                  <OutputRow label=".env line" value={toEnvLine("DATABASE_URL", parsed.masked)} />
                </div>
              </Card>
            </>
          ) : !input.trim() ? (
            <EmptyState title="Paste a connection string" description="Every part is shown separately, the password is hidden by default, and common mistakes such as missing TLS are flagged." />
          ) : null}
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Parts" description="Reserved characters in the password are percent-encoded for you." />
            <div className="space-y-3">
              <div>
                <Label htmlFor="cs-kind">Database</Label>
                <Select id="cs-kind" value={kind} onChange={(e) => setKind(e.target.value as BuildKind)}>
                  {CONNECTION_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cs-user">Username</Label>
                  <Input id="cs-user" mono value={username} onChange={(e) => setUsername(e.target.value)} placeholder="app_user" data-lpignore="true" data-1p-ignore="true" />
                </div>
                <div>
                  <Label htmlFor="cs-pass">Password</Label>
                  <Input id="cs-pass" mono type={revealBuilt ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="p@ss:word/1" data-lpignore="true" data-1p-ignore="true" />
                </div>
              </div>
              <div>
                <Label hint={`Default port ${DEFAULT_PORTS[kind] ?? "n/a"}`}>Hosts</Label>
                <div className="space-y-2">
                  {hosts.map((h) => (
                    <div key={h.id} className="flex gap-2">
                      <Input mono value={h.host} onChange={(e) => setHosts((cur) => cur.map((x) => (x.id === h.id ? { ...x, host: e.target.value } : x)))} placeholder="db.example.com" aria-label="Host" />
                      <Input mono value={h.port} onChange={(e) => setHosts((cur) => cur.map((x) => (x.id === h.id ? { ...x, port: e.target.value.replace(/\D/g, "") } : x)))} placeholder="port" className="w-24" aria-label="Port" inputMode="numeric" />
                      <Button size="icon" variant="ghost" onClick={() => setHosts((cur) => (cur.length > 1 ? cur.filter((x) => x.id !== h.id) : cur))} disabled={hosts.length === 1} aria-label="Remove host">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setHosts((cur) => [...cur, row({ host: "", port: "" })])}>
                    <Plus className="h-3.5 w-3.5" /> Add host
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="cs-db">Database name</Label>
                <Input id="cs-db" mono value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="app" />
              </div>
              <div>
                <Label>Parameters</Label>
                <div className="space-y-2">
                  {params.map((p) => (
                    <div key={p.id} className="flex gap-2">
                      <Input mono value={p.key} onChange={(e) => setParams((cur) => cur.map((x) => (x.id === p.id ? { ...x, key: e.target.value } : x)))} placeholder="sslmode" aria-label="Parameter name" />
                      <Input mono value={p.value} onChange={(e) => setParams((cur) => cur.map((x) => (x.id === p.id ? { ...x, value: e.target.value } : x)))} placeholder="require" aria-label="Parameter value" />
                      <Button size="icon" variant="ghost" onClick={() => setParams((cur) => cur.filter((x) => x.id !== p.id))} aria-label="Remove parameter">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setParams((cur) => [...cur, row({ key: "", value: "" })])}>
                    <Plus className="h-3.5 w-3.5" /> Add parameter
                  </Button>
                </div>
              </div>
            </div>
          </Card>
          <Card className="lg:sticky lg:top-6 lg:self-start">
            <CardHeader
              title="Connection string"
              actions={
                <>
                  <Button size="sm" variant="ghost" onClick={() => setRevealBuilt((r) => !r)} aria-pressed={revealBuilt}>
                    {revealBuilt ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {revealBuilt ? "Hide password" : "Reveal password"}
                  </Button>
                  <CopyButton value={built ?? ""} variant="primary" />
                </>
              }
            />
            {built ? (
              <div className="space-y-2">
                <OutputRow label="URI" value={revealBuilt ? built : maskUri(built, password)} copyable={revealBuilt} hint={password && !revealBuilt ? "Masked. Use the Copy button above for the real value." : undefined} />
                <OutputRow label=".env line" value={toEnvLine("DATABASE_URL", revealBuilt ? built : maskUri(built, password))} copyable={revealBuilt} />
              </div>
            ) : (
              <EmptyState title="Add at least one host" className="py-8" />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
