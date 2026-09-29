"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Dices } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { base32Decode, buildOtpauthUri, generateHotp, generateTotp, OTP_ALGORITHMS, OTP_DIGITS, parseOtpauthUri, randomBase32Secret, TOTP_SAMPLE, type OtpAlgorithm, type OtpConfig, type OtpDigits } from "@/lib/tools/totp";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Resolved = { ok: true; config: OtpConfig; fromUri: boolean } | { ok: false; error: string };
type Codes = { key: string; current: string; next: string };

const PERIODS = [15, 30, 60, 90, 120];

function codeKey(secret: string, alg: OtpAlgorithm, digits: OtpDigits, period: number, type: OtpConfig["type"], counter: number): string {
  return `${secret}|${alg}|${digits}|${period}|${type}|${counter}`;
}

function groupCode(code: string): string {
  const mid = Math.ceil(code.length / 2);
  return `${code.slice(0, mid)} ${code.slice(mid)}`;
}

export function TotpTool() {
  const [input, setInput] = useState("");
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>("SHA1");
  const [digits, setDigits] = useState<OtpDigits>(6);
  const [period, setPeriod] = useState(30);
  const [issuer, setIssuer] = useState("");
  const [account, setAccount] = useState("");
  const [codes, setCodes] = useState<Codes | null>(null);
  const [qr, setQr] = useState<{ uri: string; url: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  // Null during SSR/hydration so the countdown never mismatches server markup.
  const now = useNow(1000);

  const isUri = /^\s*otpauth:\/\//i.test(input);

  const resolved = useMemo<Resolved | null>(() => {
    const text = input.trim();
    if (!text) return null;
    if (isUri) {
      const r = parseOtpauthUri(text);
      return r.ok ? { ok: true, config: r.config, fromUri: true } : r;
    }
    const d = base32Decode(text);
    if (!d.ok) return d;
    const secret = text.toUpperCase().replace(/[\s-=]/g, "");
    return { ok: true, fromUri: false, config: { type: "totp", label: account, issuer, account, secret, algorithm, digits, period, counter: 0 } };
  }, [input, isUri, account, issuer, algorithm, digits, period]);

  const config = resolved?.ok ? resolved.config : null;
  const nowSec = now ? Math.floor(now.getTime() / 1000) : null;
  const counter = config && nowSec !== null ? (config.type === "hotp" ? config.counter : Math.floor(nowSec / config.period)) : null;
  const remaining = config && nowSec !== null && config.type === "totp" ? config.period - (nowSec % config.period) : null;

  // Recompute only when the time step (counter) or the key material changes, not every tick.
  const secret = config?.secret ?? "";
  const cfgAlg = config?.algorithm ?? "SHA1";
  const cfgDigits = config?.digits ?? 6;
  const cfgPeriod = config?.period ?? 30;
  const cfgType = config?.type ?? "totp";
  useEffect(() => {
    if (!secret || counter === null) return;
    let cancelled = false;
    const key = codeKey(secret, cfgAlg, cfgDigits, cfgPeriod, cfgType, counter);
    const run = async (): Promise<Codes | null> => {
      if (cfgType === "hotp") {
        const bytes = base32Decode(secret);
        if (!bytes.ok) return null;
        const [current, next] = await Promise.all([generateHotp(bytes.bytes, counter, cfgAlg, cfgDigits), generateHotp(bytes.bytes, counter + 1, cfgAlg, cfgDigits)]);
        return { key, current, next };
      }
      const at = (c: number) => generateTotp({ secret, algorithm: cfgAlg, digits: cfgDigits, period: cfgPeriod, timestampMs: c * cfgPeriod * 1000 });
      const [a, b] = await Promise.all([at(counter), at(counter + 1)]);
      return a.ok && b.ok ? { key, current: a.code, next: b.code } : null;
    };
    run()
      .then((r) => {
        if (!cancelled) setCodes(r);
      })
      .catch(() => {
        if (!cancelled) setCodes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [secret, cfgAlg, cfgDigits, cfgPeriod, cfgType, counter]);

  const uri = useMemo(() => (config ? buildOtpauthUri({ ...config, issuer: config.issuer, account: config.account || "user" }) : ""), [config]);

  // QR rendered locally with the qrcode library; the URI (and secret) never leave the page.
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    QRCode.toDataURL(uri, { width: 208, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) {
          setQr({ uri, url });
          setQrError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setQrError(e instanceof Error ? e.message : "Could not render the QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const loadSample = () => {
    setInput(TOTP_SAMPLE.secret);
    setIssuer(TOTP_SAMPLE.issuer);
    setAccount(TOTP_SAMPLE.account);
  };
  const clear = () => {
    setInput("");
    setIssuer("");
    setAccount("");
  };

  const progress = remaining !== null && config ? (remaining / config.period) * 100 : 0;
  // Only show codes computed for the current settings, never a stale value from the previous secret.
  const showCode = codes && counter !== null && codes.key === codeKey(secret, cfgAlg, cfgDigits, cfgPeriod, cfgType, counter) ? codes : null;
  const qrUrl = qr && qr.uri === uri ? qr.url : "";

  return (
    <div className="space-y-4">
      <Alert tone="warning">
        Secrets stay in this tab and are never stored or sent anywhere. Use this to test 2FA flows and enrolment QR codes; anyone with the secret can generate your codes, so do not paste the secret of a real account you care about.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="surface-gradient shadow-card">
            <CardHeader
              title="Secret"
              description="A Base32 secret, or a full otpauth:// URI from an enrolment QR code."
              actions={
                !input ? (
                  <Button size="sm" variant="ghost" onClick={loadSample}>
                    Load sample
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={clear}>
                    Clear
                  </Button>
                )
              }
            />
            <div className="flex gap-2">
              <Input mono value={input} onChange={(e) => setInput(e.target.value)} placeholder="JBSWY3DPEHPK3PXP  or  otpauth://totp/Issuer:account?secret=…" invalid={resolved ? !resolved.ok : false} aria-label="Secret or otpauth URI" data-lpignore="true" data-1p-ignore="true" />
              <Button onClick={() => setInput(randomBase32Secret(20))} title="Generate a random 160-bit secret" className="shrink-0">
                <Dices className="h-3.5 w-3.5" /> Random
              </Button>
            </div>
            {resolved && !resolved.ok ? (
              <Alert tone="danger" className="mt-3">
                {resolved.error}
              </Alert>
            ) : null}
            {resolved?.ok && resolved.fromUri ? (
              <p className="mt-2 text-xs text-fg-subtle">
                Settings below were read from the URI. <Badge tone="accent">{resolved.config.type.toUpperCase()}</Badge>
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="totp-alg">Algorithm</Label>
                <Select id="totp-alg" value={config?.algorithm ?? algorithm} onChange={(e) => setAlgorithm(e.target.value as OtpAlgorithm)} disabled={isUri}>
                  {OTP_ALGORITHMS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="totp-digits">Digits</Label>
                <Select id="totp-digits" value={config?.digits ?? digits} onChange={(e) => setDigits(Number(e.target.value) as OtpDigits)} disabled={isUri}>
                  {OTP_DIGITS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="totp-period">Period</Label>
                <Select id="totp-period" value={config?.period ?? period} onChange={(e) => setPeriod(Number(e.target.value))} disabled={isUri}>
                  {(config && !PERIODS.includes(config.period) ? [config.period, ...PERIODS] : PERIODS).map((p) => (
                    <option key={p} value={p}>
                      {p} s
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-1">
                <Label htmlFor="totp-issuer">Issuer</Label>
                <Input id="totp-issuer" value={config?.issuer ?? issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="ACME" disabled={isUri} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="totp-account">Account</Label>
                <Input id="totp-account" value={config?.account ?? account} onChange={(e) => setAccount(e.target.value)} placeholder="ada@example.com" disabled={isUri} />
              </div>
            </div>
          </Card>

          <Card className="shadow-card">
            <CardHeader title="Enrolment URI" description="What an authenticator app reads from the QR code." actions={<CopyButton value={uri} />} />
            {uri ? (
              <OutputRow label="otpauth URI" value={uri} copyable={false} />
            ) : (
              <EmptyState title="No secret yet" description="Enter or generate a secret to build the URI." className="py-6" />
            )}
          </Card>
        </div>

        <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
          <CardHeader title="Current code" actions={config ? <Badge>{config.algorithm} · {config.digits} digits</Badge> : null} />
          {!config ? (
            <EmptyState title="Codes appear here" description="They refresh automatically every period." className="py-8" />
          ) : now === null || !showCode ? (
            <div className="space-y-2" aria-busy="true">
              <div className="h-12 w-48 skeleton" />
              <div className="h-2 w-full skeleton" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-4xl font-semibold tracking-[0.2em] text-fg" aria-live="polite" aria-label={`Current code ${showCode.current}`}>
                  {groupCode(showCode.current)}
                </div>
                <CopyButton value={showCode.current} variant="primary" />
              </div>
              {config.type === "totp" && remaining !== null ? (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={config.period} aria-valuenow={remaining} aria-label="Seconds until the code changes">
                    <div className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", remaining <= 5 ? "bg-danger" : "bg-accent")} style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-fg-muted">
                    Changes in <span className="font-mono text-fg">{remaining}s</span> · step {counter}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-fg-muted">HOTP counter {counter}. Counter-based codes do not expire with time.</p>
              )}
              <OutputGrid className="sm:grid-cols-1">
                <OutputRow label="Next code" value={showCode.next} hint="For the following time step" />
              </OutputGrid>
            </div>
          )}

          {uri ? (
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Scan to enrol</div>
              <div className="flex items-center justify-center rounded-lg border bg-white p-3">
                {qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL generated locally; next/image cannot optimise it.
                  <img src={qrUrl} alt="QR code of the otpauth URI" width={208} height={208} className="h-52 w-52" />
                ) : (
                  <div className="h-52 w-52 skeleton" />
                )}
              </div>
              {qrError ? (
                <Alert tone="danger" className="mt-2">
                  {qrError}
                </Alert>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
