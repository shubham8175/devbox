"use client";

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Field {
  key: number;
  value: string;
}

/** Stable React keys for fields, so removing one doesn't shift focus or state onto its neighbour. */
let nextKey = 0;
const makeFields = (values: string[]): Field[] => values.map((value) => ({ key: nextKey++, value }));

export interface ValueListState {
  fields: Field[];
  /** Raw field values in order, including empty ones (so index + 1 is the field number). */
  values: string[];
  hasInput: boolean;
  min: number;
  max: number;
  /** Replace every field, padding up to `min`. Pass [] to clear. */
  reset: (values: string[]) => void;
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  focusKeyRef: React.RefObject<number | null>;
}

/**
 * State for a list of separate input boxes ("#1", "#2", … + Add more).
 * Kept outside <ValueList> so the owning tool can read `values` to compute results.
 */
export function useValueList({ min = 2, max = 50, initial }: { min?: number; max?: number; initial?: string[] } = {}): ValueListState {
  const pad = (vals: string[]) => (vals.length >= min ? vals : [...vals, ...Array(min - vals.length).fill("")]);
  const [fields, setFields] = useState<Field[]>(() => makeFields(pad(initial ?? [])));
  const focusKeyRef = useRef<number | null>(null);
  // Memoised on `fields` so tools can use `values` as a stable useMemo dependency.
  const values = useMemo(() => fields.map((f) => f.value), [fields]);
  return {
    fields,
    values,
    hasInput: values.some((v) => v.trim()),
    min,
    max,
    reset: (vals) => setFields(makeFields(pad(vals.slice(0, max)))),
    setFields,
    focusKeyRef,
  };
}

export interface ValueStatus {
  tone: "ok" | "error";
  content: ReactNode;
}

interface ValueListProps {
  list: ValueListState;
  id: string;
  placeholder?: string;
  /** Short line shown under a non-empty field: a decoded value, or why it's invalid. */
  status?: (value: string, index: number) => ValueStatus | null;
  /** Splits text pasted into one field into several values, which then fill separate fields. */
  splitPaste?: (raw: string) => string[];
  /** Noun for aria labels and the limit hint, e.g. "token". */
  itemLabel?: string;
  mono?: boolean;
  className?: string;
}

/** Separate numbered input boxes with remove buttons, "Add more", Enter-to-add and paste-to-split. */
export function ValueList({ list, id, placeholder, status, splitPaste, itemLabel = "value", mono = true, className }: ValueListProps) {
  const { fields, setFields, focusKeyRef, min, max } = list;
  const full = fields.length >= max;

  const update = (key: number, value: string) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, value } : f)));
  const remove = (key: number) =>
    setFields((fs) => {
      const next = fs.filter((f) => f.key !== key);
      return next.length >= min ? next : [...next, ...makeFields(Array(min - next.length).fill(""))];
    });
  const add = (after?: number) => {
    if (full) return;
    const [field] = makeFields([""]);
    focusKeyRef.current = field.key;
    setFields((fs) => {
      const i = after === undefined ? fs.length : fs.findIndex((f) => f.key === after) + 1;
      return [...fs.slice(0, i), field, ...fs.slice(i)];
    });
  };

  const onPaste = (key: number, e: ClipboardEvent<HTMLInputElement>) => {
    if (!splitPaste) return;
    const pasted = splitPaste(e.clipboardData.getData("text"));
    if (pasted.length < 2) return;
    e.preventDefault();
    setFields((fs) => {
      const i = fs.findIndex((f) => f.key === key);
      const current = fs[i].value.trim() ? [fs[i]] : [];
      // Drop empty boxes after the paste point so the pasted values aren't followed by stray blanks.
      const rest = fs.slice(i + 1).filter((f) => f.value.trim());
      return [...fs.slice(0, i), ...current, ...makeFields(pasted), ...rest].slice(0, max);
    });
  };

  const onKeyDown = (key: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(key);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-2">
        {fields.map((f, i) => {
          const s = f.value.trim() && status ? status(f.value.trim(), i) : null;
          return (
            <div key={f.key} className="flex items-start gap-2">
              <span className="mt-2 w-6 shrink-0 text-right text-xs text-fg-subtle">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Input
                  id={`${id}-${i + 1}`}
                  aria-label={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} ${i + 1}`}
                  mono={mono}
                  value={f.value}
                  onChange={(e) => update(f.key, e.target.value)}
                  onPaste={(e) => onPaste(f.key, e)}
                  onKeyDown={(e) => onKeyDown(f.key, e)}
                  ref={(el) => {
                    if (el && focusKeyRef.current === f.key) {
                      focusKeyRef.current = null;
                      el.focus();
                    }
                  }}
                  placeholder={placeholder}
                  invalid={s?.tone === "error"}
                />
                {s ? <div className={cn("mt-1 break-all text-[11px]", s.tone === "error" ? "text-danger" : "text-fg-subtle")}>{s.content}</div> : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="mt-0.5 shrink-0"
                onClick={() => remove(f.key)}
                disabled={fields.length <= min && !f.value}
                aria-label={`Remove ${itemLabel} ${i + 1}`}
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
        <Button size="sm" onClick={() => add()} disabled={full}>
          <Plus className="h-3.5 w-3.5" /> Add more
        </Button>
        <span className="text-[11px] text-fg-subtle">
          {full ? `Up to ${max} ${itemLabel}s.` : `Enter adds a field below${splitPaste ? "; pasting a list fills separate fields" : ""}.`}
        </span>
      </div>
    </div>
  );
}
