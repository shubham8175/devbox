"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { analyzePassword } from "@/lib/tools/password-strength";
import { InputPanel, OutputPanel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { OutputGrid, OutputRow } from "@/components/output-row";
import { cn } from "@/lib/utils";

const SCORE_COLOR = ["bg-danger", "bg-danger", "bg-warning", "bg-accent", "bg-success"];
const SCORE_TONE: Array<"danger" | "warning" | "accent" | "success"> = ["danger", "danger", "warning", "accent", "success"];

export function PasswordStrengthTool() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const report = useMemo(() => analyzePassword(pw), [pw]);

  return (
    <div className="space-y-4">
      <InputPanel
        title="Password"
        description="Evaluated entirely in this tab. Nothing is sent, logged or saved."
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPw("")} disabled={!pw}>
              Clear
            </Button>
          </>
        }
      >
        <Label htmlFor="pws-input" hint={pw ? `${Array.from(pw).length} characters` : undefined}>
          Password to check
        </Label>
        <Input
          id="pws-input"
          mono
          type={show ? "text" : "password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Type or paste a password"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          className="h-11 text-base"
        />
        {report ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs">
              <Badge tone={SCORE_TONE[report.score]}>{report.label}</Badge>
              <span className="text-fg-muted">≈ {report.adjustedEntropy} bits after penalties</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("h-1.5 rounded-full transition-colors", i < report.score ? SCORE_COLOR[report.score] : "bg-surface-hover")} />
              ))}
            </div>
          </div>
        ) : null}
      </InputPanel>

      {!report ? (
        <EmptyState title="Nothing to evaluate yet" description="Length matters far more than clever substitutions. Consider a passphrase of several random words." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <OutputPanel title="Measurements">
            <OutputGrid className="sm:grid-cols-2">
              <OutputRow label="Length" value={`${report.length} characters`} copyable={false} />
              <OutputRow label="Character classes" value={`${report.classCount} of 4`} hint={[report.classes.lower && "lower", report.classes.upper && "upper", report.classes.digit && "digits", report.classes.symbol && "symbols"].filter(Boolean).join(" · ") || "none"} copyable={false} />
              <OutputRow label="Charset size" value={String(report.charsetSize)} copyable={false} />
              <OutputRow label="Naive entropy" value={`${report.naiveEntropy} bits`} hint="if every character were random" copyable={false} />
              <OutputRow label="Adjusted entropy" value={`${report.adjustedEntropy} bits`} hint="after pattern penalties" copyable={false} />
              <OutputRow label="Guess space" value={report.guessesOrder} hint="rough order of magnitude" copyable={false} mono={false} />
            </OutputGrid>
          </OutputPanel>
          <OutputPanel title="Findings" description="Heuristic checks, not a guarantee. Real attackers use leaked-password lists and rules this tool cannot fully model.">
            <div className="space-y-1.5">
              {report.findings.map((f, i) => (
                <Alert key={i} tone={f.severity === "high" ? "danger" : f.severity === "medium" ? "warning" : "info"}>
                  {f.message}
                </Alert>
              ))}
            </div>
          </OutputPanel>
        </div>
      )}
    </div>
  );
}
