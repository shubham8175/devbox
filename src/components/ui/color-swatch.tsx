"use client";

import { Check, Copy } from "lucide-react";
import { useCopy } from "@/hooks/use-copy";
import { useToast } from "@/components/ui/toast";
import { luminance, parseColor } from "@/lib/tools/color";
import { cn } from "@/lib/utils";

interface ColorSwatchProps {
  hex: string;
  label?: string;
  sublabel?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

/** A clickable colour card that copies its HEX value. */
export function ColorSwatch({ hex, label, sublabel, size = "md", onClick, className }: ColorSwatchProps) {
  const { copied, copy } = useCopy();
  const { toast } = useToast();
  const rgba = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  const light = luminance(rgba) > 0.45;
  const heights = { sm: "h-12", md: "h-20", lg: "h-28" }[size];

  return (
    <button
      type="button"
      onClick={async () => {
        onClick?.();
        if (await copy(hex)) toast(`Copied ${hex}`);
      }}
      title={`Copy ${hex}`}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-all hover:-translate-y-px hover:shadow-lg cursor-pointer",
        className,
      )}
    >
      <div className={cn("relative w-full", heights)} style={{ backgroundColor: hex }}>
        <span className={cn("absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100", light ? "bg-black/10 text-black" : "bg-white/15 text-white")}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </span>
      </div>
      <div className="w-full bg-bg-elevated px-2.5 py-1.5">
        <div className="font-mono text-xs text-fg">{label ?? hex}</div>
        {sublabel ? <div className="truncate text-[11px] text-fg-subtle">{sublabel}</div> : null}
      </div>
    </button>
  );
}
