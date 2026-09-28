"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches render/compute errors from a tool (for example a stack overflow on
 * absurdly nested input) so one tool cannot blank the whole app.
 * Nothing about the error or the input is sent anywhere.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Intentionally no reporting: DevBox has no backend and no telemetry.
  }, [error]);
  const tooDeep = /call stack/i.test(error.message);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center py-16 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {tooDeep
          ? "The input is nested more deeply than this tool can process in the browser."
          : "Something went wrong while processing the input. Your data was not sent anywhere."}
      </p>
      <p className="mt-1 max-w-full truncate font-mono text-xs text-fg-subtle">{error.message}</p>
      <Button className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
