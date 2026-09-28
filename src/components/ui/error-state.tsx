import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorState({ title, description, className }: { title: string; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-danger/30 bg-danger-soft/40 px-6 py-8 text-center", className)} role="alert">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <AlertCircle className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-fg-muted">{description}</p> : null}
    </div>
  );
}
