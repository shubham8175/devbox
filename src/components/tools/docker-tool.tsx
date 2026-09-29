"use client";

import { useEffect, useMemo, useState } from "react";
import { COMPOSE_SAMPLE, DOCKERFILE_SAMPLE, explainCompose, explainDockerfile, lintCompose, lintDockerfile, parseDockerfile, type ComposeFinding, type DockerFinding, type DockerSeverity } from "@/lib/tools/docker";
import type { YamlModule } from "@/lib/tools/yaml-json";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Mode = "dockerfile" | "compose";

const TONE: Record<DockerSeverity, "danger" | "warning" | "neutral"> = { error: "danger", warning: "warning", info: "neutral" };
const BORDER: Record<DockerSeverity, string> = { error: "border-l-danger", warning: "border-l-warning", info: "border-l-border-strong" };

interface Finding {
  where: string;
  rule: string;
  severity: DockerSeverity;
  message: string;
  fix?: string;
}

interface Explained {
  head: string;
  detail: string;
  body: string;
}

function fromDockerfile(f: DockerFinding): Finding {
  return { where: `L${f.line}`, rule: f.rule, severity: f.severity, message: f.message, fix: f.fix };
}
function fromCompose(f: ComposeFinding): Finding {
  return { where: f.path || "(root)", rule: f.rule, severity: f.severity, message: f.message, fix: f.fix };
}

export function DockerTool() {
  const [mode, setMode] = useState<Mode>("dockerfile");
  const [input, setInput] = useState("");
  const [yaml, setYaml] = useState<YamlModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // The YAML parser is only needed for Compose files, and only on this route.
  useEffect(() => {
    if (mode !== "compose" || yaml) return;
    let cancelled = false;
    import("yaml")
      .then((m) => {
        if (!cancelled) setYaml({ parse: (src, opts) => m.parse(src, opts), stringify: (v, opts) => m.stringify(v, opts) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The YAML parser failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, yaml]);

  const result = useMemo((): { findings: Finding[]; explained: Explained[]; parseError?: string; loading?: boolean } | null => {
    if (!input.trim()) return null;
    if (mode === "dockerfile") {
      const parsed = parseDockerfile(input);
      const findings = [...parsed.warnings, ...lintDockerfile(parsed.instructions)].sort((a, b) => a.line - b.line).map(fromDockerfile);
      const explained = explainDockerfile(parsed.instructions).map((e) => ({
        head: `${e.instruction}${e.stage !== undefined && parsed.stages > 1 ? ` · stage ${e.stage + 1}` : ""} · L${e.line}`,
        detail: e.explanation,
        body: `${e.instruction} ${e.args}`,
      }));
      return { findings, explained };
    }
    if (!yaml) return { findings: [], explained: [], loading: true };
    let doc: unknown;
    try {
      doc = yaml.parse(input, { prettyErrors: true });
    } catch (e) {
      const err = e as { message?: string; linePos?: Array<{ line: number; col: number }> };
      const pos = err.linePos?.[0];
      return { findings: [], explained: [], parseError: `${(err.message ?? "Invalid YAML").split("\n")[0]}${pos ? ` (line ${pos.line}, column ${pos.col})` : ""}` };
    }
    return {
      findings: lintCompose(doc).map(fromCompose),
      explained: explainCompose(doc).map((s) => ({ head: s.name, detail: s.summary, body: [s.image ? `image: ${s.image}` : s.build ? `build: ${s.build}` : "", ...s.ports.map((p) => `port ${p}`), ...s.dependsOn.map((d) => `depends_on ${d}`)].filter(Boolean).join("\n") })),
    };
  }, [input, mode, yaml]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const f of result?.findings ?? []) c[f.severity]++;
    return c;
  }, [result]);

  const report = (result?.findings ?? []).map((f) => `${f.where} [${f.severity}] ${f.rule}: ${f.message}${f.fix ? ` → ${f.fix}` : ""}`).join("\n");

  const switchMode = (m: Mode) => {
    setMode(m);
    setInput("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={mode === "dockerfile" ? "Dockerfile" : "docker-compose.yml"}
        description="Linted locally. Nothing leaves this page and nothing is stored."
        actions={
          <>
            <Segmented
              size="sm"
              value={mode}
              onChange={switchMode}
              options={[
                { value: "dockerfile", label: "Dockerfile" },
                { value: "compose", label: "Compose" },
              ]}
            />
            {!input ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(mode === "dockerfile" ? DOCKERFILE_SAMPLE : COMPOSE_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            )}
          </>
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "dockerfile" ? "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\n…" : "services:\n  web:\n    image: nginx:1.27\n    ports:\n      - \"8080:80\""} className="min-h-[420px]" invalid={!!result?.parseError} aria-label={mode === "dockerfile" ? "Dockerfile" : "Compose file"} />
        {result?.parseError ? (
          <Alert tone="danger" className="mt-2">
            <span className="font-mono">{result.parseError}</span>
          </Alert>
        ) : null}
      </InputPanel>

      <div className="space-y-4">
        <OutputPanel
          title="Findings"
          actions={
            result && !result.loading && !result.parseError ? (
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
          ) : !result ? (
            <EmptyState title={mode === "dockerfile" ? "Paste a Dockerfile" : "Paste a Compose file"} description={mode === "dockerfile" ? "Checks base image tags, layer caching, secrets, shell vs exec form, root user and more." : "Checks image tags, secrets, port bindings, privileged services, depends_on and more."} />
          ) : result.loading ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-4 w-40 skeleton" />
              <div className="h-24 skeleton" />
              <p className="text-xs text-fg-subtle">Loading YAML parser…</p>
            </div>
          ) : result.parseError ? (
            <EmptyState title="Fix the YAML to see findings" className="py-8" />
          ) : result.findings.length === 0 ? (
            <Alert tone="success">Looks good. No issues found.</Alert>
          ) : (
            <ul className="space-y-1.5">
              {result.findings.map((f, i) => (
                <li key={i} className={cn("rounded-lg border border-l-2 bg-bg-elevated px-3 py-2 text-sm", BORDER[f.severity])}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-fg-subtle">{f.where}</span>
                    <Badge tone={TONE[f.severity]}>{f.severity}</Badge>
                    <span className="font-mono text-[11px] text-fg-subtle">{f.rule}</span>
                  </div>
                  <div className="mt-1 text-fg">{f.message}</div>
                  {f.fix ? <div className="mt-0.5 text-xs text-fg-muted">{f.fix}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </OutputPanel>

        {result && !result.loading && !result.parseError && result.explained.length ? (
          <OutputPanel title="Explained" description={mode === "dockerfile" ? `${result.explained.length} instructions, in order` : `${result.explained.length} services`}>
            <ol className="space-y-2">
              {result.explained.map((e, i) => (
                <li key={i} className="rounded-lg border bg-bg-elevated p-3">
                  <div className="mb-1 font-mono text-[11px] text-accent-strong">{e.head}</div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg">{e.body}</pre>
                  <p className="mt-1.5 text-xs text-fg-muted">{e.detail}</p>
                </li>
              ))}
            </ol>
          </OutputPanel>
        ) : null}
      </div>
    </div>
  );
}
