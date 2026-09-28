"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { buildIntentUri, DEFAULT_INTENT, EXTRA_TYPES, type IntentExtra, type IntentFields } from "@/lib/tools/android-intent";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";

export function AndroidIntentTool() {
  const [f, setF] = useState<IntentFields>(DEFAULT_INTENT);
  const out = useMemo(() => buildIntentUri(f), [f]);
  const set = <K extends keyof IntentFields>(k: K, v: IntentFields[K]) => setF((x) => ({ ...x, [k]: v }));
  const setExtra = (i: number, p: Partial<IntentExtra>) => set("extras", f.extras.map((e, j) => (j === i ? { ...e, ...p } : e)));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader title="Intent" description="Chrome on Android opens intent:// links in the matching app." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ai-scheme" label="Scheme" value={f.scheme} onChange={(v) => set("scheme", v)} placeholder="myapp" />
            <Field id="ai-host" label="Host / path (data)" value={f.hostPath} onChange={(v) => set("hostPath", v)} placeholder="device/123" />
            <Field id="ai-pkg" label="Package" value={f.pkg} onChange={(v) => set("pkg", v)} placeholder="com.example.app" />
            <Field id="ai-fallback" label="Fallback URL" value={f.fallbackUrl} onChange={(v) => set("fallbackUrl", v)} placeholder="https://…" />
            <Field id="ai-action" label="Action" value={f.action} onChange={(v) => set("action", v)} placeholder="android.intent.action.VIEW" />
            <Field id="ai-cat" label="Category" value={f.category} onChange={(v) => set("category", v)} placeholder="android.intent.category.BROWSABLE" />
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">Extras</span>
              <Button size="sm" variant="ghost" onClick={() => set("extras", [...f.extras, { type: "S", key: "", value: "" }])}>
                <Plus className="h-3.5 w-3.5" /> Add extra
              </Button>
            </div>
            <div className="space-y-2">
              {f.extras.length === 0 ? <p className="text-xs text-fg-subtle">No extras.</p> : null}
              {f.extras.map((e, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Select value={e.type} onChange={(ev) => setExtra(i, { type: ev.target.value as IntentExtra["type"] })} className="min-w-0" aria-label="Extra type">
                    {EXTRA_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Input mono value={e.key} onChange={(ev) => setExtra(i, { key: ev.target.value })} placeholder="key" aria-label="Extra key" className="order-3 col-span-2 sm:order-none sm:col-span-1" />
                  <Input mono value={e.value} onChange={(ev) => setExtra(i, { value: ev.target.value })} placeholder="value" aria-label="Extra value" className="order-4 col-span-2 sm:order-none sm:col-span-1" />
                  <Button size="icon" variant="ghost" className="order-2 sm:order-none" onClick={() => set("extras", f.extras.filter((_, j) => j !== i))} aria-label="Remove extra">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Anatomy" description="What each segment of the URI means." />
          <ul className="space-y-1.5">
            {out.parts.map((p, i) => (
              <li key={i} className="rounded-lg border bg-bg-elevated px-3 py-2">
                <div className="break-all font-mono text-xs text-accent-strong">{p.part}</div>
                <div className="mt-0.5 text-xs text-fg-muted">{p.explanation}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <Card className="shadow-card">
          <CardHeader title="Intent URI" actions={<CopyButton value={out.uri} label="Copy" variant="primary" />} />
          <div className="break-all rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 font-mono text-xs">{out.uri}</div>
          {out.warnings.length ? (
            <Alert tone="warning" className="mt-3">
              {out.warnings.join(" ")}
            </Alert>
          ) : null}
          <p className="mt-3 text-[11px] text-fg-subtle">Nothing is launched from here. Paste the URI into an anchor’s href on a page viewed in Chrome for Android to test it.</p>
        </Card>
        <Card className="shadow-card">
          <CardHeader title="adb equivalent" actions={<CopyButton value={out.adb} />} />
          <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{out.adb}</pre>
        </Card>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} mono value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
