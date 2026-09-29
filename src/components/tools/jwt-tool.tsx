"use client";

import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { ShieldAlert } from "lucide-react";
import { decodeJwt } from "@/lib/tools/jwt";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputRow } from "@/components/output-row";

/**
 * Demo token: HS256 header, a small set of standard and custom claims, expiry in 2100.
 * The signature is a placeholder; this tool never verifies signatures.
 */
const JWT_SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJ1c2VyXzQyIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc0MDAwMDAwMCwiZXhwIjo0MTAyNDQ0ODAwfQ." +
  "sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
import { CopyButton } from "@/components/copy-button";

const STATUS_TONE = {
  active: "success",
  expired: "danger",
  "not-yet-valid": "warning",
  "no-expiry": "neutral",
} as const;

const STATUS_LABEL = {
  active: "Active",
  expired: "Expired",
  "not-yet-valid": "Not yet valid",
  "no-expiry": "No expiry",
} as const;

export function JwtTool() {
  const [token, setToken] = useState("");
  // Ticks every second so "time remaining" stays accurate. Null during SSR.
  const now = useNow(1000);

  const decoded = useMemo(() => (token.trim() ? decodeJwt(token, now ?? undefined) : null), [token, now]);

  return (
    <div className="space-y-4">
      <Alert tone="warning">
        <strong>Decoding a JWT does not verify its signature.</strong> Anyone can read a token&apos;s contents; only the issuer&apos;s key can prove it is genuine. The token you paste never leaves this page and is not stored.
      </Alert>

      <Card>
        <CardHeader
          title="Token"
          description="Paste a JWT. A leading “Bearer ” prefix is ignored."
          actions={
            !token ? (
              <Button size="sm" variant="ghost" onClick={() => setToken(JWT_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setToken("")}>
                Clear
              </Button>
            )
          }
        />
        <Textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
          className="min-h-[110px] break-all"
          invalid={decoded ? !decoded.ok : false}
          aria-label="JWT"
          data-lpignore="true"
          data-1p-ignore="true"
        />
        {decoded && !decoded.ok ? (
          <Alert tone="danger" className="mt-3">
            {decoded.error}
          </Alert>
        ) : null}
      </Card>

      {decoded?.ok ? (
        <>
          <Card>
            <CardHeader
              title="Status"
              actions={<Badge tone={STATUS_TONE[decoded.status.state]}>{STATUS_LABEL[decoded.status.state]}</Badge>}
            />
            <p className="text-sm text-fg-muted">{decoded.status.message}</p>
            {decoded.timeClaims.length ? (
              <div className="mt-4 space-y-3">
                {decoded.timeClaims.map((c) => (
                  <div key={c.claim} className="rounded-lg border bg-bg-elevated p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{c.claim}</span>
                      <span className="text-xs text-fg-muted">{c.label}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <OutputRow label="Unix" value={String(c.unix)} className="bg-surface" />
                      <OutputRow label="ISO 8601" value={c.iso} className="bg-surface" />
                      <OutputRow label="Local" value={c.local} mono={false} className="bg-surface" />
                      <OutputRow label="UTC" value={c.utc} mono={false} className="bg-surface" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-fg-subtle">No iat, nbf or exp claims found.</p>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Header"
                description={typeof decoded.header.alg === "string" ? `Algorithm: ${decoded.header.alg}` : undefined}
                actions={<CopyButton value={decoded.headerRaw} />}
              />
              <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed text-fg">
                {decoded.headerRaw}
              </pre>
            </Card>
            <Card>
              <CardHeader
                title="Payload"
                description={`${Object.keys(decoded.payload).length} claims`}
                actions={<CopyButton value={decoded.payloadRaw} />}
              />
              <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed text-fg">
                {decoded.payloadRaw}
              </pre>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Signature"
              description="Base64URL-encoded. Not verified here."
              actions={<CopyButton value={decoded.signature} />}
            />
            <div className="flex items-start gap-2 rounded-lg border bg-bg-elevated p-3 font-mono text-xs">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="break-all">{decoded.signature || "(empty)"}</span>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
