"use client";

import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  value: string;
  label?: string;
  /** Only show an icon, no text */
  iconOnly?: boolean;
  /** Message shown in the toast on success */
  toastMessage?: string;
}

export function CopyButton({
  value,
  label = "Copy",
  iconOnly,
  toastMessage = "Copied to clipboard",
  className,
  size,
  variant = "ghost",
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useCopy();
  const { toast } = useToast();
  const disabled = !value;

  const onClick = async () => {
    const ok = await copy(value);
    if (ok) toast(toastMessage, "success");
    else toast("Clipboard is unavailable in this browser", "error");
  };

  return (
    <Button
      variant={variant}
      size={size ?? (iconOnly ? "icon" : "sm")}
      onClick={onClick}
      disabled={disabled || props.disabled}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={cn(copied && "text-success hover:text-success", className)}
      {...props}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {iconOnly ? null : <span>{copied ? "Copied" : label}</span>}
    </Button>
  );
}
