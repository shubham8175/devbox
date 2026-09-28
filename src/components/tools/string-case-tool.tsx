"use client";

import { useState } from "react";
import { CASE_CONVERSIONS } from "@/lib/tools/string-case";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OutputRow } from "@/components/output-row";

const EXAMPLES = ["hello world", "helloWorld", "HelloWorld", "hello_world", "hello-world", "HTTPServerError"];

export function StringCaseTool() {
  const [input, setInput] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Input"
          description="Words are detected from spaces, underscores, dashes and camelCase boundaries."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setInput("")} disabled={!input}>
              Clear
            </Button>
          }
        />
        <Label htmlFor="case-in">Text</Label>
        <Textarea
          id="case-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="hello world"
          className="min-h-[90px] font-sans"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="rounded-md border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg cursor-pointer"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Conversions" />
        <div className="grid gap-2 sm:grid-cols-2">
          {CASE_CONVERSIONS.map((c) => (
            <OutputRow key={c.id} label={c.label} value={input ? c.convert(input) : ""} />
          ))}
        </div>
      </Card>
    </div>
  );
}
