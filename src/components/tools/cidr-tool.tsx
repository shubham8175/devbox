"use client";

import { useMemo, useState } from "react";
import { Eraser } from "lucide-react";
import { ipInRange, parseCidr } from "@/lib/tools/ip";
import { CIDR_COMPARE_SAMPLE, compareCidrs, MAX_CIDR_COMPARE, parseCidrEntry, splitCidrPaste, toCidrEntries, type CidrPair } from "@/lib/tools/cidr-compare";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { useValueList, ValueList } from "@/components/value-list";

const EXAMPLES = ["192.168.1.10/24", "10.0.0.0/8", "172.16.5.4 255.255.240.0", "203.0.113.7/31", "8.8.8.8/32"];

export function CidrTool() {
  const [input, setInput] = useState("192.168.1.10/24");
  const [check, setCheck] = useState("");
  const result = useMemo(() => parseCidr(input), [input]);
  const info = result.ok ? result.value : null;
  const inRange = info && check.trim() ? ipInRange(check, info) : null;

  const summary = info
    ? [`Network: ${info.network}/${info.prefix}`, `Mask: ${info.mask}`, `Broadcast: ${info.broadcast}`, `Hosts: ${info.firstHost} – ${info.lastHost} (${info.usableHosts.toLocaleString()} usable)`].join("\n")
    : "";

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Address" description="IPv4 only. Accepts a.b.c.d/n or a.b.c.d with a dotted mask." />
        <Label htmlFor="cidr-in">Address / prefix</Label>
        <Input id="cidr-in" mono value={input} onChange={(e) => setInput(e.target.value)} placeholder="192.168.1.10/24" invalid={!result.ok} className="h-11 text-base" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setInput(ex)} className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer">
              {ex}
            </button>
          ))}
        </div>
        {!result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </Card>

      {info ? (
        <>
          <Card className="shadow-card">
            <CardHeader
              title="Network"
              actions={
                <>
                  <Badge>Class {info.ipClass}</Badge>
                  {info.special ? <Badge tone="warning">{info.special}</Badge> : <Badge tone="success">Public</Badge>}
                  <CopyButton value={summary} label="Copy summary" />
                </>
              }
            />
            <OutputGrid>
              <OutputRow label="Network address" value={`${info.network}/${info.prefix}`} />
              <OutputRow label="Broadcast address" value={info.broadcast} />
              <OutputRow label="Subnet mask" value={info.mask} hint={`${info.maskHex} · /${info.prefix}`} />
              <OutputRow label="Wildcard mask" value={info.wildcard} />
              <OutputRow label="First usable host" value={info.firstHost} />
              <OutputRow label="Last usable host" value={info.lastHost} />
              <OutputRow label="Usable hosts" value={info.usableHosts.toLocaleString()} hint={info.prefix === 31 ? "RFC 3021 point-to-point: both addresses usable" : info.prefix === 32 ? "Single host" : undefined} />
              <OutputRow label="Total addresses" value={info.totalAddresses.toLocaleString()} />
            </OutputGrid>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader title="Binary" />
              <div className="space-y-2 font-mono text-xs">
                <BinaryRow label="Address" value={info.addressBinary} prefix={info.prefix} />
                <BinaryRow label="Mask" value={info.maskBinary} prefix={info.prefix} />
              </div>
              <p className="mt-2 text-[11px] text-fg-subtle">Highlighted bits are the network portion.</p>
            </Card>
            <Card className="shadow-card">
              <CardHeader title="Is an address in this range?" />
              <Label htmlFor="cidr-check">IPv4 address</Label>
              <Input id="cidr-check" mono value={check} onChange={(e) => setCheck(e.target.value)} placeholder="192.168.1.200" invalid={check.trim() !== "" && inRange === null} />
              {check.trim() ? (
                <div className="mt-3">
                  {inRange === null ? <Alert tone="danger">Not a valid IPv4 address.</Alert> : inRange ? <Alert tone="success">{check.trim()} is inside {info.network}/{info.prefix}.</Alert> : <Alert tone="warning">{check.trim()} is outside {info.network}/{info.prefix}.</Alert>}
                </div>
              ) : null}
            </Card>
          </div>
        </>
      ) : null}

      <CidrCompare />
    </div>
  );
}

const RELATION_LABEL: Record<CidrPair["relation"], string> = {
  identical: "Duplicate",
  "a-contains-b": "Contains",
  "b-contains-a": "Contains",
  overlaps: "Overlaps",
  adjacent: "Adjacent",
  disjoint: "Disjoint",
};

/** One box per range: which ones overlap or nest, the union they cover and its smallest supernet. */
function CidrCompare() {
  const list = useValueList({ max: MAX_CIDR_COMPARE });
  const { values, hasInput, reset } = list;
  const r = useMemo(() => compareCidrs(toCidrEntries(values)), [values]);
  // Ranges with no leading bits in common only "fit" in 0.0.0.0/0, which says nothing useful.
  const supernet = r.supernet && !r.supernet.cidr.endsWith("/0") ? r.supernet : null;

  const report = [
    ...r.valid.map((e) => `#${e.line} ${e.cidr}  ${e.info.network} – ${e.info.broadcast} (${e.size.toLocaleString()} addresses)${e.normalizedFrom ? `  normalized from ${e.normalizedFrom}` : ""}`),
    "",
    r.conflicts.length ? `Conflicts (${r.conflicts.length}):` : "No overlaps.",
    ...r.conflicts.map((p) => `  ${p.text}`),
    ...(r.adjacent.length ? ["Adjacent:", ...r.adjacent.map((p) => `  ${p.text}`)] : []),
    "",
    `Unique addresses covered: ${r.unionSize.toLocaleString()}`,
    supernet ? `Smallest covering supernet: ${supernet.cidr}` : "",
    `Collapsed: ${r.collapsed.join(", ")}`,
  ].join("\n");

  return (
    <Card className="shadow-card">
      <CardHeader
        title="Compare ranges"
        description="One CIDR per box (a bare IP counts as /32). Finds overlapping, nested and duplicate ranges."
        actions={
          !hasInput ? (
            <Button size="sm" variant="ghost" onClick={() => reset(CIDR_COMPARE_SAMPLE)}>
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
        id="cidr-cmp"
        placeholder="10.0.1.0/24"
        itemLabel="range"
        splitPaste={splitCidrPaste}
        status={(value, i) => {
          const e = parseCidrEntry(value, i + 1);
          if (!e.ok) return { tone: "error", content: e.error };
          return {
            tone: "ok",
            content: (
              <>
                <span className="font-mono">
                  {e.info.network} – {e.info.broadcast}
                </span>{" "}
                · {e.size.toLocaleString()} {e.size === 1 ? "address" : "addresses"}
                {e.info.prefix < 31 ? ` (${e.info.usableHosts.toLocaleString()} usable)` : ""}
                {e.normalizedFrom ? (
                  <span className="text-warning">
                    {" "}
                    · normalized to <span className="font-mono">{e.cidr}</span>
                  </span>
                ) : null}
              </>
            ),
          };
        }}
      />

      {r.valid.length >= 2 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {r.conflicts.length ? (
              <Badge tone="warning">
                {r.conflicts.length} overlapping {r.conflicts.length === 1 ? "pair" : "pairs"}
              </Badge>
            ) : (
              <Badge tone="success">No overlaps</Badge>
            )}
            <Badge tone="accent">{r.unionSize.toLocaleString()} unique addresses</Badge>
            {supernet ? <Badge>Fits in {supernet.cidr}</Badge> : null}
            {r.adjacent.length ? <Badge>{r.adjacent.length} adjacent</Badge> : null}
          </div>

          <OutputGrid>
            <OutputRow
              label="Unique addresses covered"
              value={r.unionSize.toLocaleString()}
              hint={`Sum of ranges: ${r.valid.reduce((n, e) => n + e.size, 0).toLocaleString()}, overlaps counted once`}
            />
            {supernet ? (
              <OutputRow
                label="Smallest covering supernet"
                value={supernet.cidr}
                hint={`${supernet.size.toLocaleString()} addresses · ${(supernet.size - r.unionSize).toLocaleString()} not in any range`}
              />
            ) : null}
          </OutputGrid>

          {r.conflicts.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-bg-elevated text-[11px] uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pair</th>
                    <th className="px-3 py-2 font-medium">Relation</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 font-medium">Shared</th>
                  </tr>
                </thead>
                <tbody>
                  {r.conflicts.map((p) => (
                    <tr key={`${p.a.line}-${p.b.line}`} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-fg-subtle">
                        #{p.a.line} · #{p.b.line}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={p.relation === "identical" ? "danger" : "warning"}>{RELATION_LABEL[p.relation]}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-[13px]">{p.text}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{p.shared.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {r.adjacent.length ? (
            <ul className="space-y-1 text-xs text-fg-muted">
              {r.adjacent.map((p) => (
                <li key={`${p.a.line}-${p.b.line}`} className="font-mono">
                  {p.text}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="rounded-lg border bg-bg-elevated px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                Collapsed list · {r.collapsed.length} {r.collapsed.length === 1 ? "range" : "ranges"}
              </div>
              <CopyButton value={r.collapsed.join("\n")} iconOnly className="shrink-0" />
            </div>
            <div className="mt-1 break-all font-mono text-sm text-fg">{r.collapsed.join(", ")}</div>
            <div className="mt-0.5 text-[11px] text-fg-subtle">Fewest CIDRs covering exactly the same addresses (nested ranges dropped, aligned neighbours merged).</div>
          </div>

          <div className="flex justify-end">
            <CopyButton label="Copy report" value={report} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-fg-subtle">
          {r.valid.length === 1 ? "Add at least one more range to compare." : "Enter two or more ranges to check them for overlaps."}
        </p>
      )}
    </Card>
  );
}

function BinaryRow({ label, value, prefix }: { label: string; value: string; prefix: number }) {
  // value is "01234567.01234567.01234567.01234567"; count network bits across dots
  let bitIndex = 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-fg-subtle">{label}</span>
      <span className="break-all">
        {value.split("").map((ch, i) => {
          if (ch === ".") return <span key={i} className="text-fg-subtle">.</span>;
          const net = bitIndex < prefix;
          bitIndex++;
          return (
            <span key={i} className={net ? "text-accent-strong" : "text-fg-muted"}>
              {ch}
            </span>
          );
        })}
      </span>
    </div>
  );
}
