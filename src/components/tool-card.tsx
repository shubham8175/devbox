import Link from "next/link";
import type { ToolWithRoute } from "@/types/tool";
import { Highlight } from "@/components/highlight";
import { FavoriteButton } from "@/components/favorite-button";
import { cn } from "@/lib/utils";

/**
 * Compact tool card. The whole card is clickable via the stretched name link;
 * the star sits above it so it can be toggled without navigating.
 */
export function ToolCard({ tool, className, query = "" }: { tool: ToolWithRoute; className?: string; query?: string }) {
  const Icon = tool.icon;
  return (
    <div
      className={cn(
        "shadow-card group relative flex h-full flex-col rounded-card border bg-surface p-3.5",
        "transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-bg-elevated text-fg-muted transition-colors group-hover:text-accent-strong">
          <Icon className="h-4 w-4" />
        </div>
        <FavoriteButton
          toolId={tool.id}
          size="sm"
          variant="ghost"
          className="relative z-10 -mr-1 -mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 pointer-coarse:opacity-100"
        />
      </div>
      <Link
        href={tool.href}
        className="mt-3 text-sm font-medium text-fg after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        <Highlight text={tool.name} query={query} />
      </Link>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
        <Highlight text={tool.description} query={query} />
      </p>
      <div className="mt-auto pt-3 text-[11px] text-fg-subtle">
        <Highlight text={tool.category} query={query} />
      </div>
    </div>
  );
}
