"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { DDL_SAMPLE, parseDdl } from "@/lib/tools/ddl";
import { ORM_TARGETS, generateOrm, type OrmDialect, type OrmNaming, type OrmTarget } from "@/lib/tools/sql-to-orm";
import { downloadBlob } from "@/lib/tools/canvas";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

export function SqlToOrmTool() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<OrmTarget>("prisma");
  const [dialect, setDialect] = useState<OrmDialect>("postgresql");
  const [naming, setNaming] = useState<OrmNaming>("camel");

  const debounced = useDebounced(input, 200);
  const parsed = useMemo(() => (debounced.trim() ? parseDdl(debounced) : null), [debounced]);
  const output = useMemo(() => (parsed?.ok ? generateOrm(parsed.tables, target, { dialect, naming }) : null), [parsed, target, dialect, naming]);
  const warnings = useMemo(() => [...(parsed?.ok ? parsed.warnings : []), ...(output?.warnings ?? [])], [parsed, output]);
  const targetMeta = ORM_TARGETS.find((t) => t.id === target) ?? ORM_TARGETS[0];

  const download = () => {
    if (!output) return;
    // Built from the in-memory string; nothing is uploaded anywhere.
    downloadBlob(new Blob([output.code], { type: "text/plain;charset=utf-8" }), output.filename);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title="SQL DDL"
        description="CREATE TABLE statements (PostgreSQL, MySQL or SQLite). ALTER TABLE … ADD FOREIGN KEY, CREATE INDEX and CREATE TYPE … AS ENUM are understood too."
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(DDL_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={"CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);"} className="min-h-[420px]" invalid={parsed ? !parsed.ok : false} aria-label="SQL DDL input" />
        {parsed && !parsed.ok ? (
          <Alert tone="danger" className="mt-2">
            {parsed.error}
          </Alert>
        ) : null}
        {parsed?.ok ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="success">
              {parsed.tables.length} {parsed.tables.length === 1 ? "table" : "tables"}
            </Badge>
            <Badge>{parsed.tables.reduce((n, t) => n + t.columns.length, 0)} columns</Badge>
            <Badge>{parsed.tables.reduce((n, t) => n + t.foreignKeys.length, 0)} foreign keys</Badge>
          </div>
        ) : null}
        <p className="mt-3 text-[11px] text-fg-subtle">Parsed in your browser. Nothing leaves this page and nothing is stored.</p>
      </InputPanel>

      <OutputPanel
        title={targetMeta.label}
        description={`Generated ${targetMeta.filename}`}
        actions={
          <>
            <Button size="sm" onClick={download} disabled={!output} title="Download file">
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <CopyButton value={output?.code ?? ""} variant="primary" />
          </>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="orm-target">Target</Label>
            <Select id="orm-target" value={target} onChange={(e) => setTarget(e.target.value as OrmTarget)} className="w-44">
              {ORM_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Dialect</Label>
            <Segmented
              size="sm"
              value={dialect}
              onChange={setDialect}
              options={[
                { value: "postgresql", label: "PostgreSQL" },
                { value: "mysql", label: "MySQL" },
              ]}
            />
          </div>
          <div>
            <Label>Field names</Label>
            <Segmented
              size="sm"
              value={naming}
              onChange={setNaming}
              options={[
                { value: "camel", label: "camelCase" },
                { value: "preserve", label: "As is" },
              ]}
            />
          </div>
        </div>
        {warnings.length ? (
          <Alert tone="info" className="mb-3">
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
        {output ? (
          <pre className="max-h-[560px] overflow-auto rounded-lg border bg-bg-elevated p-4 font-mono text-xs leading-relaxed text-fg">{output.code}</pre>
        ) : (
          <EmptyState title="Paste CREATE TABLE statements" description="Columns, primary and foreign keys, unique constraints, defaults and enums are mapped to the selected ORM, with relations in both directions." />
        )}
      </OutputPanel>
    </div>
  );
}
