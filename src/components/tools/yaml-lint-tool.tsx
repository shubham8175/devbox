"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GHA_SAMPLE, K8S_SAMPLE, lintYamlDocument, type YamlFinding, type YamlKind, type YamlSeverity } from "@/lib/tools/yaml-lint";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

/** Minimal surface of `yaml` used here; `parseAllDocuments` supports `---` separated files. */
interface YamlMultiModule {
  parseAllDocuments: (src: string) => Array<{ toJS: () => unknown; errors: Array<{ message: string; linePos?: Array<{ line: number; col: number }> }> }>;
}

interface DocResult {
  index: number;
  kind: YamlKind;
  findings: YamlFinding[];
  error?: string;
}

const KIND_LABEL: Record<YamlKind, string> = { "github-actions": "GitHub Actions", kubernetes: "Kubernetes", "docker-compose": "Docker Compose", "gitlab-ci": "GitLab CI", unknown: "Unknown" };
const TONE: Record<YamlSeverity, "danger" | "warning" | "neutral"> = { error: "danger", warning: "warning", info: "neutral" };
const BORDER: Record<YamlSeverity, string> = { error: "border-l-danger", warning: "border-l-warning", info: "border-l-border-strong" };
const ORDER: YamlSeverity[] = ["error", "warning", "info"];
const SEVERITY_TITLE: Record<YamlSeverity, string> = { error: "Errors", warning: "Warnings", info: "Notes" };

export function YamlLintTool() {
  const [input, setInput] = useState("");
  const [yaml, setYaml] = useState<YamlMultiModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load the YAML library only on this route.
  useEffect(() => {
    let cancelled = false;
    import("yaml")
      .then((m) => {
        if (!cancelled) setYaml({ parseAllDocuments: (src) => m.parseAllDocuments(src) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The YAML parser failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const docs = useMemo((): DocResult[] | null => {
    if (!yaml || !input.trim()) return null;
    const parsed = yaml.parseAllDocuments(input);
    return parsed.map((d, index) => {
      if (d.errors.length) {
        const e = d.errors[0];
        const pos = e.linePos?.[0];
        return { index, kind: "unknown", findings: [], error: `${e.message.split("\n")[0]}${pos ? ` (line ${pos.line}, column ${pos.col})` : ""}` };
      }
      const value = d.toJS();
      if (value === null || value === undefined) return { index, kind: "unknown", findings: [] };
      const r = lintYamlDocument(value);
      return { index, kind: r.kind, findings: r.findings };
    });
  }, [yaml, input]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const d of docs ?? []) {
      if (d.error) c.error++;
      for (const f of d.findings) c[f.severity]++;
    }
    return c;
  }, [docs]);

  const hasSyntaxError = docs?.some((d) => d.error) ?? false;
  const total = counts.error + counts.warning + counts.info;
  const multi = (docs?.length ?? 0) > 1;
  const report = (docs ?? [])
    .flatMap((d) => (d.error ? [`doc ${d.index + 1}: YAML error: ${d.error}`] : d.findings.map((f) => `${multi ? `doc ${d.index + 1} ` : ""}${f.path || "(root)"} [${f.severity}] ${f.rule}: ${f.message}${f.fix ? ` → ${f.fix}` : ""}`)))
    .join("\n");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="YAML"
        description="GitHub Actions workflows or Kubernetes manifests; multi-document files (---) are supported. Nothing leaves this page."
        actions={
          !input ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setInput(GHA_SAMPLE)}>
                Sample: GitHub Actions
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInput(K8S_SAMPLE)}>
                Sample: Kubernetes
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-24.04\n    steps:\n      - uses: actions/checkout@v4"} className="min-h-[440px]" invalid={hasSyntaxError} aria-label="YAML input" />
        {docs?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <Badge key={d.index} tone={d.error ? "danger" : d.kind === "unknown" ? "neutral" : "accent"}>
                {multi ? `Doc ${d.index + 1}: ` : ""}
                {d.error ? "Invalid YAML" : KIND_LABEL[d.kind]}
              </Badge>
            ))}
          </div>
        ) : null}
      </InputPanel>

      <OutputPanel
        title="Findings"
        actions={
          docs ? (
            <>
              <Badge tone={counts.error ? "danger" : "success"}>{counts.error} errors</Badge>
              <Badge tone={counts.warning ? "warning" : "success"}>{counts.warning} warnings</Badge>
              <Badge>{counts.info} notes</Badge>
              <CopyButton value={report} label="Copy report" />
            </>
          ) : null
        }
      >
        {loadError ? (
          <Alert tone="danger">{loadError}</Alert>
        ) : !input.trim() ? (
          <EmptyState title="Paste a workflow or manifest" description="Checks unpinned actions, script injection, missing permissions, :latest images, missing resources and probes, deprecated apiVersions and more." />
        ) : !yaml ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-4 w-40 skeleton" />
            <div className="h-24 skeleton" />
            <p className="text-xs text-fg-subtle">Loading YAML parser…</p>
          </div>
        ) : total === 0 ? (
          docs?.every((d) => d.kind === "unknown") ? (
            <Alert tone="warning">Could not tell what this YAML is. GitHub Actions files need “on” and “jobs”; Kubernetes manifests need “apiVersion” and “kind”.</Alert>
          ) : (
            <Alert tone="success">Looks good. No issues found in {docs?.length === 1 ? "this document" : `${docs?.length} documents`}.</Alert>
          )
        ) : (
          <div className="space-y-4">
            {docs?.map((d) => {
              if (!d.error && d.findings.length === 0) return null;
              return (
                <div key={d.index}>
                  {multi ? (
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg-muted">
                      Document {d.index + 1} <Badge tone={d.error ? "danger" : "accent"}>{d.error ? "Invalid YAML" : KIND_LABEL[d.kind]}</Badge>
                    </div>
                  ) : null}
                  {d.error ? (
                    <Alert tone="danger">
                      <span className="font-mono">{d.error}</span>
                    </Alert>
                  ) : (
                    ORDER.map((sev) => {
                      const items = d.findings.filter((f) => f.severity === sev);
                      if (!items.length) return null;
                      return (
                        <div key={sev} className="mb-3">
                          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                            {SEVERITY_TITLE[sev]} · {items.length}
                          </div>
                          <ul className="space-y-1.5">
                            {items.map((f, i) => (
                              <li key={i} className={cn("rounded-lg border border-l-2 bg-bg-elevated px-3 py-2 text-sm", BORDER[f.severity])}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={TONE[f.severity]}>{f.severity}</Badge>
                                  <span className="break-all font-mono text-[11px] text-accent-strong">{f.path || "(root)"}</span>
                                  <span className="font-mono text-[11px] text-fg-subtle">{f.rule}</span>
                                </div>
                                <div className="mt-1 text-fg">{f.message}</div>
                                {f.fix ? <div className="mt-0.5 text-xs text-fg-muted">{f.fix}</div> : null}
                                {f.rule === "use-docker-tool" ? (
                                  <Link href="/tools/docker" className="mt-1 inline-block text-xs text-accent-strong hover:underline">
                                    Open the Dockerfile &amp; Compose Linter
                                  </Link>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </OutputPanel>
    </div>
  );
}
