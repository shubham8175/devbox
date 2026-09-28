import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "danger" | "warning";

const styles: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-border bg-surface text-fg-muted", Icon: Info },
  success: { box: "border-transparent bg-success-soft text-success", Icon: CheckCircle2 },
  danger: { box: "border-transparent bg-danger-soft text-danger", Icon: AlertCircle },
  warning: { box: "border-transparent bg-warning-soft text-warning", Icon: TriangleAlert },
};

export function Alert({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const { box, Icon } = styles[tone];
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed", box, className)}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
