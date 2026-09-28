"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { decodeBase64, encodeBase64 } from "@/lib/tools/base64";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { CopyButton } from "@/components/copy-button";

type Mode = "encode" | "decode";

export function Base64Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { ok: true, output: "" };
    return mode === "encode" ? encodeBase64(input) : decodeBase64(input);
  }, [mode, input]);

  const swap = () => {
    if (!result.ok || !result.output) return;
    setInput(result.output);
    setMode(mode === "encode" ? "decode" : "encode");
  };

  return (
    <Card>
      <CardHeader
        title={mode === "encode" ? "Text → Base64" : "Base64 → Text"}
        description="UTF-8 aware, so emoji and non-Latin scripts round-trip correctly."
        actions={
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "encode", label: "Encode" },
              { value: "decode", label: "Decode" },
            ]}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Label htmlFor="b64-in" hint={`${input.length.toLocaleString()} chars`}>
            {mode === "encode" ? "Plain text" : "Base64"}
          </Label>
          <Textarea
            id="b64-in"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "encode" ? "Hello, 世界 👋" : "SGVsbG8sIOS4lueVjCDwn5GL"}
            className="min-h-[260px]"
            invalid={!result.ok}
          />
        </div>
        <div>
          <Label htmlFor="b64-out" hint={`${result.output.length.toLocaleString()} chars`}>
            {mode === "encode" ? "Base64" : "Plain text"}
          </Label>
          <Textarea
            id="b64-out"
            readOnly
            value={result.output}
            placeholder="Output appears here"
            className="min-h-[260px] bg-surface"
          />
        </div>
      </div>
      {!result.ok && result.error ? (
        <Alert tone="danger" className="mt-3">
          {result.error}
        </Alert>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={swap} disabled={!result.ok || !result.output}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setInput("")} disabled={!input}>
          Clear
        </Button>
        <div className="ml-auto">
          <CopyButton value={result.ok ? result.output : ""} label="Copy output" variant="primary" />
        </div>
      </div>
    </Card>
  );
}
