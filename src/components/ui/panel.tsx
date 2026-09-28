import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Input panel: where the user types or drops something. */
export function InputPanel({ title, description, actions, children, className }: PanelProps) {
  return (
    <Card className={cn("surface-gradient shadow-card", className)}>
      <CardHeader title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}

/** Output panel: results, usually copyable. */
export function OutputPanel({ title, description, actions, children, className }: PanelProps) {
  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}
