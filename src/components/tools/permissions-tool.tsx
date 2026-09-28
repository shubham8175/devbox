"use client";

import { useState } from "react";
import {
  describePermissionSet,
  EMPTY_PERMISSIONS,
  parseNumeric,
  parseSymbolic,
  PERMISSION_PRESETS,
  toNumeric,
  toSymbolic,
  type Permissions,
  type PermissionSet,
} from "@/lib/tools/permissions";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

type Who = "owner" | "group" | "others";
const WHO: Array<{ key: Who; label: string }> = [
  { key: "owner", label: "Owner" },
  { key: "group", label: "Group" },
  { key: "others", label: "Others" },
];
const BITS: Array<{ key: keyof PermissionSet; label: string; short: string }> = [
  { key: "read", label: "Read", short: "r" },
  { key: "write", label: "Write", short: "w" },
  { key: "execute", label: "Execute", short: "x" },
];

export function PermissionsTool() {
  const [numeric, setNumeric] = useState("755");
  const [symbolic, setSymbolic] = useState("rwxr-xr-x");
  const [perms, setPerms] = useState<Permissions>(() => {
    const r = parseNumeric("755");
    return r.ok ? r.value : EMPTY_PERMISSIONS;
  });
  const [numericError, setNumericError] = useState<string | null>(null);
  const [symbolicError, setSymbolicError] = useState<string | null>(null);

  const applyPerms = (p: Permissions) => {
    setPerms(p);
    setNumeric(toNumeric(p));
    setSymbolic(toSymbolic(p));
    setNumericError(null);
    setSymbolicError(null);
  };

  const onNumeric = (v: string) => {
    setNumeric(v);
    const r = parseNumeric(v);
    if (r.ok) {
      setPerms(r.value);
      setSymbolic(toSymbolic(r.value));
      setNumericError(null);
    } else {
      setNumericError(v.trim() ? r.error : null);
    }
  };

  const onSymbolic = (v: string) => {
    setSymbolic(v);
    const r = parseSymbolic(v);
    if (r.ok) {
      setPerms(r.value);
      setNumeric(toNumeric(r.value));
      setSymbolicError(null);
    } else {
      setSymbolicError(v.trim() ? r.error : null);
    }
  };

  const toggle = (who: Who, bit: keyof PermissionSet) => {
    applyPerms({ ...perms, [who]: { ...perms[who], [bit]: !perms[who][bit] } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Label htmlFor="perm-num">Numeric (octal)</Label>
          <Input
            id="perm-num"
            mono
            value={numeric}
            onChange={(e) => onNumeric(e.target.value)}
            placeholder="755"
            invalid={!!numericError}
            className="h-11 text-lg"
            maxLength={4}
          />
          {numericError ? (
            <Alert tone="danger" className="mt-2">
              {numericError}
            </Alert>
          ) : null}
        </Card>
        <Card>
          <Label htmlFor="perm-sym">Symbolic</Label>
          <Input
            id="perm-sym"
            mono
            value={symbolic}
            onChange={(e) => onSymbolic(e.target.value)}
            placeholder="rwxr-xr-x"
            invalid={!!symbolicError}
            className="h-11 text-lg"
            maxLength={10}
          />
          {symbolicError ? (
            <Alert tone="danger" className="mt-2">
              {symbolicError}
            </Alert>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader title="Bits" description="Click any cell to toggle it. Both inputs above update instantly." />
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover text-[11px] uppercase tracking-wide text-fg-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Who</th>
                {BITS.map((b) => (
                  <th key={b.key} className="px-3 py-2 text-center font-medium">
                    {b.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Octal</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {WHO.map((w) => {
                const set = perms[w.key];
                const digit = (set.read ? 4 : 0) + (set.write ? 2 : 0) + (set.execute ? 1 : 0);
                return (
                  <tr key={w.key} className="bg-bg-elevated">
                    <td className="px-3 py-2 font-medium">{w.label}</td>
                    {BITS.map((b) => {
                      const on = set[b.key];
                      return (
                        <td key={b.key} className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggle(w.key, b.key)}
                            aria-pressed={on}
                            aria-label={`${w.label} ${b.label}`}
                            className={cn(
                              "h-8 w-8 rounded-md border font-mono text-sm transition-colors cursor-pointer",
                              on
                                ? "border-accent/40 bg-accent-soft text-accent-strong"
                                : "bg-surface text-fg-subtle hover:border-border-strong",
                            )}
                          >
                            {on ? b.short : "-"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono">{digit}</td>
                    <td className="hidden px-3 py-2 text-right text-xs text-fg-muted sm:table-cell">{describePermissionSet(set)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={perms.setuid} onChange={() => applyPerms({ ...perms, setuid: !perms.setuid })} className="accent-accent" />
            setuid
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={perms.setgid} onChange={() => applyPerms({ ...perms, setgid: !perms.setgid })} className="accent-accent" />
            setgid
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={perms.sticky} onChange={() => applyPerms({ ...perms, sticky: !perms.sticky })} className="accent-accent" />
            sticky
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Result" />
        <OutputGrid>
          <OutputRow label="chmod" value={`chmod ${toNumeric(perms)} <file>`} />
          <OutputRow label="ls -l" value={`-${toSymbolic(perms)}`} />
          <OutputRow label="Numeric (4-digit)" value={toNumeric(perms, true)} />
          <OutputRow label="Symbolic" value={toSymbolic(perms)} />
        </OutputGrid>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Common modes</div>
          <div className="flex flex-wrap gap-1.5">
            {PERMISSION_PRESETS.map((p) => (
              <button
                key={p.mode}
                type="button"
                onClick={() => onNumeric(p.mode)}
                title={p.label}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer",
                  numeric === p.mode ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                <span className="font-mono font-semibold">{p.mode}</span>
                <span className="ml-1.5 text-fg-subtle">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
