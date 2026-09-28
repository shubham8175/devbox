"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { buildCharset, entropyBits, generatePassword, type PasswordOptions } from "@/lib/tools/password";
import { useHydrated } from "@/hooks/use-hydrated";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

const DEFAULTS: PasswordOptions = { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true, excludeAmbiguous: false };

export function PasswordTool() {
  const hydrated = useHydrated();
  const [opts, setOpts] = useState<PasswordOptions>(DEFAULTS);
  const [nonce, setNonce] = useState(0);
  const [count, setCount] = useState(1);
  const [show, setShow] = useState(true);
  const set = <K extends keyof PasswordOptions>(k: K, v: PasswordOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const charset = useMemo(() => buildCharset(opts), [opts]);
  const passwords = useMemo(() => {
    if (!hydrated || !charset) return [];
    void nonce;
    return Array.from({ length: count }, () => generatePassword(opts));
  }, [hydrated, charset, opts, count, nonce]);
  const bits = entropyBits(Math.max(4, Math.min(128, opts.length)), charset.length);
  const strengthTone = bits >= 100 ? "success" : bits >= 64 ? "accent" : bits >= 40 ? "warning" : "danger";

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InputPanel title="Options" className="lg:col-span-2 lg:self-start">
        <Label htmlFor="pw-len" hint={`${opts.length} characters`}>
          Length
        </Label>
        <input id="pw-len" type="range" min={8} max={64} value={opts.length} onChange={(e) => set("length", Number(e.target.value))} className="w-full accent-accent" />
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {(
            [
              ["uppercase", "Uppercase A–Z"],
              ["lowercase", "Lowercase a–z"],
              ["numbers", "Numbers 0–9"],
              ["symbols", "Symbols !@#$"],
            ] as Array<[keyof PasswordOptions, string]>
          ).map(([k, label]) => (
            <label key={k} className={cn("flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors", opts[k] ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted")}>
              <input type="checkbox" checked={!!opts[k]} onChange={(e) => set(k, e.target.checked as PasswordOptions[typeof k])} className="accent-accent" />
              {label}
            </label>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" checked={opts.excludeAmbiguous} onChange={(e) => set("excludeAmbiguous", e.target.checked)} className="accent-accent" />
          Exclude ambiguous characters (I l 1 O 0 | etc.)
        </label>
        <div className="mt-3">
          <Label htmlFor="pw-count" hint={`${count}`}>
            How many
          </Label>
          <input id="pw-count" type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-accent" />
        </div>
        {!charset ? (
          <Alert tone="danger" className="mt-3">
            Select at least one character set.
          </Alert>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone={strengthTone}>≈ {bits} bits of entropy</Badge>
            <Badge>{charset.length} possible characters</Badge>
          </div>
        )}
        <p className="mt-3 text-[11px] text-fg-subtle">Generated with crypto.getRandomValues using unbiased sampling. Nothing is stored; refreshing the page discards everything.</p>
      </InputPanel>

      <OutputPanel
        title="Passwords"
        className="lg:col-span-3"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide passwords" : "Show passwords"}>
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setNonce((n) => n + 1)} disabled={!charset}>
              <RefreshCw className="h-3.5 w-3.5" /> Generate
            </Button>
          </>
        }
      >
        {passwords.length ? (
          <ul className="space-y-1.5">
            {passwords.map((p, i) => (
              <li key={`${i}-${nonce}`} className="flex items-center gap-2 rounded-lg border bg-bg-elevated px-3 py-2">
                <span className="min-w-0 flex-1 break-all font-mono text-sm tracking-wide">{show ? p : "•".repeat(Math.min(p.length, 32))}</span>
                <CopyButton value={p} iconOnly toastMessage="Password copied" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-subtle">{charset ? "Generating…" : "Choose at least one character set."}</p>
        )}
        {passwords.length > 1 ? (
          <div className="mt-3 flex justify-end">
            <CopyButton value={passwords.join("\n")} label="Copy all" />
          </div>
        ) : null}
      </OutputPanel>
    </div>
  );
}
