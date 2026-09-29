"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, PencilLine } from "lucide-react";
import { useDebounced } from "@/hooks/use-debounced";
import { decodeJwt } from "@/lib/tools/jwt";
import { decodeForEdit, defaultHeaderText, JWT_SIGN_ALGORITHMS, JWT_SIGN_SAMPLE, setHeaderAlgorithm, signJwt, verifyJwt, type JwtSignAlgorithm, type SignJwtResult, type VerifyJwtResult } from "@/lib/tools/jwt-sign";
import { formatLocal } from "@/lib/tools/time";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { CodeTextarea } from "@/components/ui/code-textarea";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Mode = "sign" | "verify";
const EXP_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86_400 },
  { label: "30d", seconds: 2_592_000 },
];

/** Masked secret field with a reveal toggle. Password managers are told to stay away; the value is never stored. */
function SecretInput({ id, value, onChange, show, onToggle, placeholder }: { id: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string }) {
  return (
    <div className="flex gap-2">
      <Input id={id} mono type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-lpignore="true" data-1p-ignore="true" />
      <Button size="icon" variant="ghost" onClick={onToggle} aria-label={show ? "Hide secret" : "Show secret"} title={show ? "Hide secret" : "Show secret"}>
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function TokenPre({ token }: { token: string }) {
  const [h, p, s] = token.split(".");
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">
      <span className="text-accent-strong">{h}</span>.<span className="text-success">{p}</span>.<span className="text-warning">{s}</span>
    </pre>
  );
}

export function JwtSignTool() {
  const [mode, setMode] = useState<Mode>("sign");
  const [algorithm, setAlgorithm] = useState<JwtSignAlgorithm>("HS256");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [headerText, setHeaderText] = useState(() => defaultHeaderText("HS256"));
  const [payloadText, setPayloadText] = useState("");
  const [addIat, setAddIat] = useState(true);
  const [addExp, setAddExp] = useState(true);
  const [expSeconds, setExpSeconds] = useState("3600");
  const [addJti, setAddJti] = useState(false);
  const [signedState, setSigned] = useState<SignJwtResult | null>(null);

  const [verifyToken, setVerifyToken] = useState("");
  const [verifySecret, setVerifySecret] = useState("");
  const [showVerifySecret, setShowVerifySecret] = useState(false);
  const [verifiedState, setVerified] = useState<VerifyJwtResult | null>(null);

  const dSecret = useDebounced(secret, 200);
  const dHeader = useDebounced(headerText, 200);
  const dPayload = useDebounced(payloadText, 200);
  const dVerifyToken = useDebounced(verifyToken, 200);
  const dVerifySecret = useDebounced(verifySecret, 200);

  const signInputEmpty = !dPayload.trim() && !dSecret;
  // Signing is async (Web Crypto); the cancelled flag drops results from stale inputs.
  useEffect(() => {
    if (signInputEmpty) return;
    let cancelled = false;
    const exp = Number(expSeconds);
    signJwt({
      header: dHeader,
      payload: dPayload,
      secret: dSecret,
      algorithm,
      claims: { iat: addIat, expInSeconds: addExp && Number.isFinite(exp) && exp > 0 ? exp : undefined, jti: addJti },
    }).then((r) => {
      if (!cancelled) setSigned(r);
    });
    return () => {
      cancelled = true;
    };
  }, [signInputEmpty, dHeader, dPayload, dSecret, algorithm, addIat, addExp, expSeconds, addJti]);

  useEffect(() => {
    if (!dVerifyToken.trim()) return;
    let cancelled = false;
    verifyJwt(dVerifyToken, dVerifySecret).then((r) => {
      if (!cancelled) setVerified(r);
    });
    return () => {
      cancelled = true;
    };
  }, [dVerifyToken, dVerifySecret]);

  const changeAlgorithm = (alg: JwtSignAlgorithm) => {
    setAlgorithm(alg);
    setHeaderText((h) => setHeaderAlgorithm(h, alg));
  };

  const editInBuilder = () => {
    const e = decodeForEdit(verifyToken);
    if (!e.ok) return;
    setHeaderText(e.header);
    setPayloadText(e.payload);
    if (e.algorithm) setAlgorithm(e.algorithm);
    setSecret(verifySecret);
    setAddIat(false);
    setAddExp(false);
    setAddJti(false);
    setMode("sign");
  };

  // Hide results once their inputs are cleared instead of resetting state inside the effects.
  const signed = signInputEmpty ? null : signedState;
  const verified = dVerifyToken.trim() ? verifiedState : null;
  const decodedVerify = verifyToken.trim() ? decodeJwt(verifyToken) : null;
  const expClaim = signed?.ok && typeof signed.payload.exp === "number" ? signed.payload.exp : null;
  const iatClaim = signed?.ok && typeof signed.payload.iat === "number" ? signed.payload.iat : null;

  return (
    <div className="space-y-4">
      <Alert tone="warning">
        Secrets typed here are never stored or sent anywhere; signing runs in this tab with Web Crypto. Only HMAC (HS256/384/512) tokens can be built from a shared secret. For RS256 or ES256 you need a private key: generate one with the{" "}
        <Link href="/tools/keypair" className="font-medium underline underline-offset-2">
          Key Pair Generator
        </Link>
        .
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {mode === "sign" ? (
          <>
            <InputPanel
              title="Build"
              description="Header and payload are JSON; standard claims are filled in for you."
              actions={
                <>
                  <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "sign", label: "Sign" }, { value: "verify", label: "Verify" }]} />
                  {!payloadText && !secret ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPayloadText(JWT_SIGN_SAMPLE.payload);
                        setSecret(JWT_SIGN_SAMPLE.secret);
                      }}
                    >
                      Load sample
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPayloadText("");
                        setSecret("");
                        setHeaderText(defaultHeaderText(algorithm));
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </>
              }
            >
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <div>
                  <Label htmlFor="jwt-alg">Algorithm</Label>
                  <Select id="jwt-alg" value={algorithm} onChange={(e) => changeAlgorithm(e.target.value as JwtSignAlgorithm)}>
                    {JWT_SIGN_ALGORITHMS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="jwt-secret">Secret</Label>
                  <SecretInput id="jwt-secret" value={secret} onChange={setSecret} show={showSecret} onToggle={() => setShowSecret((s) => !s)} placeholder="shared HMAC secret" />
                </div>
              </div>

              <div className="mt-3">
                <Label htmlFor="jwt-header" hint="alg follows the selector">
                  Header
                </Label>
                <CodeTextarea id="jwt-header" value={headerText} onChange={(e) => setHeaderText(e.target.value)} className="min-h-[88px]" counter={false} aria-label="JWT header JSON" />
              </div>
              <div className="mt-3">
                <Label htmlFor="jwt-payload">Payload</Label>
                <CodeTextarea id="jwt-payload" value={payloadText} onChange={(e) => setPayloadText(e.target.value)} placeholder='{ "sub": "user_42", "role": "admin" }' className="min-h-[160px]" invalid={signed ? !signed.ok : false} aria-label="JWT payload JSON" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" className="accent-accent" checked={addIat} onChange={(e) => setAddIat(e.target.checked)} />
                  Add iat
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" className="accent-accent" checked={addExp} onChange={(e) => setAddExp(e.target.checked)} />
                  Add exp
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" className="accent-accent" checked={addJti} onChange={(e) => setAddJti(e.target.checked)} />
                  Add jti
                </label>
              </div>
              {addExp ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input mono type="number" min={1} value={expSeconds} onChange={(e) => setExpSeconds(e.target.value)} className="w-32" aria-label="Expiry in seconds" invalid={!(Number(expSeconds) > 0)} />
                  <span className="text-xs text-fg-subtle">seconds</span>
                  {EXP_PRESETS.map((p) => (
                    <Button key={p.label} size="sm" variant={Number(expSeconds) === p.seconds ? "secondary" : "ghost"} onClick={() => setExpSeconds(String(p.seconds))}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {signed && !signed.ok ? (
                <Alert tone="danger" className="mt-3">
                  {signed.error}
                </Alert>
              ) : null}
            </InputPanel>

            <OutputPanel title="Token" description="Header · payload · signature" actions={<CopyButton value={signed?.ok ? signed.token : ""} variant="primary" />}>
              {signed?.ok ? (
                <div className="space-y-3">
                  <TokenPre token={signed.token} />
                  <OutputGrid>
                    <OutputRow label="Length" value={`${signed.token.length} chars`} copyable={false} />
                    <OutputRow label="Algorithm" value={signed.header.alg === undefined ? algorithm : String(signed.header.alg)} copyable={false} />
                    <OutputRow label="Issued at" value={iatClaim !== null ? formatLocal(new Date(iatClaim * 1000)) : ""} placeholder="not set" mono={false} copyable={false} />
                    <OutputRow label="Expires" value={expClaim !== null ? formatLocal(new Date(expClaim * 1000)) : ""} placeholder="never" mono={false} copyable={false} />
                  </OutputGrid>
                  <div>
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Signed payload</div>
                    <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{JSON.stringify(signed.payload, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <EmptyState title="Enter a payload and a secret" description="The token updates as you type. Load the sample to see a complete example." />
              )}
            </OutputPanel>
          </>
        ) : (
          <>
            <InputPanel
              title="Verify"
              description="Re-signs the token with your secret and compares the signatures."
              actions={
                <>
                  <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "sign", label: "Sign" }, { value: "verify", label: "Verify" }]} />
                  {verifyToken ? (
                    <Button size="sm" variant="ghost" onClick={() => setVerifyToken("")}>
                      Clear
                    </Button>
                  ) : null}
                </>
              }
            >
              <Label htmlFor="jwt-verify-token">Token</Label>
              <Textarea id="jwt-verify-token" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…" className="min-h-[120px] break-all" invalid={decodedVerify ? !decodedVerify.ok : false} data-lpignore="true" data-1p-ignore="true" />
              <div className="mt-3">
                <Label htmlFor="jwt-verify-secret">Secret</Label>
                <SecretInput id="jwt-verify-secret" value={verifySecret} onChange={setVerifySecret} show={showVerifySecret} onToggle={() => setShowVerifySecret((s) => !s)} placeholder="shared HMAC secret" />
              </div>
              {verified && !verified.ok ? (
                <Alert tone="danger" className="mt-3">
                  {verified.error}
                </Alert>
              ) : null}
            </InputPanel>

            <OutputPanel
              title="Result"
              actions={
                <>
                  {verified?.ok ? <Badge tone={verified.valid ? "success" : "danger"}>{verified.valid ? "Signature valid" : "Invalid signature"}</Badge> : null}
                  <Button size="sm" onClick={editInBuilder} disabled={!decodedVerify?.ok}>
                    <PencilLine className="h-3.5 w-3.5" /> Edit in builder
                  </Button>
                </>
              }
            >
              {decodedVerify?.ok ? (
                <div className="space-y-3">
                  {verified?.ok ? (
                    <p className="text-xs text-fg-muted">
                      {verified.valid ? `The ${verified.algorithm} signature matches this secret.` : `The ${verified.algorithm} signature does not match this secret, or the token was altered.`}
                    </p>
                  ) : (
                    <p className="text-xs text-fg-muted">Decoded without checking the signature. Enter the secret to verify it.</p>
                  )}
                  <OutputGrid>
                    <OutputRow label="Status" value={decodedVerify.status.message} mono={false} copyable={false} />
                    <OutputRow label="Algorithm" value={String(decodedVerify.header.alg ?? "")} copyable={false} />
                  </OutputGrid>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Claims</span>
                      <CopyButton value={decodedVerify.payloadRaw} />
                    </div>
                    <pre className="overflow-x-auto rounded-lg border bg-bg-elevated p-3 font-mono text-xs leading-relaxed">{decodedVerify.payloadRaw}</pre>
                  </div>
                </div>
              ) : (
                <EmptyState title="Paste a token to verify" description="You will see whether the secret matches, plus the decoded claims." />
              )}
            </OutputPanel>
          </>
        )}
      </div>
    </div>
  );
}
