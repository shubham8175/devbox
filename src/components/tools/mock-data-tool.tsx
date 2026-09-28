"use client";

import { useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DEFAULT_FIELDS, FIELD_TYPES, generateRows, rowsToCsv, type MockField, type MockFieldType } from "@/lib/tools/mock-data";
import { downloadBlob } from "@/lib/tools/canvas";
import { useHydrated } from "@/hooks/use-hydrated";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";

type Format = "json" | "csv";

export function MockDataTool() {
  const hydrated = useHydrated();
  const [fields, setFields] = useState<MockField[]>(DEFAULT_FIELDS);
  const [quantity, setQuantity] = useState("10");
  const [format, setFormat] = useState<Format>("json");
  const [nonce, setNonce] = useState(0);
  const [nextId, setNextId] = useState(100);

  const qty = Math.max(1, Math.min(1000, Math.floor(Number(quantity)) || 1));
  const validFields = fields.filter((f) => f.name.trim());
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const f of validFields) {
      const k = f.name.trim();
      if (seen.has(k)) dups.add(k);
      seen.add(k);
    }
    return Array.from(dups);
  }, [validFields]);

  // Random output is generated on the client only (crypto + current time).
  const rows = useMemo(() => {
    if (!hydrated || !validFields.length) return [];
    void nonce;
    return generateRows(validFields, qty);
  }, [hydrated, validFields, qty, nonce]);

  const output = useMemo(() => (format === "json" ? JSON.stringify(rows, null, 2) : rowsToCsv(rows)), [rows, format]);

  const update = (id: number, patch: Partial<MockField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: number) => setFields((fs) => fs.filter((f) => f.id !== id));
  const add = () => {
    setFields((fs) => [...fs, { id: nextId, name: "", type: "sentence" }]);
    setNextId((n) => n + 1);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="surface-gradient shadow-card lg:col-span-2 lg:self-start">
        <CardHeader
          title="Schema"
          description="One row per field. Names must be unique."
          actions={
            <Button size="sm" onClick={add}>
              <Plus className="h-3.5 w-3.5" /> Field
            </Button>
          }
        />
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.id} className="rounded-lg border bg-bg-elevated p-2">
              <div className="flex items-center gap-2">
                <Input mono value={f.name} onChange={(e) => update(f.id, { name: e.target.value })} placeholder="fieldName" className="h-8 flex-1 text-xs" aria-label="Field name" />
                <Select value={f.type} onChange={(e) => update(f.id, { type: e.target.value as MockFieldType })} className="w-40 [&>select]:h-8 [&>select]:text-xs" aria-label="Field type">
                  {FIELD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <Button size="icon" variant="ghost" onClick={() => remove(f.id)} aria-label="Remove field">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {f.type === "number" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input mono type="number" value={f.min ?? 0} onChange={(e) => update(f.id, { min: Number(e.target.value) })} className="h-8 text-xs" aria-label="Minimum" placeholder="min" />
                  <Input mono type="number" value={f.max ?? 1000} onChange={(e) => update(f.id, { max: Number(e.target.value) })} className="h-8 text-xs" aria-label="Maximum" placeholder="max" />
                </div>
              ) : null}
              {f.type === "date" ? (
                <div className="mt-2">
                  <Segmented
                    size="sm"
                    value={f.dateMode ?? "past"}
                    onChange={(v) => update(f.id, { dateMode: v })}
                    options={[
                      { value: "past", label: "Past" },
                      { value: "recent", label: "Recent" },
                      { value: "future", label: "Future" },
                    ]}
                  />
                </div>
              ) : null}
            </div>
          ))}
          {!fields.length ? <EmptyState title="No fields" description="Add a field to start generating." className="py-6" /> : null}
        </div>
        {duplicateNames.length ? (
          <Alert tone="warning" className="mt-3">
            Duplicate field names: {duplicateNames.join(", ")}. Later fields overwrite earlier ones.
          </Alert>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="md-qty" hint="1–1000">
              Rows
            </Label>
            <Input id="md-qty" mono type="number" min={1} max={1000} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Format</Label>
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: "json", label: "JSON" },
                { value: "csv", label: "CSV" },
              ]}
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-fg-subtle">Names, companies and addresses come from small built-in lists and are not real. Emails use reserved example domains.</p>
      </Card>

      <Card className="shadow-card lg:col-span-3">
        <CardHeader
          title="Output"
          description={rows.length ? `${rows.length} rows · ${validFields.length} fields` : undefined}
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => setNonce((n) => n + 1)} disabled={!validFields.length}>
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button size="sm" onClick={() => downloadBlob(new Blob([output], { type: format === "json" ? "application/json" : "text/csv" }), `mock-data.${format}`)} disabled={!rows.length}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <CopyButton value={rows.length ? output : ""} />
            </>
          }
        />
        {!validFields.length ? (
          <EmptyState title="Nothing to generate" description="Give at least one field a name." className="py-10" />
        ) : !hydrated ? (
          <div className="h-64 skeleton" />
        ) : (
          <>
            <pre className="max-h-[560px] overflow-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{output}</pre>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-subtle">
              <Badge>{new TextEncoder().encode(output).length.toLocaleString()} bytes</Badge>
              Generated with crypto.getRandomValues; regenerate for a fresh set.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
