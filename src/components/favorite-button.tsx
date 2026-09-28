"use client";

import { Star } from "lucide-react";
import { toggleFavorite, useFavorites } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  toolId: string;
  className?: string;
  size?: "sm" | "md";
  /** `ghost` has no border until active; used inside tool cards */
  variant?: "default" | "ghost";
}

export function FavoriteButton({ toolId, className, size = "md", variant = "default" }: FavoriteButtonProps) {
  const favorites = useFavorites();
  const { toast } = useToast();
  const active = favorites.includes(toolId);
  return (
    <button
      type="button"
      onClick={() => {
        toggleFavorite(toolId);
        toast(active ? "Removed from favorites" : "Added to favorites", "info");
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      title={active ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors cursor-pointer",
        size === "sm" ? "h-7 w-7 rounded-md" : "h-9 w-9 rounded-lg",
        variant === "ghost"
          ? active
            ? "text-warning hover:bg-surface-hover"
            : "text-fg-subtle hover:bg-surface-hover hover:text-fg"
          : active
            ? "border border-warning/40 bg-warning-soft text-warning"
            : "border bg-surface text-fg-subtle hover:border-border-strong hover:text-fg",
        className,
      )}
    >
      <Star className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", active && "fill-current")} />
    </button>
  );
}
