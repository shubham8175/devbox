"use client";

import { useRef, useState } from "react";
import { Download, Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { KEY_TYPES, generateKeyPair, keyTypeInfo, type KeyPairOk, type KeyType } from "@/lib/tools/keypair";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

const GROUPS = ["RSA", "ECDSA", "EdDSA"] as const;

/** Builds a Blob from the in-memory string and triggers a download. Nothing is uploaded. */
function download(text: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/x-pem-file" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const PRE = "overflow-x-auto whitespace-pre rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed text-fg";

export function KeypairTool() {
  const [type, setType] = useState<KeyType>("ec-p256");
  const [result, setResult] = useState<KeyPairOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [jwkTab, setJwkTab] = useState<"public" | "private">("public");
  const requestRef = useRef(0);

  const info = keyTypeInfo(type);

  // Generation only ever runs from this click handler: never on render, never during SSR.
  const generate = async () => {
    const request = ++requestRef.current;
    setBusy(true);
    setError(null);
    setRevealed(false);
    try {
      const r = await generateKeyPair(type);
      if (request !== requestRef.current) return; // a newer request replaced this one
      if (r.ok) setResult(r);
      else {
        setResult(null);
        setError(r.error);
      }
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  };

  const fileStem = result ? result.type.replace(/-/g, "_") : "key";

  return (
    <div className="space-y-4">
      <Alert tone="warning">
        <strong>The private key is generated in your browser and shown once.</strong> It is never stored and never sent anywhere: copy or download it now, because it cannot be recovered after you leave or regenerate. Treat it like any other secret.
      </Alert>

      <Card className="surface-gradient shadow-card">
        <CardHeader title="Key type" description="RSA for the widest compatibility, ECDSA for small fast keys, Ed25519 for SSH." />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-56">
            <Label htmlFor="keypair-type">Algorithm</Label>
            <Select id="keypair-type" value={type} onChange={(e) => setType(e.target.value as KeyType)}>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {KEY_TYPES.filter((k) => k.group === g).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <Button variant="primary" onClick={generate} disabled={busy}>
            {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : result ? <RefreshCw className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            {busy ? "Generating…" : result ? "Generate again" : "Generate"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-fg-muted">{info.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {info.jwtAlg ? <Badge tone="accent">JWT {info.jwtAlg}</Badge> : null}
          <Badge>OpenSSH {info.sshType}</Badge>
          <Badge>PEM · JWK</Badge>
        </div>
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
      </Card>

      {!result ? (
        <EmptyState icon={KeyRound} title="No key pair yet" description="Pick a type and press Generate. Use the output for JWT signing (RS256, ES256, EdDSA), SSH logins or as the key behind a CSR." />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader
                title="Public key"
                description="SPKI, PEM-encoded. Safe to share."
                actions={
                  <>
                    <Button size="sm" onClick={() => download(result.publicPem, `${fileStem}_public.pem`)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                    <CopyButton value={result.publicPem} variant="primary" />
                  </>
                }
              />
              <pre className={PRE}>{result.publicPem}</pre>
            </Card>

            <Card className="shadow-card">
              <CardHeader
                title="Private key"
                description="PKCS#8, PEM-encoded. Keep it secret."
                actions={
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
                      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {revealed ? "Hide" : "Reveal"}
                    </Button>
                    <Button size="sm" onClick={() => download(result.privatePem, `${fileStem}_private.pem`)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                    <CopyButton value={result.privatePem} />
                  </>
                }
              />
              {revealed ? (
                <Textarea readOnly value={result.privatePem} className="min-h-[200px]" aria-label="Private key PEM" data-lpignore="true" data-1p-ignore="true" />
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed bg-bg-elevated p-4 text-center">
                  <p className="text-sm font-medium text-fg">Hidden</p>
                  <p className="mt-1 max-w-xs text-xs text-fg-muted">Copy and Download work while hidden. Reveal only when nobody is looking over your shoulder.</p>
                </div>
              )}
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader title="OpenSSH" description="Add the public line to ~/.ssh/authorized_keys on the server. The fingerprint matches ssh-keygen -l." />
            <div className="grid gap-2">
              <OutputRow label="Public key" value={result.openssh} />
              <OutputRow label="Fingerprint" value={result.fingerprint} />
            </div>
          </Card>

          <Card className="shadow-card">
            <CardHeader
              title="JWK"
              description={jwkTab === "public" ? "Publish this in a JWKS endpoint so verifiers can fetch it." : "The private JWK contains the secret parameters."}
              actions={
                <>
                  <Segmented
                    size="sm"
                    value={jwkTab}
                    onChange={setJwkTab}
                    options={[
                      { value: "public", label: "Public" },
                      { value: "private", label: "Private" },
                    ]}
                  />
                  <CopyButton value={jwkTab === "public" ? result.publicJwk : result.privateJwk} />
                </>
              }
            />
            {jwkTab === "public" || revealed ? (
              <pre className={PRE}>{jwkTab === "public" ? result.publicJwk : result.privateJwk}</pre>
            ) : (
              <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed bg-bg-elevated p-4 text-center">
                <p className="text-sm font-medium text-fg">Hidden</p>
                <p className="mt-1 text-xs text-fg-muted">Use Reveal on the private key card to show it here too.</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
