"use client";

import { useMemo, useState } from "react";
import { ipForms, parseIpAny } from "@/lib/tools/ip";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { OutputGrid, OutputRow } from "@/components/output-row";

type Source = "dotted" | "integer";

export function IpConverterTool() {
  const [dotted, setDotted] = useState("192.168.1.1");
  const [integer, setInteger] = useState("3232235777");
  const [source, setSource] = useState<Source>("dotted");

  const result = useMemo(() => parseIpAny(source === "dotted" ? dotted : integer), [source, dotted, integer]);
  const forms = result.ok ? ipForms(result.value) : null;

  const onDotted = (v: string) => {
    setDotted(v);
    setSource("dotted");
    const r = parseIpAny(v);
    if (r.ok) setInteger(String(r.value));
  };
  const onInteger = (v: string) => {
    setInteger(v);
    setSource("integer");
    const r = parseIpAny(v);
    if (r.ok) setDotted(ipForms(r.value).dotted);
  };

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader title="Convert" description="Edit either side. Integers may be decimal, 0x hex or 0b binary." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ip-dotted">IPv4 address</Label>
            <Input id="ip-dotted" mono value={dotted} onChange={(e) => onDotted(e.target.value)} placeholder="192.168.1.1" invalid={source === "dotted" && !result.ok} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="ip-int">Integer</Label>
            <Input id="ip-int" mono value={integer} onChange={(e) => onInteger(e.target.value)} placeholder="3232235777" invalid={source === "integer" && !result.ok} className="h-11 text-base" />
          </div>
        </div>
        {!result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Representations" actions={forms ? <Badge tone="success">Valid IPv4</Badge> : null} />
        <OutputGrid>
          <OutputRow label="Dotted decimal" value={forms?.dotted ?? ""} />
          <OutputRow label="Unsigned integer" value={forms?.integer ?? ""} />
          <OutputRow label="Hexadecimal" value={forms?.hex ?? ""} />
          <OutputRow label="Octal" value={forms?.octal ?? ""} />
          <OutputRow label="Binary (dotted)" value={forms?.binary ?? ""} />
          <OutputRow label="Binary (32-bit)" value={forms?.bits ?? ""} />
        </OutputGrid>
        <p className="mt-3 text-[11px] text-fg-subtle">Integer form is the big-endian 32-bit value (a·2²⁴ + b·2¹⁶ + c·2⁸ + d), as used by MySQL INET_ATON and many geo-IP databases.</p>
      </Card>
    </div>
  );
}
