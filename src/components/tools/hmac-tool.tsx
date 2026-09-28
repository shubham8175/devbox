"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { HMAC_ALGORITHMS, hmacAll, type HmacAlgorithm, type HmacOutput } from "@/lib/tools/hmac";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { OutputRow } from "@/components/output-row";

type Encoding = "hex" | "base64" | "base64url";

export function HmacTool() {
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [encoding, setEncoding] = useState<Encoding>("hex");
  const [casing, setCasing] = useState<"lower" | "upper">("lower");
  const [result, setResult] = useState<Record<HmacAlgorithm, HmacOutput> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live generation. The secret stays in component state only.
  useEffect(() => {
    let cancelled = false;
    if (!secret) return;
    Promise.resolve()
      .then(() => {
        if (!("crypto" in globalThis) || !crypto.subtle) throw new Error("Web Crypto is unavailable. HMAC requires a secure context (https or localhost).");
        return hmacAll(secret, message);
      })
      .then((r) => {
        if (!cancelled) {
          setResult(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "HMAC failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [secret, message]);

  // Results only apply while a secret is present; an empty secret shows the hint instead.
  const shown = secret ? result : null;
  const shownError = secret ? error : null;

  const clear = () => {
    setMessage("");
    setSecret("");
  };

  const value = (o: HmacOutput) => {
    const v = encoding === "hex" ? o.hex : encoding === "base64" ? o.base64 : o.base64url;
    return encoding === "hex" && casing === "upper" ? v.toUpperCase() : v;
  };

  return (
    <div className="space-y-4">
      <InputPanel
        title="Message & secret"
        description="Computed with crypto.subtle. The secret never leaves this page and is not stored anywhere."
        actions={
          <Button size="sm" variant="ghost" onClick={clear} disabled={!message && !secret}>
            Clear
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Label htmlFor="hmac-msg" hint={`${message.length.toLocaleString()} chars`}>
              Message
            </Label>
            <Textarea id="hmac-msg" value={message} onChange={(e) => setMessage(e.target.value)} placeholder='{"event":"order.paid","id":123}' className="min-h-[160px]" />
          </div>
          <div>
            <Label htmlFor="hmac-secret" hint={`${secret.length} chars`}>
              Secret
            </Label>
            <div className="flex gap-2">
              <Input
                id="hmac-secret"
                mono
                type={show ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="whsec_…"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
              />
              <Button size="md" variant="secondary" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide secret" : "Show secret"} title={show ? "Hide secret" : "Show secret"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">Signatures update as you type. Web Crypto requires a non-empty key.</p>
          </div>
        </div>
        {shownError ? (
          <Alert tone="danger" className="mt-3">
            {shownError}
          </Alert>
        ) : null}
      </InputPanel>

      <OutputPanel
        title="Signatures"
        actions={
          <>
            <Segmented
              size="sm"
              value={encoding}
              onChange={setEncoding}
              options={[
                { value: "hex", label: "Hex" },
                { value: "base64", label: "Base64" },
                { value: "base64url", label: "Base64url" },
              ]}
            />
            {encoding === "hex" ? (
              <Segmented
                size="sm"
                value={casing}
                onChange={setCasing}
                options={[
                  { value: "lower", label: "abc" },
                  { value: "upper", label: "ABC" },
                ]}
              />
            ) : null}
          </>
        }
      >
        {!secret ? <Alert tone="info" className="mb-3">Enter a secret to generate signatures.</Alert> : null}
        <div className="grid gap-2">
          {HMAC_ALGORITHMS.map((alg) => (
            <OutputRow key={alg} label={`HMAC-${alg}`} value={shown ? value(shown[alg]) : ""} hint={shown ? `${shown[alg].hex.length / 2} bytes` : undefined} />
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-subtle">Typical uses: webhook signatures (e.g. <span className="font-mono">X-Hub-Signature-256</span>), API request signing, and token integrity checks. Compare signatures with a constant-time comparison on the server.</p>
      </OutputPanel>
    </div>
  );
}
