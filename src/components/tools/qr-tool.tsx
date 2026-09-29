"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, ImageDown } from "lucide-react";
import { buildEmailPayload, buildPhonePayload, buildSmsPayload, buildWifiPayload, normalizeUrl, QR_ERROR_LEVELS, QR_MODES, type QrErrorLevel, type QrMode, type WifiFields } from "@/lib/tools/qr";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

export function QrTool() {
  const [mode, setMode] = useState<QrMode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [wifi, setWifi] = useState<WifiFields>({ ssid: "", password: "", security: "WPA", hidden: false });
  const [email, setEmail] = useState({ to: "", subject: "", body: "" });
  const [phone, setPhone] = useState("");
  const [sms, setSms] = useState({ number: "", message: "" });

  const [size, setSize] = useState(256);
  const [level, setLevel] = useState<QrErrorLevel>("M");
  const [fg, setFg] = useState("#000000");
  const [bg, setBg] = useState("#ffffff");
  const [margin, setMargin] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Prefill from the PWA share target (manifest.ts): sharing a URL or text
  // into DevBox lands here as ?url=…/&text=…, read client-side only, once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url");
    const sharedText = params.get("text");
    if (!sharedUrl && !sharedText) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time seed from the URL the OS share sheet navigated to, not derived render state. */
    if (sharedUrl) {
      setMode("url");
      setUrl(sharedUrl);
    } else if (sharedText) {
      setMode("text");
      setText(sharedText);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const payload = useMemo(() => {
    switch (mode) {
      case "text":
        return text;
      case "url":
        return normalizeUrl(url);
      case "wifi":
        return wifi.ssid ? buildWifiPayload(wifi) : "";
      case "email":
        return email.to ? buildEmailPayload(email) : "";
      case "phone":
        return phone ? buildPhonePayload(phone) : "";
      case "sms":
        return sms.number ? buildSmsPayload(sms) : "";
    }
  }, [mode, text, url, wifi, email, phone, sms]);

  // Render to canvas + SVG whenever inputs change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!payload || !canvas) {
      setSvg("");
      return;
    }
    let cancelled = false;
    const opts = { errorCorrectionLevel: level, margin, width: size, color: { dark: fg, light: bg } };
    Promise.all([QRCode.toCanvas(canvas, payload, opts), QRCode.toString(payload, { ...opts, type: "svg" })])
      .then(([, s]) => {
        if (!cancelled) {
          setSvg(s);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not generate QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size, level, fg, bg, margin]);

  const download = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const downloadPng = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) download(blob, "qr-code.png");
    });
  };
  const downloadSvg = () => download(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg");

  const copyImage = async () => {
    try {
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("unsupported");
      const blob = await new Promise<Blob | null>((res) => canvasRef.current?.toBlob(res, "image/png"));
      if (!blob) throw new Error("no image");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("QR image copied to clipboard");
    } catch {
      toast("This browser can't copy images to the clipboard. Use Download instead.", "error");
    }
  };

  const contentLength = new TextEncoder().encode(payload).length;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card className="surface-gradient shadow-card">
          <CardHeader
            title="Content"
            actions={
              !payload ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMode("url");
                    setUrl(SITE_URL);
                  }}
                >
                  Load sample
                </Button>
              ) : null
            }
          />
          <div className="mb-4 flex flex-wrap gap-1.5">
            {QR_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  mode === m.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <>
              <Label htmlFor="qr-text">Text</Label>
              <Textarea id="qr-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Any text" className="min-h-30" />
            </>
          ) : null}
          {mode === "url" ? (
            <>
              <Label htmlFor="qr-url">URL</Label>
              <Input id="qr-url" mono value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com/page" />
              {url && payload !== url.trim() ? <p className="mt-1.5 text-xs text-fg-subtle">Encoded as {payload}</p> : null}
            </>
          ) : null}
          {mode === "wifi" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="qr-ssid">Network name (SSID)</Label>
                <Input id="qr-ssid" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="qr-sec">Security</Label>
                <Select id="qr-sec" value={wifi.security} onChange={(e) => setWifi({ ...wifi, security: e.target.value as WifiFields["security"] })}>
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Open (no password)</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="qr-pass">Password</Label>
                <Input id="qr-pass" mono type="text" value={wifi.password} onChange={(e) => setWifi({ ...wifi, password: e.target.value })} disabled={wifi.security === "nopass"} data-1p-ignore="true" data-lpignore="true" />
              </div>
              <label className="flex items-center gap-2 text-sm text-fg-muted cursor-pointer">
                <input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi({ ...wifi, hidden: e.target.checked })} className="accent-accent" />
                Hidden network
              </label>
            </div>
          ) : null}
          {mode === "email" ? (
            <div className="grid gap-3">
              <div>
                <Label htmlFor="qr-to">To</Label>
                <Input id="qr-to" type="email" value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} placeholder="someone@example.com" />
              </div>
              <div>
                <Label htmlFor="qr-subj">Subject</Label>
                <Input id="qr-subj" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="qr-body">Body</Label>
                <Textarea id="qr-body" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} className="min-h-20 font-sans" />
              </div>
            </div>
          ) : null}
          {mode === "phone" ? (
            <>
              <Label htmlFor="qr-phone">Phone number</Label>
              <Input id="qr-phone" mono type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </>
          ) : null}
          {mode === "sms" ? (
            <div className="grid gap-3">
              <div>
                <Label htmlFor="qr-sms-n">Phone number</Label>
                <Input id="qr-sms-n" mono type="tel" value={sms.number} onChange={(e) => setSms({ ...sms, number: e.target.value })} placeholder="+91 98765 43210" />
              </div>
              <div>
                <Label htmlFor="qr-sms-m">Message</Label>
                <Textarea id="qr-sms-m" value={sms.message} onChange={(e) => setSms({ ...sms, message: e.target.value })} className="min-h-20 font-sans" />
              </div>
            </div>
          ) : null}

          {payload ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border bg-bg-elevated px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Encoded payload · {contentLength} bytes</div>
                <div className="mt-0.5 break-all font-mono text-xs">{payload}</div>
              </div>
              <CopyButton value={payload} iconOnly />
            </div>
          ) : null}
        </Card>

        <Card className="shadow-card">
          <CardHeader title="Style" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="qr-size" hint={`${size} px`}>
                Size
              </Label>
              <input id="qr-size" type="range" min={128} max={1024} step={32} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-accent" />
            </div>
            <div>
              <Label htmlFor="qr-margin" hint={`${margin} modules`}>
                Margin
              </Label>
              <input id="qr-margin" type="range" min={0} max={8} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-full accent-accent" />
            </div>
            <div>
              <Label>Error correction</Label>
              <div className="flex gap-1.5">
                {QR_ERROR_LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLevel(l.id)}
                    title={l.hint}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-center text-xs font-medium transition-colors cursor-pointer",
                      level === l.id ? "border-accent/40 bg-accent-soft text-accent-strong" : "bg-bg-elevated text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    <div className="font-mono">{l.label}</div>
                    <div className="text-[10px] text-fg-subtle">{l.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorField id="qr-fg" label="Foreground" value={fg} onChange={setFg} />
              <ColorField id="qr-bg" label="Background" value={bg} onChange={setBg} />
            </div>
          </div>
        </Card>
      </div>

      <Card className="shadow-card lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
        <CardHeader title="Preview" actions={payload ? <Badge>{level} · {size}px</Badge> : null} />
        <div className="flex items-center justify-center rounded-lg border bg-bg-elevated p-4">
          {payload ? (
            <canvas ref={canvasRef} className="max-w-full rounded" style={{ width: Math.min(size, 320), height: Math.min(size, 320) }} aria-label="QR code preview" />
          ) : (
            <EmptyState title="Nothing to encode yet" description="Fill in the content on the left to see a live QR code." className="w-full border-0 py-10" />
          )}
        </div>
        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={downloadPng} disabled={!payload || !!error}>
            <Download className="h-3.5 w-3.5" /> PNG
          </Button>
          <Button onClick={downloadSvg} disabled={!svg || !!error}>
            <Download className="h-3.5 w-3.5" /> SVG
          </Button>
          <Button onClick={copyImage} disabled={!payload || !!error} className="col-span-2">
            <ImageDown className="h-3.5 w-3.5" /> Copy image
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-fg-subtle">Generated locally with the qrcode library. Higher error correction makes denser codes that survive damage or logos.</p>
      </Card>
    </div>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${label} color`} />
          <span className="block h-full w-full" style={{ backgroundColor: value }} />
        </label>
        <Input id={id} mono value={value} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value)} className="h-9" />
      </div>
    </div>
  );
}
