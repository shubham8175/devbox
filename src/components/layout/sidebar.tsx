"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search, Star, X } from "lucide-react";
import { categories, getTool, tools, toolsByCategory } from "@/data/tools";
import { useCommandPalette } from "@/components/layout/command-palette-context";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { InstallButton } from "@/components/pwa/install-button";
import { Kbd } from "@/components/ui/kbd";
import { toggleCategoryOpen, toggleSidebarCollapsed, useFavorites, useOpenCategories, useRecents, useSidebarCollapsed } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ToolCategory, ToolWithRoute } from "@/types/tool";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function NavItem({ tool, compact, active, onClick }: { tool: ToolWithRoute; compact: boolean; active: boolean; onClick: () => void }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={compact ? tool.name : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg text-sm transition-colors",
        compact ? "justify-center px-0" : "px-2.5",
        active ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-accent-strong" : "text-fg-subtle group-hover:text-fg-muted")} />
      {compact ? null : <span className="truncate">{tool.name}</span>}
    </Link>
  );
}

function CategorySection({
  category,
  open,
  activeCategory,
  pathname,
  onMobileClose,
}: {
  category: ToolCategory;
  open: boolean;
  activeCategory: boolean;
  pathname: string;
  onMobileClose: () => void;
}) {
  const items = toolsByCategory(category);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => toggleCategoryOpen(category, !open)}
        aria-expanded={open}
        className={cn(
          "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[11px] font-medium uppercase tracking-wider transition-colors cursor-pointer",
          activeCategory ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
        )}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
        <span className="truncate">{category}</span>
        <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-fg-subtle">{items.length}</span>
      </button>
      {open ? (
        <ul className="mb-2 mt-0.5 space-y-0.5 pl-1">
          {items.map((tool) => (
            <li key={tool.id}>
              <NavItem tool={tool} compact={false} active={pathname === tool.href} onClick={onMobileClose} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { open } = useCommandPalette();
  const collapsed = useSidebarCollapsed();
  const favorites = useFavorites();
  const recents = useRecents();
  const openCategories = useOpenCategories();
  const favoriteTools = favorites.map((id) => getTool(id)).filter((t): t is ToolWithRoute => !!t);
  const recentTools = recents
    .map((id) => getTool(id))
    .filter((t): t is ToolWithRoute => !!t)
    .filter((t) => !favorites.includes(t.id))
    .slice(0, 4);

  const currentId = pathname.startsWith("/tools/") ? pathname.slice("/tools/".length) : null;
  const currentCategory = currentId ? (getTool(currentId)?.category ?? null) : null;

  const nav = (compact: boolean) => (
    <>
      <div className={cn("flex items-center pt-4 pb-3", compact ? "flex-col gap-2 px-2" : "justify-between px-4")}>
        <Link href="/" className="flex items-center gap-2.5" onClick={onMobileClose} title="DevBox home">
          <Logo />
          {compact ? null : <span className="text-sm font-semibold tracking-tight">DevBox</span>}
        </Link>
        <div className={cn("flex items-center gap-1", compact && "flex-col")}>
          <ThemeToggle />
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:flex cursor-pointer"
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            title={compact ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onMobileClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn("pb-3", compact ? "px-2" : "px-3")}>
        <button
          type="button"
          onClick={() => {
            onMobileClose();
            open();
          }}
          title="Search tools (⌘K on macOS, Ctrl+K on Windows/Linux)"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border bg-bg-elevated text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted cursor-pointer",
            compact ? "justify-center px-0" : "px-2.5",
          )}
        >
          <Search className="h-4 w-4" />
          {compact ? null : (
            <>
              <span className="flex-1 text-left">Search {tools.length} tools</span>
              <span className="hidden items-center gap-0.5 sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </>
          )}
        </button>
      </div>

      <nav className={cn("flex-1 overflow-y-auto pb-4", compact ? "px-2" : "px-3")} aria-label="Tools">
        <Link
          href="/"
          onClick={onMobileClose}
          title={compact ? "All tools" : undefined}
          className={cn(
            "mb-2 flex h-8 items-center rounded-lg text-sm transition-colors",
            compact ? "justify-center px-0" : "px-2.5",
            pathname === "/" ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
          )}
        >
          {compact ? <span className="font-mono text-[11px]">{tools.length}</span> : "All tools"}
          {compact ? null : <span className="ml-auto font-mono text-[11px] text-fg-subtle">{tools.length}</span>}
        </Link>

        {favoriteTools.length ? (
          <div className="mb-3">
            {compact ? (
              <div className="my-2 border-t" />
            ) : (
              <div className="flex items-center gap-1 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                <Star className="h-3 w-3" /> Favorites
              </div>
            )}
            <ul className="space-y-0.5">
              {favoriteTools.map((tool) => (
                <li key={tool.id}>
                  <NavItem tool={tool} compact={compact} active={pathname === tool.href} onClick={onMobileClose} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recentTools.length ? (
          <div className="mb-3">
            {compact ? <div className="my-2 border-t" /> : <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Recent</div>}
            <ul className="space-y-0.5">
              {recentTools.map((tool) => (
                <li key={tool.id}>
                  <NavItem tool={tool} compact={compact} active={pathname === tool.href} onClick={onMobileClose} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {compact ? (
          <>
            <div className="my-2 border-t" />
            <ul className="space-y-0.5">
              {categories.map((category) => (
                <li key={category}>
                  <Link
                    href={`/?category=${encodeURIComponent(category)}`}
                    onClick={onMobileClose}
                    title={category}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-lg font-mono text-[11px] transition-colors",
                      currentCategory === category ? "bg-accent-soft text-fg" : "text-fg-subtle hover:bg-surface-hover hover:text-fg",
                    )}
                  >
                    {category.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Categories</div>
            {categories.map((category) => (
              <CategorySection
                key={category}
                category={category}
                open={openCategories.includes(category) || currentCategory === category}
                activeCategory={currentCategory === category}
                pathname={pathname}
                onMobileClose={onMobileClose}
              />
            ))}
          </>
        )}
      </nav>

      <InstallButton compact={compact} />
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-bg-elevated transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {nav(collapsed)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-bg-elevated shadow-2xl animate-fade-in">{nav(false)}</aside>
        </div>
      ) : null}
    </>
  );
}
