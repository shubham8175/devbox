"use client";

import { useMemo, useState } from "react";
import { BUMP_TYPES, OPERATORS, PRERELEASE_EXAMPLES, bumpAll, compareVersions, parseVersion, satisfies, sortVersions } from "@/lib/tools/semver";
import { Card, CardHeader } from "@/components/ui/card";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

export function SemverTool() {
  const [version, setVersion] = useState("1.4.2-beta.3+build.7");
  const [identifier, setIdentifier] = useState("beta");
  const [a, setA] = useState("1.10.0");
  const [b, setB] = useState("1.9.9");
  const [range, setRange] = useState("^1.4.0");
  const [list, setList] = useState("1.0.0\n2.0.0-rc.1\n1.10.0\n1.2.3\n0.9.0\n2.0.0\ngarbage");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const parsed = useMemo(() => parseVersion(version), [version]);
  const bumps = useMemo(() => bumpAll(version, identifier || "beta"), [version, identifier]);
  const cmp = useMemo(() => compareVersions(a, b), [a, b]);
  const sat = useMemo(() => satisfies(version, range), [version, range]);
  const sorted = useMemo(() => sortVersions(list.split("\n"), direction), [list, direction]);

  return (
    <div className="space-y-4">
      <InputPanel title="Version" description="Parse, validate and bump a semantic version.">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="sv-version">Version</Label>
            <Input id="sv-version" mono value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.2.3" invalid={!!version.trim() && !parsed} className="h-11 text-base" />
          </div>
          <div className="sm:w-40">
            <Label htmlFor="sv-id">Prerelease id</Label>
            <Input id="sv-id" mono value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="beta" className="h-11" />
          </div>
        </div>
        {version.trim() && !parsed ? (
          <Alert tone="danger" className="mt-3">
            Not a valid semver version. Expected MAJOR.MINOR.PATCH with optional -prerelease and +build, e.g. 2.1.0-rc.1.
          </Alert>
        ) : null}
        {parsed ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Valid</Badge>
              {parsed.prerelease.length ? <Badge tone="warning">Prerelease</Badge> : <Badge>Release</Badge>}
              {parsed.build.length ? <Badge>Has build metadata</Badge> : null}
            </div>
            <OutputGrid className="sm:grid-cols-3">
              <OutputRow label="Major" value={String(parsed.major)} />
              <OutputRow label="Minor" value={String(parsed.minor)} />
              <OutputRow label="Patch" value={String(parsed.patch)} />
              <OutputRow label="Prerelease" value={parsed.prerelease.join(".")} placeholder="(none)" />
              <OutputRow label="Build" value={parsed.build.join(".")} placeholder="(none)" />
              <OutputRow label="Normalized" value={parsed.version} />
            </OutputGrid>
          </div>
        ) : null}
      </InputPanel>

      {bumps ? (
        <OutputPanel title="Bump" description="What the next version would be for each release type.">
          <OutputGrid className="sm:grid-cols-2 lg:grid-cols-4">
            {BUMP_TYPES.map((t) => (
              <OutputRow key={t} label={t} value={bumps[t]} />
            ))}
          </OutputGrid>
        </OutputPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader title="Compare" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sv-a">A</Label>
              <Input id="sv-a" mono value={a} onChange={(e) => setA(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="sv-b">B</Label>
              <Input id="sv-b" mono value={b} onChange={(e) => setB(e.target.value)} />
            </div>
          </div>
          {cmp.ok ? (
            <div className="mt-3 rounded-lg border bg-bg-elevated px-3 py-2 text-sm">
              <span className="font-mono">{a.trim()}</span> is{" "}
              <span className="font-semibold text-accent-strong">{cmp.result === 0 ? "equal to" : cmp.result > 0 ? "greater than" : "lower than"}</span>{" "}
              <span className="font-mono">{b.trim()}</span>
              {cmp.diff ? <span className="text-fg-muted"> · differs at {cmp.diff}</span> : null}
            </div>
          ) : (
            <Alert tone="danger" className="mt-3">
              {cmp.error}
            </Alert>
          )}
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Satisfies range" description="Does the version above match this range?" />
          <Label htmlFor="sv-range">Range</Label>
          <Input id="sv-range" mono value={range} onChange={(e) => setRange(e.target.value)} placeholder="^1.2.3" invalid={!sat.ok && !!range.trim()} />
          {sat.ok ? (
            <div className="mt-3">
              <Badge tone={sat.satisfies ? "success" : "danger"}>
                {version.trim()} {sat.satisfies ? "satisfies" : "does not satisfy"} {range.trim()}
              </Badge>
            </div>
          ) : (
            <Alert tone="danger" className="mt-3">
              {sat.error}
            </Alert>
          )}
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader
          title="Sort versions"
          description="One version per line. Invalid lines are listed separately."
          actions={
            <>
              <Segmented
                size="sm"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "asc", label: "Ascending" },
                  { value: "desc", label: "Descending" },
                ]}
              />
              <CopyButton value={sorted.valid.join("\n")} label="Copy sorted" />
            </>
          }
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <Textarea value={list} onChange={(e) => setList(e.target.value)} className="min-h-[160px]" aria-label="Versions to sort" />
          <div>
            <pre className="min-h-[160px] rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{sorted.valid.join("\n") || "—"}</pre>
            {sorted.invalid.length ? (
              <p className="mt-2 text-xs text-danger">
                Ignored {sorted.invalid.length} invalid: {sorted.invalid.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader title="Range operators" />
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <tbody className="divide-y">
                {OPERATORS.map((o) => (
                  <tr key={o.op} className="bg-bg-elevated align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-accent-strong">{o.op}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">{o.example}</td>
                    <td className="px-3 py-2 text-fg-muted">{o.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="shadow-card">
          <CardHeader title="Prerelease ordering" description="Lowest to highest." />
          <ol className="space-y-1.5">
            {PRERELEASE_EXAMPLES.map((p, i) => (
              <li key={p.version} className="flex items-center gap-3 rounded-lg border bg-bg-elevated px-3 py-1.5 text-xs">
                <span className="w-4 text-right font-mono text-fg-subtle">{i + 1}</span>
                <span className="font-mono">{p.version}</span>
                <span className="ml-auto text-right text-fg-muted">{p.note}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
