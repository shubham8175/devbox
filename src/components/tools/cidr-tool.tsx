"use client";

import { useMemo, useState } from "react";
import { ipInRange, parseCidr } from "@/lib/tools/ip";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

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
    </div>
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
