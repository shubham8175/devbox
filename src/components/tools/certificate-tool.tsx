"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { CERTIFICATE_SAMPLE, certificateFingerprints, decodeCertificateDer, parseCertificateInput, type CertName, type CertOk, type CertSource } from "@/lib/tools/certificate";
import { formatLocal } from "@/lib/tools/time";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { CopyButton } from "@/components/copy-button";

/** Uploaded certificate files above this size are rejected (matches the DER parser cap). */
const MAX_CERT_FILE_BYTES = 1_048_576;

const STATUS_TONE = { valid: "success", expired: "danger", "not-yet-valid": "warning" } as const;
const STATUS_LABEL = { valid: "Valid", expired: "Expired", "not-yet-valid": "Not yet valid" } as const;

interface LoadedFile {
  name: string;
  bytes: Uint8Array;
}

export function CertificateTool() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Re-evaluates "days remaining" once a minute. Null during SSR.
  const now = useNow(60_000);

  // The DER bytes only change with the input, so the fingerprint effect below
  // is not re-run by the clock tick that refreshes the validity status.
  const source = useMemo<CertSource | null>(() => {
    if (file) return { ok: true, der: file.bytes, chainCount: 1 };
    if (input.trim()) return parseCertificateInput(input);
    return null;
  }, [file, input]);
  const result = useMemo(() => (source?.ok ? decodeCertificateDer(source.der, now ?? undefined, source.chainCount) : source), [source, now]);

  const onFile = useCallback(async (f: File) => {
    setFileError(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      // A DER certificate always starts with a SEQUENCE tag; anything else is treated as PEM text.
      if (bytes[0] === 0x30) {
        setFile({ name: f.name, bytes });
        setInput("");
      } else {
        setFile(null);
        setInput(new TextDecoder().decode(bytes));
      }
    } catch {
      setFileError("Could not read that file.");
    }
  }, []);

  const clear = () => {
    setInput("");
    setFile(null);
    setFileError(null);
  };

  return (
    <div className="space-y-4">
      <Card className="surface-gradient shadow-card">
        <CardHeader
          title="Certificate"
          description="Paste a PEM certificate (or a bundle; the first one is decoded) or drop a .pem, .crt, .cer or .der file. Nothing leaves this page and nothing is stored."
          actions={
            !input && !file ? (
              <Button size="sm" variant="ghost" onClick={() => setInput(CERTIFICATE_SAMPLE)}>
                Load sample
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear
              </Button>
            )
          }
        />
        {file ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Badge tone="accent">DER file</Badge>
            <span className="font-mono">{file.name}</span>
            <span className="text-fg-subtle">{file.bytes.length.toLocaleString()} bytes</span>
            <Button size="sm" variant="ghost" onClick={clear} aria-label="Remove file">
              <X className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
        ) : (
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setFile(null);
            }}
            placeholder={"-----BEGIN CERTIFICATE-----\nMIIDbDCCAlSgAwIBAgIU...\n-----END CERTIFICATE-----"}
            className="min-h-[180px]"
            invalid={result ? !result.ok : false}
            aria-label="PEM certificate"
          />
        )}
        <Dropzone onFile={onFile} accept=".pem,.crt,.cer,.der" paste={false} compact maxBytes={MAX_CERT_FILE_BYTES} className="mt-3" title="Drop a certificate file" description={<>.pem, .crt, .cer or .der · or <span className="text-accent-strong">click to choose</span></>} />
        {fileError ? (
          <Alert tone="danger" className="mt-3">
            {fileError}
          </Alert>
        ) : null}
        {result && !result.ok ? (
          <Alert tone="danger" className="mt-3">
            {result.error}
          </Alert>
        ) : null}
      </Card>

      {result?.ok ? <CertificateDetails cert={result} /> : null}
    </div>
  );
}

interface FingerprintState {
  der: Uint8Array;
  fingerprints?: { sha1: string; sha256: string };
  error?: string;
}

function CertificateDetails({ cert }: { cert: CertOk }) {
  // Keyed by the DER reference so a stale result is never shown for a new certificate.
  const [fpState, setFpState] = useState<FingerprintState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const der = cert.der;
    certificateFingerprints(der)
      .then((fingerprints) => {
        if (!cancelled) setFpState({ der, fingerprints });
      })
      .catch(() => {
        if (!cancelled) setFpState({ der, error: "Could not compute fingerprints. Web Crypto needs a secure context (https or localhost)." });
      });
    return () => {
      cancelled = true;
    };
  }, [cert.der]);

  const fingerprints = fpState?.der === cert.der ? fpState.fingerprints : undefined;
  const fpError = fpState?.der === cert.der ? fpState.error : undefined;

  const subjectCn = cert.subject.attributes.find((a) => a.name === "CN")?.value ?? cert.subject.oneLine;
  const sanCount = cert.san ? cert.san.dns.length + cert.san.ip.length + cert.san.email.length + cert.san.uri.length + cert.san.other.length : 0;

  return (
    <>
      <Card className="shadow-card">
        <CardHeader
          title="Summary"
          description={cert.status.message}
          actions={
            <>
              {cert.chainCount > 1 ? <Badge>Bundle of {cert.chainCount} · first shown</Badge> : null}
              {cert.selfSigned ? <Badge tone="warning">Self-signed</Badge> : null}
              {cert.basicConstraints?.ca ? <Badge tone="accent">CA</Badge> : null}
              <Badge tone={STATUS_TONE[cert.status.state]}>{STATUS_LABEL[cert.status.state]}</Badge>
            </>
          }
        />
        <OutputGrid>
          <OutputRow label="Subject" value={subjectCn} hint={cert.subject.oneLine !== subjectCn ? cert.subject.oneLine : undefined} />
          <OutputRow label="Issuer" value={cert.issuer.oneLine} />
          <OutputRow label="Not before" value={cert.notBeforeIso} hint={formatLocal(cert.notBefore)} />
          <OutputRow label="Not after" value={cert.notAfterIso} hint={`${formatLocal(cert.notAfter)} · ${cert.validityDays.toLocaleString()}-day validity`} />
          <OutputRow label="Serial number" value={cert.serialHex} hint={cert.serialDecimal} />
          <OutputRow label="Signature algorithm" value={cert.signatureAlgorithm} hint={cert.signatureAlgorithmOid} />
          <OutputRow label="Version" value={`v${cert.version}`} />
          <OutputRow label="Public key" value={cert.publicKey.summary} />
        </OutputGrid>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NameCard title="Subject" name={cert.subject} />
        <NameCard title="Issuer" name={cert.issuer} />
      </div>

      <Card className="shadow-card">
        <CardHeader title="Subject Alternative Names" description={cert.san ? `${sanCount} name${sanCount === 1 ? "" : "s"}` : "This certificate has no subjectAltName extension."} actions={cert.san ? <CopyButton value={[...cert.san.dns, ...cert.san.ip, ...cert.san.email, ...cert.san.uri].join("\n")} label="Copy all" /> : null} />
        {cert.san ? (
          <div className="flex flex-wrap gap-1.5">
            {cert.san.dns.map((v) => (
              <Badge key={`dns-${v}`} tone="accent" className="font-mono">
                DNS · {v}
              </Badge>
            ))}
            {cert.san.ip.map((v) => (
              <Badge key={`ip-${v}`} tone="success" className="font-mono">
                IP · {v}
              </Badge>
            ))}
            {cert.san.email.map((v) => (
              <Badge key={`email-${v}`} tone="warning" className="font-mono">
                email · {v}
              </Badge>
            ))}
            {cert.san.uri.map((v) => (
              <Badge key={`uri-${v}`} className="font-mono">
                URI · {v}
              </Badge>
            ))}
            {cert.san.other.map((v, i) => (
              <Badge key={`other-${i}`} className="font-mono">
                {v}
              </Badge>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Public key" description="From the SubjectPublicKeyInfo." />
        <OutputGrid className="sm:grid-cols-3">
          <OutputRow label="Algorithm" value={cert.publicKey.algorithm} hint={cert.publicKey.oid} />
          <OutputRow label={cert.publicKey.curve ? "Curve" : "Modulus"} value={cert.publicKey.curve ?? (cert.publicKey.bits ? `${cert.publicKey.bits} bits` : "")} />
          <OutputRow label={cert.publicKey.exponent ? "Exponent" : "Size"} value={cert.publicKey.exponent ?? (cert.publicKey.bits ? `${cert.publicKey.bits} bits` : "")} />
        </OutputGrid>
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Extensions" description={cert.extensions.length ? `${cert.extensions.length} extension${cert.extensions.length === 1 ? "" : "s"}${cert.unknownExtensions.length ? ` · ${cert.unknownExtensions.length} not decoded (shown as hex)` : ""}` : "No extensions (v1 certificate)."} />
        {cert.extensions.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover text-left text-[11px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Extension</th>
                  <th className="px-3 py-2 font-medium">Critical</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {cert.extensions.map((e) => (
                  <tr key={e.oid} className="bg-bg-elevated align-top">
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className={e.known ? "font-mono text-xs text-accent-strong" : "font-mono text-xs text-fg-muted"}>{e.name}</div>
                      {e.known ? <div className="font-mono text-[11px] text-fg-subtle">{e.oid}</div> : null}
                    </td>
                    <td className="px-3 py-2">{e.critical ? <Badge tone="warning">critical</Badge> : <span className="text-xs text-fg-subtle">no</span>}</td>
                    <td className="break-all px-3 py-2 font-mono text-xs">{e.value}</td>
                    <td className="px-2 py-1.5">
                      <CopyButton value={e.value} iconOnly />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card className="shadow-card">
        <CardHeader title="Fingerprints" description="Hashes of the DER encoding, as printed by openssl x509 -fingerprint." />
        {fpError ? (
          <Alert tone="warning">{fpError}</Alert>
        ) : fingerprints ? (
          <div className="grid gap-2">
            <OutputRow label="SHA-256" value={fingerprints.sha256} />
            <OutputRow label="SHA-1" value={fingerprints.sha1} hint="Legacy; shown for matching older tooling only." />
          </div>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <div className="h-10 skeleton" />
            <div className="h-10 skeleton" />
          </div>
        )}
      </Card>
    </>
  );
}

function NameCard({ title, name }: { title: string; name: CertName }) {
  return (
    <Card className="shadow-card">
      <CardHeader title={title} actions={<CopyButton value={name.oneLine} />} />
      {name.attributes.length ? (
        <div className="grid gap-2">
          {name.attributes.map((a, i) => (
            <OutputRow key={`${a.oid}-${i}`} label={a.name} value={a.value} hint={a.name === a.oid ? undefined : a.oid} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">Empty name.</p>
      )}
    </Card>
  );
}
