"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  BCRYPT_DEFAULT_COST,
  BCRYPT_MAX_COST,
  BCRYPT_MIN_COST,
  BCRYPT_SLOW_COST,
  bcryptHash,
  bcryptTruncationWarning,
  bcryptVerify,
  detectHashKind,
  inspectBcryptHash,
  parsePbkdf2Phc,
  PASSWORD_HASH_SAMPLE,
  PBKDF2_DEFAULT_ITERATIONS,
  PBKDF2_HASHES,
  PBKDF2_MAX_ITERATIONS,
  pbkdf2Hash,
  pbkdf2Verify,
  type BcryptHashResult,
  type BcryptModule,
  type BcryptVerifyResult,
  type Pbkdf2Hash,
  type Pbkdf2HashResult,
  type Pbkdf2VerifyResult,
} from "@/lib/tools/password-hash";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

type Mode = "hash" | "verify";
type Algo = "bcrypt" | "pbkdf2";
type HashOutcome = { kind: "bcrypt"; r: BcryptHashResult } | { kind: "pbkdf2"; r: Pbkdf2HashResult };
type VerifyOutcome = { kind: "bcrypt"; r: BcryptVerifyResult } | { kind: "pbkdf2"; r: Pbkdf2VerifyResult } | { kind: "unknown"; error: string };

/** Masked password field with a reveal toggle. Password managers are told to ignore it; nothing is stored. */
function PasswordInput({ id, value, onChange, show, onToggle, onEnter }: { id: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; onEnter?: () => void }) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        mono
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        placeholder="password"
        data-lpignore="true"
        data-1p-ignore="true"
      />
      <Button size="icon" variant="ghost" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function PasswordHashTool() {
  const [mode, setMode] = useState<Mode>("hash");
  const [algo, setAlgo] = useState<Algo>("bcrypt");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cost, setCost] = useState(String(BCRYPT_DEFAULT_COST));
  const [iterations, setIterations] = useState(String(PBKDF2_DEFAULT_ITERATIONS));
  const [pbkdfHash, setPbkdfHash] = useState<Pbkdf2Hash>("SHA-256");
  const [verifyHash, setVerifyHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [hashed, setHashed] = useState<HashOutcome | null>(null);
  const [verified, setVerified] = useState<VerifyOutcome | null>(null);
  const [bcrypt, setBcrypt] = useState<BcryptModule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-load bcryptjs only on this route.
  useEffect(() => {
    let cancelled = false;
    import("bcryptjs")
      .then((m) => {
        if (!cancelled) setBcrypt({ hash: (s, rounds) => m.hash(s, rounds), compare: (s, h) => m.compare(s, h), getRounds: (h) => m.getRounds(h) });
      })
      .catch(() => {
        if (!cancelled) setLoadError("The bcrypt library failed to load. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const costNum = Number(cost);
  const iterNum = Number(iterations);
  const costValid = Number.isInteger(costNum) && costNum >= BCRYPT_MIN_COST && costNum <= BCRYPT_MAX_COST;
  const iterValid = Number.isInteger(iterNum) && iterNum >= 1 && iterNum <= PBKDF2_MAX_ITERATIONS;
  const truncates = bcryptTruncationWarning(password);
  const verifyKind = verifyHash.trim() ? detectHashKind(verifyHash) : null;
  const needsBcrypt = mode === "hash" ? algo === "bcrypt" : verifyKind === "bcrypt";
  const canRun = !busy && !!password && (mode === "hash" ? (algo === "bcrypt" ? costValid && !!bcrypt : iterValid) : !!verifyHash.trim() && (verifyKind !== "bcrypt" || !!bcrypt));

  const runHash = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      if (algo === "bcrypt" && bcrypt) setHashed({ kind: "bcrypt", r: await bcryptHash(bcrypt, password, costNum) });
      else if (algo === "pbkdf2") setHashed({ kind: "pbkdf2", r: await pbkdf2Hash({ password, iterations: iterNum, hash: pbkdfHash }) });
    } finally {
      setBusy(false);
    }
  };

  const runVerify = async () => {
    if (!canRun) return;
    setBusy(true);
    try {
      if (verifyKind === "bcrypt" && bcrypt) setVerified({ kind: "bcrypt", r: await bcryptVerify(bcrypt, password, verifyHash) });
      else if (verifyKind === "pbkdf2") setVerified({ kind: "pbkdf2", r: await pbkdf2Verify(password, verifyHash) });
      else setVerified({ kind: "unknown", error: "Unrecognised hash. Paste a bcrypt string ($2a$/$2b$/$2y$…) or a PBKDF2 PHC string ($pbkdf2-sha256$i=…)." });
    } finally {
      setBusy(false);
    }
  };

  const run = mode === "hash" ? runHash : runVerify;
  const bcryptParts = verifyKind === "bcrypt" ? inspectBcryptHash(verifyHash) : null;
  const pbkdf2Parts = verifyKind === "pbkdf2" ? parsePbkdf2Phc(verifyHash) : null;

  return (
    <div className="space-y-4">
      <Alert tone="warning">
        Passwords never leave this page: bcrypt runs in JavaScript and PBKDF2 uses Web Crypto, both in this tab, and nothing is stored. bcrypt only uses the first 72 bytes of a password; longer input is silently truncated.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <InputPanel
          title={mode === "hash" ? "Hash a password" : "Verify a password"}
          description={mode === "hash" ? "Pick an algorithm and work factor, then hash." : "The format is detected from the hash you paste."}
          actions={
            <>
              <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "hash", label: "Hash" }, { value: "verify", label: "Verify" }]} />
              {!password ? (
                <Button size="sm" variant="ghost" onClick={() => setPassword(PASSWORD_HASH_SAMPLE.password)}>
                  Load sample
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPassword("");
                    setVerifyHash("");
                    setHashed(null);
                    setVerified(null);
                  }}
                >
                  Clear
                </Button>
              )}
            </>
          }
        >
          <Label htmlFor="ph-password">Password</Label>
          <PasswordInput id="ph-password" value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((s) => !s)} onEnter={run} />
          {truncates && (mode === "verify" ? verifyKind === "bcrypt" : algo === "bcrypt") ? (
            <Alert tone="warning" className="mt-2">
              This password is longer than 72 bytes; bcrypt ignores everything after byte 72.
            </Alert>
          ) : null}

          {mode === "hash" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ph-algo">Algorithm</Label>
                <Select id="ph-algo" value={algo} onChange={(e) => setAlgo(e.target.value as Algo)}>
                  <option value="bcrypt">bcrypt</option>
                  <option value="pbkdf2">PBKDF2</option>
                </Select>
              </div>
              {algo === "bcrypt" ? (
                <div>
                  <Label htmlFor="ph-cost" hint={`${BCRYPT_MIN_COST}–${BCRYPT_MAX_COST}`}>
                    Cost (rounds = 2^cost)
                  </Label>
                  <Input id="ph-cost" mono type="number" min={BCRYPT_MIN_COST} max={BCRYPT_MAX_COST} value={cost} onChange={(e) => setCost(e.target.value)} invalid={!costValid} />
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="ph-iter" hint={`max ${PBKDF2_MAX_ITERATIONS.toLocaleString()}`}>
                      Iterations
                    </Label>
                    <Input id="ph-iter" mono type="number" min={1} max={PBKDF2_MAX_ITERATIONS} value={iterations} onChange={(e) => setIterations(e.target.value)} invalid={!iterValid} />
                  </div>
                  <div>
                    <Label htmlFor="ph-hash">Hash</Label>
                    <Select id="ph-hash" value={pbkdfHash} onChange={(e) => setPbkdfHash(e.target.value as Pbkdf2Hash)}>
                      {PBKDF2_HASHES.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <Label htmlFor="ph-verify-hash" hint={verifyKind ? (verifyKind === "bcrypt" ? "bcrypt detected" : "PBKDF2 detected") : undefined}>
                Hash
              </Label>
              <Textarea id="ph-verify-hash" value={verifyHash} onChange={(e) => setVerifyHash(e.target.value)} placeholder="$2b$10$… or $pbkdf2-sha256$i=600000$…" className="min-h-[88px] break-all" invalid={!!verifyHash.trim() && !verifyKind} data-lpignore="true" data-1p-ignore="true" />
            </div>
          )}

          {mode === "hash" && algo === "bcrypt" && costValid && costNum > BCRYPT_SLOW_COST ? (
            <Alert tone="info" className="mt-3">
              Cost {costNum} means {(2 ** costNum).toLocaleString()} rounds; in the browser that takes several seconds per hash.
            </Alert>
          ) : null}
          {loadError && needsBcrypt ? (
            <Alert tone="danger" className="mt-3">
              {loadError}
            </Alert>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={run} disabled={!canRun}>
              {busy ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {mode === "hash" ? "Hashing…" : "Checking…"}
                </>
              ) : mode === "hash" ? (
                "Hash"
              ) : (
                "Verify"
              )}
            </Button>
            {needsBcrypt && !bcrypt && !loadError ? <span className="text-xs text-fg-subtle">Loading bcrypt…</span> : null}
          </div>
        </InputPanel>

        {mode === "hash" ? (
          <OutputPanel title="Hash" actions={<CopyButton value={hashed?.r.ok ? (hashed.kind === "bcrypt" ? hashed.r.hash : hashed.r.phc) : ""} variant="primary" />}>
            {!hashed ? (
              <EmptyState title="No hash yet" description="Enter a password and press Hash. Every run uses a fresh random salt." />
            ) : !hashed.r.ok ? (
              <Alert tone="danger">{hashed.r.error}</Alert>
            ) : hashed.kind === "bcrypt" ? (
              <div className="space-y-2">
                <OutputRow label="bcrypt hash" value={hashed.r.hash} />
                <OutputGrid>
                  <OutputRow label="Version" value={`$${hashed.r.version}$`} copyable={false} />
                  <OutputRow label="Cost" value={`${hashed.r.cost} (${(2 ** hashed.r.cost).toLocaleString()} rounds)`} copyable={false} />
                  <OutputRow label="Salt (22 chars)" value={hashed.r.salt} />
                  <OutputRow label="Hash (31 chars)" value={hashed.r.hashPart} />
                </OutputGrid>
              </div>
            ) : (
              <div className="space-y-2">
                <OutputRow label="PHC string" value={hashed.r.phc} hint="Portable format: algorithm, iterations, salt and hash in one string" />
                <OutputGrid>
                  <OutputRow label="Hash (hex)" value={hashed.r.hex} />
                  <OutputRow label="Hash (Base64)" value={hashed.r.base64} />
                  <OutputRow label="Salt (hex)" value={hashed.r.saltHex} />
                  <OutputRow label="Salt (Base64)" value={hashed.r.saltBase64} />
                  <OutputRow label="Parameters" value={`${hashed.r.hash} · ${hashed.r.iterations.toLocaleString()} iterations · ${hashed.r.keyLength * 8}-bit key`} copyable={false} />
                </OutputGrid>
              </div>
            )}
          </OutputPanel>
        ) : (
          <OutputPanel
            title="Result"
            actions={verified && verified.kind !== "unknown" && verified.r.ok ? <Badge tone={verified.r.match ? "success" : "danger"}>{verified.r.match ? "Password matches" : "No match"}</Badge> : null}
          >
            {verified?.kind === "unknown" ? (
              <Alert tone="danger">{verified.error}</Alert>
            ) : verified && !verified.r.ok ? (
              <Alert tone="danger">{verified.r.error}</Alert>
            ) : verified?.r.ok ? (
              <p className="text-xs text-fg-muted">{verified.r.match ? "The password produces the same hash with the embedded salt and parameters." : "The password does not produce this hash. Check for typos, trailing spaces or a different encoding."}</p>
            ) : (
              <EmptyState title="Paste a hash and a password" description="Press Verify to compare them. Nothing is sent anywhere." />
            )}
            {bcryptParts?.ok ? (
              <OutputGrid className="mt-3">
                <OutputRow label="Version" value={`$${bcryptParts.version}$`} copyable={false} />
                <OutputRow label="Cost" value={`${bcryptParts.cost} (${(2 ** bcryptParts.cost).toLocaleString()} rounds)`} copyable={false} />
                <OutputRow label="Salt" value={bcryptParts.salt} />
                <OutputRow label="Hash" value={bcryptParts.hashPart} />
              </OutputGrid>
            ) : bcryptParts ? (
              <Alert tone="danger" className="mt-3">
                {bcryptParts.error}
              </Alert>
            ) : null}
            {pbkdf2Parts?.ok ? (
              <OutputGrid className="mt-3">
                <OutputRow label="Hash function" value={pbkdf2Parts.hash} copyable={false} />
                <OutputRow label="Iterations" value={pbkdf2Parts.iterations.toLocaleString()} copyable={false} />
                <OutputRow label="Salt" value={`${pbkdf2Parts.salt.length} bytes`} copyable={false} />
                <OutputRow label="Key length" value={`${pbkdf2Parts.key.length} bytes`} copyable={false} />
              </OutputGrid>
            ) : pbkdf2Parts ? (
              <Alert tone="danger" className="mt-3">
                {pbkdf2Parts.error}
              </Alert>
            ) : null}
          </OutputPanel>
        )}
      </div>
    </div>
  );
}
