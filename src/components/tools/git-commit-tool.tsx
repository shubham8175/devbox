"use client";

import { useMemo, useState } from "react";
import { COMMIT_TYPES, buildCommit, type CommitFields } from "@/lib/tools/git-commit";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const EMPTY: CommitFields = { type: "feat", scope: "", description: "", body: "", breaking: false, breakingDescription: "", issues: "" };

export function GitCommitTool() {
  const [f, setF] = useState<CommitFields>({ ...EMPTY, scope: "auth", description: "add OTP login" });
  const set = <K extends keyof CommitFields>(k: K, v: CommitFields[K]) => setF((s) => ({ ...s, [k]: v }));
  const out = useMemo(() => buildCommit(f), [f]);
  const typeMeta = COMMIT_TYPES.find((t) => t.type === f.type);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InputPanel
        title="Commit"
        description="Conventional Commits: type(scope)!: description"
        className="lg:col-span-3"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>
            Clear
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gc-type" hint={typeMeta?.hint}>
              Type
            </Label>
            <Select id="gc-type" value={f.type} onChange={(e) => set("type", e.target.value)}>
              {COMMIT_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="gc-scope" hint="optional">
              Scope
            </Label>
            <Input id="gc-scope" mono value={f.scope} onChange={(e) => set("scope", e.target.value)} placeholder="auth" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gc-desc" hint={<span className={cn(out.subject.length > 72 ? "text-danger" : out.subject.length > 50 ? "text-warning" : undefined)}>subject {out.subject.length}/72</span>}>
              Description
            </Label>
            <Input id="gc-desc" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="add OTP login" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gc-body" hint="optional · wrap at 72">
              Body
            </Label>
            <Textarea id="gc-body" value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Explain what and why, not how." className="min-h-[100px] font-sans" />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
              <input type="checkbox" checked={f.breaking} onChange={(e) => set("breaking", e.target.checked)} className="accent-accent" />
              Breaking change
            </label>
            {f.breaking ? <Input value={f.breakingDescription} onChange={(e) => set("breakingDescription", e.target.value)} placeholder="Describe the breaking change (defaults to the description)" className="mt-2" aria-label="Breaking change description" /> : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gc-issues" hint="comma or space separated">
              Issue references
            </Label>
            <Input id="gc-issues" mono value={f.issues} onChange={(e) => set("issues", e.target.value)} placeholder="#123, #456" />
          </div>
        </div>
        {out.lint.length ? (
          <div className="mt-3 space-y-1.5">
            {out.lint.map((l, i) => (
              <Alert key={i} tone={l.level === "warning" ? "warning" : "info"}>
                {l.message}
              </Alert>
            ))}
          </div>
        ) : null}
      </InputPanel>

      <div className="space-y-4 lg:col-span-2">
        <OutputPanel title="Preview" actions={<CopyButton value={out.message} label="Copy message" variant="primary" disabled={!f.description.trim()} />}>
          <pre className="whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{out.message}</pre>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{f.type}</Badge>
            {f.scope.trim() ? <Badge>{f.scope.trim()}</Badge> : null}
            {f.breaking ? <Badge tone="danger">breaking</Badge> : null}
          </div>
        </OutputPanel>
        <OutputPanel title="Command" actions={<CopyButton value={out.command} disabled={!f.description.trim()} />}>
          <pre className="whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{out.command}</pre>
        </OutputPanel>
      </div>
    </div>
  );
}
