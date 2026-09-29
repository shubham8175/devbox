"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";
import { useDebounced } from "@/hooks/use-debounced";
import { decodeEntities, encodeEntities, ENTITY_CATEGORIES, HTML_ENTITIES_SAMPLE, searchEntities, type EncodeMode, type EntityCategory, type HtmlEntity } from "@/lib/tools/html-entities";
import { Card, CardHeader } from "@/components/ui/card";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Tab = "encode" | "decode" | "lookup";

const DECODE_SAMPLE = "&lt;p&gt;Caf&eacute; &amp; bar &mdash; &copy; 2024 &middot; &#8377;499 &#x2192; &check;&lt;/p&gt;";
const LOOKUP_LIMIT = 120;

export function HtmlEntitiesTool() {
  const [tab, setTab] = useState<Tab>("encode");

  return (
    <div className="space-y-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "encode", label: "Encode" },
          { value: "decode", label: "Decode" },
          { value: "lookup", label: "Lookup" },
        ]}
      />
      {tab === "lookup" ? <LookupPanel /> : <CodecPanel mode={tab} />}
    </div>
  );
}

function CodecPanel({ mode }: { mode: "encode" | "decode" }) {
  const [input, setInput] = useState("");
  const [encodeMode, setEncodeMode] = useState<EncodeMode>("named");
  const [onlyUnsafe, setOnlyUnsafe] = useState(true);
  const debounced = useDebounced(input, 100);
  const output = useMemo(() => {
    if (!debounced) return "";
    return mode === "encode" ? encodeEntities(debounced, { mode: encodeMode, onlyUnsafe }) : decodeEntities(debounced);
  }, [debounced, mode, encodeMode, onlyUnsafe]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InputPanel
        title={mode === "encode" ? "Text" : "HTML with entities"}
        description={mode === "encode" ? "Characters are replaced with &name; or numeric references." : "Named, decimal (&#160;) and hex (&#xA0;) references are decoded once, never twice."}
        actions={
          !input ? (
            <Button size="sm" variant="ghost" onClick={() => setInput(mode === "encode" ? HTML_ENTITIES_SAMPLE : DECODE_SAMPLE)}>
              Load sample
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setInput("")}>
              Clear
            </Button>
          )
        }
      >
        {mode === "encode" ? (
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <Label>Style</Label>
              <Segmented
                size="sm"
                value={encodeMode}
                onChange={setEncodeMode}
                options={[
                  { value: "named", label: "&copy;" },
                  { value: "numeric", label: "&#169;" },
                  { value: "hex", label: "&#xA9;" },
                ]}
              />
            </div>
            <label className="flex h-8 items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="accent-accent" checked={onlyUnsafe} onChange={(e) => setOnlyUnsafe(e.target.checked)} />
              Only &amp; &lt; &gt; &quot; &apos; (keep accents and symbols as-is)
            </label>
          </div>
        ) : null}
        <CodeTextarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "encode" ? "Tom & Jerry's <b>café</b>" : "Tom &amp; Jerry&apos;s &lt;b&gt;caf&eacute;&lt;/b&gt;"} className="min-h-[260px]" aria-label={mode === "encode" ? "Text to encode" : "Text to decode"} />
      </InputPanel>
      <OutputPanel title={mode === "encode" ? "Encoded" : "Decoded"} actions={<CopyButton value={output} variant="primary" />}>
        {output ? (
          <>
            <pre className="min-h-[260px] overflow-x-auto whitespace-pre-wrap break-words rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{output}</pre>
            <div className="mt-3 flex gap-1.5">
              <Badge>{output.length.toLocaleString()} chars</Badge>
              {output.length !== debounced.length ? <Badge tone="accent">{output.length > debounced.length ? "+" : ""}{(output.length - debounced.length).toLocaleString()}</Badge> : null}
            </div>
          </>
        ) : (
          <EmptyState title={mode === "encode" ? "Nothing to encode yet" : "Nothing to decode yet"} description="The result appears here as you type." />
        )}
      </OutputPanel>
    </div>
  );
}

function LookupPanel() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EntityCategory | null>(null);
  const debounced = useDebounced(query, 80);
  const results = useMemo(() => searchEntities(debounced, category ?? undefined), [debounced, category]);
  const shown = results.slice(0, LOOKUP_LIMIT);

  return (
    <Card>
      <CardHeader title="Entity lookup" description="Search by name, character, code point or meaning. Click a card to copy its reference." />
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="copy · © · 169 · U+00A9 · arrow" className="h-11 text-base" aria-label="Search entities" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip active={category === null} onClick={() => setCategory(null)}>
          All
        </Chip>
        {ENTITY_CATEGORIES.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {shown.length ? (
        <div className="mt-4 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((e) => (
            <EntityCard key={`${e.name ?? "n"}-${e.code}`} entity={e} />
          ))}
        </div>
      ) : (
        <EmptyState title="No entity matches" description="Try a name like mdash, a character, or a code like 8212." className="mt-4" />
      )}
      {results.length > shown.length ? <p className="mt-3 text-xs text-fg-subtle">Showing {shown.length} of {results.length}. Refine the search to see more.</p> : null}
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer", active ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg")}
    >
      {children}
    </button>
  );
}

function EntityCard({ entity }: { entity: HtmlEntity }) {
  const { copied, copy } = useCopy();
  const { toast } = useToast();
  const named = entity.name ? `&${entity.name};` : null;
  const dec = `&#${entity.code};`;
  const hex = `&#x${entity.code.toString(16).toUpperCase()};`;
  const primary = named ?? dec;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copy(primary)) toast(`Copied ${primary}`);
      }}
      title={`Copy ${primary}`}
      className="group flex flex-col items-start gap-1 rounded-lg border bg-bg-elevated p-3 text-left transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-lg cursor-pointer"
    >
      <div className="flex w-full items-center justify-between">
        <span className="text-2xl leading-none text-fg">{entity.category === "space" ? <span className="rounded bg-surface-hover px-2 text-xs text-fg-subtle">␣</span> : entity.char}</span>
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : null}
      </div>
      <div className="font-mono text-xs text-accent-strong">{primary}</div>
      <div className="font-mono text-[11px] text-fg-subtle">
        {named ? `${dec} · ` : ""}
        {hex}
      </div>
      <div className="text-[11px] text-fg-muted">{entity.description}</div>
    </button>
  );
}
