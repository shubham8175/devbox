"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { buildCookieHeader, COOKIE_SAMPLE_REQUEST, COOKIE_SAMPLE_SET, detectCookieMode, parseRequestCookies, parseSetCookies, type CookieMode } from "@/lib/tools/cookies";
import { useNow } from "@/hooks/use-now";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

interface Pair {
  id: number;
  name: string;
  value: string;
}

export function CookiesTool() {
  const [input, setInput] = useState("");
  const [modeOverride, setModeOverride] = useState<CookieMode | "auto">("auto");
  const [pairs, setPairs] = useState<Pair[]>([{ id: 1, name: "session", value: "" }]);
  const [encode, setEncode] = useState(true);
  const now = useNow(60_000);

  const mode: CookieMode = modeOverride === "auto" ? detectCookieMode(input) : modeOverride;
  const request = useMemo(() => (mode === "request" && input.trim() ? parseRequestCookies(input) : []), [mode, input]);
  const setCookies = useMemo(() => (mode === "set-cookie" && input.trim() ? parseSetCookies(input, now ?? undefined) : []), [mode, input, now]);
  const header = buildCookieHeader(pairs, encode);

  return (
    <div className="space-y-4">
      <InputPanel
        title="Parse"
        description={mode === "request" ? "Cookie request header: name=value pairs separated by semicolons." : "One Set-Cookie response header per line."}
        actions={
          <>
            <Segmented
              size="sm"
              value={modeOverride}
              onChange={setModeOverride}
              options={[
                { value: "auto", label: "Auto" },
                { value: "request", label: "Cookie" },
                { value: "set-cookie", label: "Set-Cookie" },
              ]}
            />
            {!input ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setInput(COOKIE_SAMPLE_REQUEST)}>
                  Sample Cookie
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInput(COOKIE_SAMPLE_SET)}>
                  Sample Set-Cookie
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )}
          </>
        }
      >
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"Cookie: session=abc123; theme=dark\n— or —\nSet-Cookie: session=abc; Path=/; HttpOnly; Secure; SameSite=Lax"} className="min-h-[120px]" aria-label="Cookie header input" />
        {input.trim() ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
            <Badge tone="accent">{mode === "request" ? "Cookie header" : "Set-Cookie"}</Badge>
            {modeOverride === "auto" ? <span>detected automatically</span> : null}
          </div>
        ) : null}
      </InputPanel>

      {mode === "request" && input.trim() ? (
        <OutputPanel title="Cookies" description={`${request.length} cookie${request.length === 1 ? "" : "s"}`} actions={<CopyButton value={JSON.stringify(Object.fromEntries(request.map((c) => [c.name, c.decoded])), null, 2)} label="Copy as JSON" />}>
          {request.length === 0 ? (
            <EmptyState title="No cookies found" className="py-6" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {request.map((c, i) => (
                    <tr key={`${c.name}-${i}`} className="bg-bg-elevated">
                      <td className="px-3 py-2 font-mono text-xs text-accent-strong">{c.name}</td>
                      <td className="break-all px-3 py-2 font-mono text-xs">
                        {c.value || <span className="text-fg-subtle">(empty)</span>}
                        {c.decoded !== c.value ? <div className="mt-0.5 text-[11px] text-fg-subtle">decoded: {c.decoded}</div> : null}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <CopyButton value={c.value} iconOnly />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OutputPanel>
      ) : null}

      {mode === "set-cookie" && input.trim()
        ? setCookies.map((c, i) => (
            <OutputPanel
              key={i}
              title={
                <span className="font-mono">
                  {c.name || "(unnamed)"}
                  <span className="text-fg-subtle"> = </span>
                  <span className="break-all font-normal text-fg-muted">{c.value || "(empty)"}</span>
                </span>
              }
              actions={
                <>
                  {c.secure ? <Badge tone="success">Secure</Badge> : null}
                  {c.httpOnly ? <Badge tone="success">HttpOnly</Badge> : null}
                  {c.sameSite ? <Badge tone={c.sameSite === "None" ? "warning" : "accent"}>SameSite={c.sameSite}</Badge> : null}
                  {c.partitioned ? <Badge>Partitioned</Badge> : null}
                  <CopyButton value={c.raw} iconOnly />
                </>
              }
            >
              <OutputGrid>
                <OutputRow label="Value" value={c.value} placeholder="(empty)" />
                <OutputRow label="Domain" value={c.domain ?? ""} placeholder="(host-only)" />
                <OutputRow label="Path" value={c.path ?? ""} placeholder="(default-path)" />
                <OutputRow label="Max-Age" value={c.maxAge !== undefined ? `${c.maxAge} s` : ""} placeholder="(not set)" hint={c.maxAge !== undefined && c.maxAge > 0 ? `≈ ${(c.maxAge / 86400).toFixed(2)} days` : undefined} />
                <OutputRow label="Expires" value={c.expires ? c.expires.local : ""} placeholder="(session cookie)" mono={false} hint={c.expires?.relative} />
                <OutputRow label="Expires (ISO)" value={c.expires?.iso ?? ""} placeholder="—" />
                {c.priority ? <OutputRow label="Priority" value={c.priority} /> : null}
                {c.unknown.map((u, j) => (
                  <OutputRow key={j} label={`Unknown: ${u.name}`} value={u.value ?? "(flag)"} />
                ))}
              </OutputGrid>
              {c.warnings.length ? (
                <Alert tone="warning" className="mt-3">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {c.warnings.map((w, j) => (
                      <li key={j}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </OutputPanel>
          ))
        : null}

      <OutputPanel
        title="Build a Cookie header"
        description="Add name/value pairs to produce a request Cookie header."
        actions={
          <>
            <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
              <input type="checkbox" checked={encode} onChange={(e) => setEncode(e.target.checked)} className="accent-accent" /> URL-encode values
            </label>
            <Button size="sm" onClick={() => setPairs((p) => [...p, { id: Date.now(), name: "", value: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {pairs.map((p) => (
            <div key={p.id} className="flex gap-2">
              <Input mono value={p.name} onChange={(e) => setPairs((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} placeholder="name" className="sm:w-48" aria-label="Cookie name" />
              <Input mono value={p.value} onChange={(e) => setPairs((ps) => ps.map((x) => (x.id === p.id ? { ...x, value: e.target.value } : x)))} placeholder="value" aria-label="Cookie value" />
              <Button size="icon" variant="ghost" onClick={() => setPairs((ps) => ps.filter((x) => x.id !== p.id))} aria-label="Remove pair" disabled={pairs.length === 1}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <OutputRow label="Cookie header" value={header ? `Cookie: ${header}` : ""} placeholder="Cookie: name=value; other=value" />
        </div>
      </OutputPanel>
    </div>
  );
}
