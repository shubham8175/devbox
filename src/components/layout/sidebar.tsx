"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LayoutGrid, PanelLeftClose, PanelLeftOpen, Search, Star, X } from "lucide-react";
import { categories, categoryIcons, getTool, tools, toolsByCategory } from "@/data/tools";
import { useCommandPalette } from "@/components/layout/command-palette-context";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { InstallButton } from "@/components/pwa/install-button";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { Kbd } from "@/components/ui/kbd";
import { toggleCategoryOpen, toggleSidebarCollapsed, useFavorites, useOpenCategories, useRecents, useSidebarCollapsed } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ToolCategory, ToolWithRoute } from "@/types/tool";

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const sectionLabel = "flex items-center gap-1 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-subtle";

function NavItem({ tool, compact, active, onClick }: { tool: ToolWithRoute; compact: boolean; active: boolean; onClick: () => void }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={compact ? tool.name : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg text-[13px] transition-colors",
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
  const Icon = categoryIcons[category];
  return (
    <div>
      <button
        type="button"
        onClick={() => toggleCategoryOpen(category, !open)}
        aria-expanded={open}
        className={cn(
          "group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors cursor-pointer hover:bg-surface-hover hover:text-fg",
          activeCategory ? "text-fg" : "text-fg-muted",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0 transition-colors", activeCategory ? "text-accent-strong" : "text-fg-subtle group-hover:text-fg-muted")} />
        <span className="truncate">{category}</span>
        <span className="ml-auto font-mono text-[10px] text-fg-subtle">{items.length}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform duration-150", open && "rotate-90")} />
      </button>
      {open ? (
        <ul className="my-1 ml-[18px] space-y-0.5 border-l pl-2">
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

/**
 * Collapsed rail: one icon per category. Hovering or focusing an icon opens a
 * flyout with that category's tools, so the rail is navigable without expanding.
 */
function RailCategory({
  category,
  active,
  pathname,
  open,
  onOpen,
  onClose,
  onNavigate,
}: {
  category: ToolCategory;
  active: boolean;
  pathname: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const Icon = categoryIcons[category];
  const items = toolsByCategory(category);
  const ref = useRef<HTMLLIElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Anchor the fixed panel to the rail item and keep it inside the viewport,
  // re-running whenever the rail scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = ref.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const aside = anchor.closest("aside")?.getBoundingClientRect();
      const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      panel.style.left = `${aside?.right ?? rect.right}px`;
      panel.style.top = `${Math.min(rect.top, maxTop)}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <li
      ref={ref}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onFocus={onOpen}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <Link
        href={`/?category=${encodeURIComponent(category)}`}
        onClick={onNavigate}
        aria-label={category}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center justify-center rounded-lg transition-colors",
          active || open ? "bg-accent-soft text-accent-strong" : "text-fg-subtle hover:bg-surface-hover hover:text-fg",
        )}
      >
        <Icon className="h-4 w-4" />
      </Link>
      {open ? (
        <div ref={panelRef} className="fixed z-50 pl-2">
          <div className="w-60 rounded-xl border bg-bg-elevated p-1.5 shadow-2xl animate-fade-in">
            <div className={cn(sectionLabel, "justify-between")}>
              <span className="flex items-center gap-1.5">
                <Icon className="h-3 w-3" /> {category}
              </span>
              <span className="font-mono normal-case tracking-normal">{items.length}</span>
            </div>
            <ul className="max-h-[min(70vh,28rem)] space-y-0.5 overflow-y-auto overscroll-contain">
              {items.map((tool) => (
                <li key={tool.id}>
                  <NavItem tool={tool} compact={false} active={pathname === tool.href} onClick={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const drawerRef = useRef<HTMLElement>(null);
  const desktopRef = useRef<HTMLElement>(null);
  const [flyout, setFlyout] = useState<ToolCategory | null>(null);

  // Mobile drawer: lock page scroll, move focus in, and restore it on close.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])"),
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", trap);
      previous?.focus?.();
    };
  }, [mobileOpen]);
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

  // Keep the current tool visible in a list this long, on load and after palette / shortcut navigation.
  useEffect(() => {
    setFlyout(null);
    for (const root of [desktopRef.current, drawerRef.current]) {
      root?.querySelector<HTMLElement>('nav [aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [pathname, collapsed, mobileOpen]);

  const closeFlyout = () => setFlyout(null);

  const nav = (compact: boolean) => (
    <>
      <div className={cn("flex shrink-0 items-center pt-4 pb-3", compact ? "flex-col gap-2 px-2" : "justify-between px-4")}>
        <Link href="/" className="flex items-center gap-2.5" onClick={onMobileClose} title="DevBox home">
          <Logo />
          {compact ? null : <span className="text-sm font-semibold tracking-tight">DevBox</span>}
        </Link>
        <div className={cn("flex items-center gap-1", compact && "flex-col")}>
          <OfflineIndicator compact={compact} />
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

      <div className={cn("shrink-0 pb-3", compact ? "px-2" : "px-3")}>
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

      <nav
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4", compact ? "px-2" : "px-3")}
        aria-label="Tools"
      >
        <Link
          href="/"
          onClick={onMobileClose}
          title={compact ? `All tools (${tools.length})` : undefined}
          aria-current={pathname === "/" ? "page" : undefined}
          className={cn(
            "group mb-2 flex h-8 items-center gap-2.5 rounded-lg text-[13px] transition-colors",
            compact ? "justify-center px-0" : "px-2.5",
            pathname === "/" ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
          )}
        >
          <LayoutGrid className={cn("h-4 w-4 shrink-0 transition-colors", pathname === "/" ? "text-accent-strong" : "text-fg-subtle group-hover:text-fg-muted")} />
          {compact ? null : (
            <>
              <span>All tools</span>
              <span className="ml-auto font-mono text-[10px] text-fg-subtle">{tools.length}</span>
            </>
          )}
        </Link>

        {favoriteTools.length ? (
          <div className="mb-3">
            {compact ? (
              <div className="my-2 border-t" />
            ) : (
              <div className={sectionLabel}>
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
        ) : compact ? null : (
          <p className="mb-3 flex items-center gap-1.5 px-2.5 text-[11px] text-fg-subtle">
            <Star className="h-3 w-3 shrink-0" /> Star a tool to pin it here
          </p>
        )}

        {recentTools.length ? (
          <div className="mb-3">
            {compact ? <div className="my-2 border-t" /> : <div className={sectionLabel}>Recent</div>}
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
                <RailCategory
                  key={category}
                  category={category}
                  active={currentCategory === category}
                  pathname={pathname}
                  open={flyout === category}
                  onOpen={() => setFlyout(category)}
                  onClose={closeFlyout}
                  onNavigate={() => {
                    closeFlyout();
                    onMobileClose();
                  }}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className={sectionLabel}>Categories</div>
            <div className="space-y-0.5">
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
            </div>
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
        ref={desktopRef}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-bg-elevated transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {nav(collapsed)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
          <aside
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-bg-elevated pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-2xl animate-fade-in"
          >
            {nav(false)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
