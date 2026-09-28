"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { GITIGNORE_TEMPLATES } from "@/data/gitignore-templates";
import { buildGitignore } from "@/lib/tools/gitignore";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const GROUPS = ["Languages & frameworks", "Platforms", "Editors"] as const;

export function GitignoreTool() {
  const [selected, setSelected] = useState<string[]>(["node", "nextjs", "macos", "vscode"]);
  const result = useMemo(() => buildGitignore(selected), [selected]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const download = () => {
    const blob = new Blob([result.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ".gitignore";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InputPanel
        title="Technologies"
        description="Pick everything your repo uses. Overlapping rules are merged once."
        className="lg:col-span-2 lg:self-start"
        actions={
          <Button size="sm" variant="ghost" onClick={() => setSelected([])} disabled={!selected.length}>
            Clear
          </Button>
        }
      >
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {GITIGNORE_TEMPLATES.filter((t) => t.group === g).map((t) => {
                  const on = selected.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                        on ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </InputPanel>

      <OutputPanel
        title=".gitignore"
        className="lg:col-span-3"
        description={selected.length ? `${result.lines} rules · ${result.duplicatesRemoved} duplicates removed` : undefined}
        actions={
          <>
            {selected.length ? <Badge>{selected.length} selected</Badge> : null}
            <CopyButton value={result.content} disabled={!selected.length} />
            <Button size="sm" variant="primary" onClick={download} disabled={!selected.length}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
          </>
        }
      >
        {selected.length ? (
          <pre className="max-h-[640px] overflow-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{result.content}</pre>
        ) : (
          <EmptyState title="Nothing selected" description="Choose one or more technologies on the left." />
        )}
      </OutputPanel>
    </div>
  );
}
