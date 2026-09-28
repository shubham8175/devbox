import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTool } from "@/data/tools";
import { Badge } from "@/components/ui/badge";
import { FavoriteButton } from "@/components/favorite-button";
import { RecentTracker } from "@/components/recent-tracker";

interface ToolPageProps {
  toolId: string;
  children: ReactNode;
  /** Optional extra note displayed under the description */
  note?: ReactNode;
  /** Use the full width of the main area (image / diff tools) */
  wide?: boolean;
}

/**
 * Server component wrapper that renders breadcrumbs and a consistent tool
 * header from the central tools registry, then the tool's client UI.
 */
export function ToolPage({ toolId, children, note, wide }: ToolPageProps) {
  const tool = getTool(toolId);
  if (!tool) throw new Error(`Unknown tool: ${toolId}`);
  const Icon = tool.icon;
  return (
    <div className={wide ? "mx-auto w-full max-w-7xl" : "mx-auto w-full max-w-5xl"}>
      <RecentTracker toolId={tool.id} />
      <nav aria-label="Breadcrumb" className="mb-2.5 flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
        <Link href="/" className="whitespace-nowrap transition-colors hover:text-fg">
          DevBox
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href={`/?category=${encodeURIComponent(tool.category)}`} className="whitespace-nowrap transition-colors hover:text-fg">
          {tool.category}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="whitespace-nowrap text-fg-muted">{tool.name}</span>
      </nav>
      <header className="mb-5 flex items-start gap-3.5">
        <div className="shadow-card flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-surface text-accent-strong">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{tool.name}</h1>
            <Badge>{tool.category}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-fg-muted text-pretty">{tool.description}</p>
          {note ? <div className="mt-2 text-xs text-fg-subtle">{note}</div> : null}
        </div>
        <FavoriteButton toolId={tool.id} />
      </header>
      {children}
    </div>
  );
}
