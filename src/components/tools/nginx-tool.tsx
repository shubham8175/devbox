"use client";

import { useMemo, useState } from "react";
import { NGINX_EXAMPLE_URIS, NGINX_SAMPLE, describeLocation, parseNginxConfig, simulateRequest, type LocationModifier, type NginxLocation, type NginxTarget } from "@/lib/tools/nginx";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

const MODIFIER_LABEL: Record<LocationModifier, string> = { "=": "exact", "^~": "prefix, no regex", "~": "regex", "~*": "regex, case-insensitive", "": "prefix" };
const MODIFIER_TONE: Record<LocationModifier, "accent" | "warning" | "success" | "neutral"> = { "=": "accent", "^~": "warning", "~": "success", "~*": "success", "": "neutral" };

function targetRows(t: NginxTarget): Array<{ label: string; value: string; hint?: string }> {
  switch (t.kind) {
    case "proxy":
      return [{ label: "Proxied to", value: t.target, hint: t.note }];
    case "file":
      return [{ label: "File path", value: t.path, hint: t.note }];
    case "return":
      return [{ label: "Response", value: `${t.code}${t.url ? ` → ${t.url}` : t.text ? ` ${t.text}` : ""}`, hint: t.url ? "return with a redirect URL" : "return with a status code" }];
    default:
      return [{ label: "Action", value: "no explicit handler", hint: t.note }];
  }
}

function LocationChip({ location, highlight }: { location: NginxLocation; highlight?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2", highlight ? "border-accent bg-accent-soft/40" : "bg-bg-elevated")}>
      <Badge tone={MODIFIER_TONE[location.modifier]}>{MODIFIER_LABEL[location.modifier]}</Badge>
      <span className="break-all font-mono text-sm text-fg">{describeLocation(location)}</span>
      <span className="ml-auto font-mono text-[11px] text-fg-subtle">L{location.line}</span>
    </div>
  );
}

function flattenLocations(locs: NginxLocation[], depth = 0): Array<{ location: NginxLocation; depth: number }> {
  return locs.flatMap((l) => [{ location: l, depth }, ...flattenLocations(l.children, depth + 1)]);
}

export function NginxTool() {
  const [config, setConfig] = useState("");
  const [uri, setUri] = useState("/");

  const parsed = useMemo(() => (config.trim() ? parseNginxConfig(config) : null), [config]);
  const sim = useMemo(() => (parsed?.ok && uri.trim() ? simulateRequest(parsed, uri) : null), [parsed, uri]);
  const all = useMemo(() => (parsed?.ok ? flattenLocations(parsed.locations) : []), [parsed]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="nginx config"
        description="A server block (or bare location blocks). Parsed locally; nothing leaves this page."
        actions={
          !config ? (
            <Button size="sm" variant="ghost" onClick={() => setConfig(NGINX_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfig("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={config} onChange={(e) => setConfig(e.target.value)} placeholder={"server {\n    location = /login { proxy_pass http://auth:9000; }\n    location ^~ /static/ { alias /srv/assets/; }\n    location ~* \\.(png|jpg)$ { root /srv/media; }\n    location / { try_files $uri $uri/ =404; }\n}"} className="min-h-[520px]" invalid={parsed ? !parsed.ok : false} aria-label="nginx configuration" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : null}
        {parsed?.ok && parsed.warnings.length ? (
          <Alert tone="warning" className="mt-2">
            <ul className="list-disc space-y-0.5 pl-4">
              {parsed.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </InputPanel>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Request URI" description="Query strings are ignored and percent-encoding is decoded, as nginx does before matching." />
          <Label htmlFor="nginx-uri">URI</Label>
          <Input id="nginx-uri" mono value={uri} onChange={(e) => setUri(e.target.value)} placeholder="/api/v1/users" aria-label="Request URI" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NGINX_EXAMPLE_URIS.map((u) => (
              <button key={u} type="button" onClick={() => setUri(u)} className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors hover:border-border-strong cursor-pointer", u === uri ? "bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted")}>
                {u}
              </button>
            ))}
          </div>
        </Card>

        {!parsed?.ok ? (
          <EmptyState title="Paste a config to test" description="See which location block wins, why, and where the request ends up." />
        ) : !sim ? (
          <EmptyState title="Enter a URI" />
        ) : (
          <>
            <Card>
              <CardHeader
                title="Matched location"
                description={sim.uri !== uri.trim() ? `Normalised URI: ${sim.uri}` : undefined}
                actions={sim.match.matched ? <Badge tone={MODIFIER_TONE[sim.match.matched.modifier]}>{MODIFIER_LABEL[sim.match.matched.modifier]}</Badge> : <Badge tone="danger">no match</Badge>}
              />
              {sim.match.matched ? <LocationChip location={sim.match.matched} highlight /> : <Alert tone="warning">No location block matches; the server-level configuration handles the request.</Alert>}
              {sim.match.captures.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sim.match.captures.slice(1).map((c, i) => (
                    <Badge key={i}>
                      ${i + 1} = {c}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Trace</div>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs text-fg-muted">
                {[...sim.serverRewrites.map((s) => `Server-level rewrite “${s.regex}” ${s.matched ? `rewrote ${s.from} → ${s.to}` : "did not match"}.`), ...sim.match.steps].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Card>

            {sim.rewrites && sim.rewrites.steps.length ? (
              <Card>
                <CardHeader title="Rewrite chain" description={sim.rewrites.stopped === "loop" ? "Stopped after 10 cycles — nginx would return 500 (rewrite or internal redirection cycle)." : `Final URI: ${sim.finalUri}`} actions={sim.rewrites.location !== sim.match.matched ? <Badge tone="warning">now in {describeLocation(sim.rewrites.location)}</Badge> : null} />
                <ol className="space-y-1.5">
                  {sim.rewrites.steps.map((s, i) => (
                    <li key={i} className={cn("rounded-lg border border-l-2 bg-bg-elevated px-3 py-2 text-xs", s.matched ? "border-l-success" : "border-l-border-strong")}>
                      <div className="font-mono text-fg">
                        rewrite {s.regex} {s.replacement} {s.flag}
                        <span className="ml-2 text-fg-subtle">L{s.line}</span>
                      </div>
                      <div className="mt-0.5 text-fg-muted">
                        {s.matched ? `${s.from} → ${s.to}. ` : ""}
                        {s.note}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            ) : null}

            <Card>
              <CardHeader title="Effective action" />
              <OutputGrid>
                <OutputRow label="Final URI" value={sim.finalUri} />
                {targetRows(sim.target).map((r) => (
                  <OutputRow key={r.label} label={r.label} value={r.value} hint={r.hint} />
                ))}
              </OutputGrid>
            </Card>

            <Card>
              <CardHeader title="All locations" description={`${all.length} in document order. Regex locations are tried in this order.`} />
              <div className="space-y-1.5">
                {all.map(({ location, depth }) => {
                  const cand = sim.match.candidates.find((c) => c.location === location);
                  return (
                    <div key={`${location.line}-${location.order}`} style={{ marginLeft: depth * 16 }}>
                      <LocationChip location={location} highlight={location === sim.rewrites?.location || location === sim.match.matched} />
                      {cand ? <div className="ml-1 mt-0.5 text-[11px] text-fg-subtle">{cand.note}</div> : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
