"use client";

import { useMemo, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { Eraser, ShieldAlert } from "lucide-react";
import { decodeJwt } from "@/lib/tools/jwt";
import { compareJwts, JWT_COMPARE_SAMPLE, jwtShortIdentity, MAX_JWT_COMPARE, splitJwtPaste, stripBearer, type JwtCompareRow } from "@/lib/tools/jwt-compare";
import { formatISO, formatLocal, humanDuration } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { useValueList, ValueList } from "@/components/value-list";
import { cn } from "@/lib/utils";

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

      <JwtCompare now={now} />
    </div>
  );
}

/** JWT time claims are whole seconds, so drop the ".000". */
function claimISO(date: Date): string {
  return formatISO(date).replace(".000Z", "Z");
}

/** Compact duration for table cells: "≈ 74.9 years" past a year, else the first two units ("3 days, 4 hours"). */
function shortDuration(ms: number): string {
  const years = ms / (365.25 * 86_400_000);
  if (years >= 1) return `≈ ${years.toFixed(1)} years`;
  return humanDuration(ms).split(", ").slice(0, 2).join(", ");
}

function untilExpiryText(ms: number): string {
  return ms > 0 ? `in ${shortDuration(ms)}` : `${shortDuration(-ms)} ago`;
}

/** One box per token: time claims side by side, which expires first, and identity claims that differ from the first token. */
function JwtCompare({ now }: { now: Date | null }) {
  const list = useValueList({ max: MAX_JWT_COMPARE });
  const { values, hasInput, reset } = list;
  const { rows, referenceLine, summary } = useMemo(() => compareJwts(values, now ?? undefined), [values, now]);
  const ready = summary && rows.length >= 2;

  const report = rows
    .map((r) =>
      [
        `#${r.line} ${[r.fields.sub && `sub=${r.fields.sub}`, r.fields.iss && `iss=${r.fields.iss}`, r.fields.alg && `alg=${r.fields.alg}`].filter(Boolean).join(" ")}`,
        r.iat ? `   iat: ${formatISO(r.iat)}` : null,
        r.nbf ? `   nbf: ${formatISO(r.nbf)}` : null,
        r.exp ? `   exp: ${formatISO(r.exp)}` : "   exp: none",
        r.lifetime !== null ? `   lifetime: ${humanDuration(r.lifetime)}` : null,
        r.untilExpiry !== null ? `   ${r.untilExpiry > 0 ? "expires" : "expired"} ${untilExpiryText(r.untilExpiry)}` : null,
        r.differs.length ? `   differs from #${referenceLine}: ${r.differs.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .concat(
      summary?.firstToExpire && summary.lastToExpire
        ? [`First to expire: #${summary.firstToExpire.line}; last: #${summary.lastToExpire.line} (${humanDuration(summary.expiryGap ?? 0)} apart)`]
        : [],
    )
    .concat(summary?.issuedApart != null ? [`Issued apart: ${humanDuration(summary.issuedApart)}`] : [])
    .join("\n");

  return (
    <Card>
      <CardHeader
        title="Compare tokens"
        description="Enter tokens in separate fields to compare their lifetimes and claims. Decoded only, not verified."
        actions={
          !hasInput ? (
            <Button size="sm" variant="ghost" onClick={() => reset(JWT_COMPARE_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => reset([])}>
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
          )
        }
      />

      <ValueList
        list={list}
        id="jwt-compare"
        itemLabel="token"
        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
        splitPaste={splitJwtPaste}
        status={(value) => {
          const d = decodeJwt(stripBearer(value), now ?? undefined);
          if (!d.ok) return { tone: "error", content: d.error };
          return {
            tone: "ok",
            content: (
              <>
                {jwtShortIdentity(d)} · <span className={d.status.state === "expired" ? "text-danger" : undefined}>{d.status.message}</span>
              </>
            ),
          };
        }}
      />

      {ready ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {summary.firstToExpire ? <Badge tone="warning">#{summary.firstToExpire.line} expires first</Badge> : <Badge>No exp claims</Badge>}
            {summary.lastToExpire && summary.lastToExpire !== summary.firstToExpire ? (
              <Badge tone="success">#{summary.lastToExpire.line} expires last</Badge>
            ) : null}
            {summary.differing ? (
              <Badge tone="warning">
                {summary.differing} differ{summary.differing === 1 ? "s" : ""} from #{referenceLine}
              </Badge>
            ) : (
              <Badge tone="success">Same alg, iss, aud and sub</Badge>
            )}
          </div>

          <OutputGrid>
            <OutputRow
              label={summary.firstToExpire ? `First to expire · #${summary.firstToExpire.line}` : "First to expire"}
              value={summary.firstToExpire?.exp ? formatISO(summary.firstToExpire.exp) : ""}
              hint={summary.firstToExpire?.untilExpiry != null ? untilExpiryText(summary.firstToExpire.untilExpiry) : undefined}
            />
            <OutputRow
              label={summary.lastToExpire ? `Last to expire · #${summary.lastToExpire.line}` : "Last to expire"}
              value={summary.lastToExpire?.exp ? formatISO(summary.lastToExpire.exp) : ""}
              hint={summary.lastToExpire?.untilExpiry != null ? untilExpiryText(summary.lastToExpire.untilExpiry) : undefined}
            />
            <OutputRow
              label="Expiry gap"
              value={summary.expiryGap !== null ? humanDuration(summary.expiryGap) : ""}
              mono={false}
              hint={summary.expiryGap !== null ? `${summary.expiryGap.toLocaleString()} ms` : "Needs exp on at least one token"}
            />
            <OutputRow
              label="Issued apart (iat)"
              value={summary.issuedApart !== null ? humanDuration(summary.issuedApart) : ""}
              mono={false}
              hint={
                summary.earliestIssued && summary.latestIssued && summary.issuedApart !== null
                  ? `#${summary.earliestIssued.line} first, #${summary.latestIssued.line} last`
                  : "Needs iat on at least one token"
              }
            />
          </OutputGrid>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="whitespace-nowrap bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">iat (UTC)</th>
                  <th className="px-3 py-2 font-medium">nbf (UTC)</th>
                  <th className="px-3 py-2 font-medium">exp (UTC)</th>
                  <th className="px-3 py-2 font-medium">Lifetime</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">Differs from #{referenceLine}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t align-top">
                    <td className="px-3 py-2 text-fg-subtle">{r.line}</td>
                    <DateCell date={r.iat} />
                    <DateCell date={r.nbf} />
                    <DateCell date={r.exp} />
                    <td className="whitespace-nowrap px-3 py-2" title={r.lifetime !== null ? humanDuration(r.lifetime) : undefined}>
                      {r.lifetime !== null ? shortDuration(r.lifetime) : <span className="text-fg-subtle">—</span>}
                    </td>
                    <ExpiryCell row={r} />
                    <td className="px-3 py-2">
                      {r.line === referenceLine ? (
                        <span className="text-[11px] text-fg-subtle">reference</span>
                      ) : r.differs.length ? (
                        <div className="flex gap-1">
                          {r.differs.map((f) => (
                            <Badge key={f} tone="warning" title={`#${referenceLine}: ${rows[0].fields[f] ?? "(none)"} · #${r.line}: ${r.fields[f] ?? "(none)"}`}>
                              {f}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-fg-subtle">same</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {rows.length === 1 ? "Add at least one more token to compare." : "Enter two or more tokens to compare their expiry and claims."}
        </p>
      )}
    </Card>
  );
}

function DateCell({ date }: { date: Date | null }) {
  if (!date) return <td className="px-3 py-2 text-fg-subtle">—</td>;
  // Date over time, so four date columns fit without horizontal scrolling.
  const [day, time] = claimISO(date).split("T");
  return (
    <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]" title={formatLocal(date)}>
      <div>{day}</div>
      <div className="text-[11px] text-fg-subtle">{time}</div>
    </td>
  );
}

function ExpiryCell({ row }: { row: JwtCompareRow }) {
  if (row.untilExpiry === null) return <td className="px-3 py-2 text-fg-subtle">never</td>;
  const expired = row.untilExpiry <= 0;
  return (
    <td className="px-3 py-2">
      <div className={cn("whitespace-nowrap", expired ? "text-danger" : "text-fg")}>{untilExpiryText(row.untilExpiry)}</div>
      <div className="text-[11px] text-fg-subtle">{expired ? "expired" : row.state === "not-yet-valid" ? "not yet valid" : "active"}</div>
    </td>
  );
}
