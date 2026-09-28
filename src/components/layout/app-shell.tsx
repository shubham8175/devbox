"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { AboutFooter } from "@/components/layout/about-footer";
import { MobileHeader } from "@/components/layout/mobile-header";
import { CommandPalette } from "@/components/command-palette";
import { CommandPaletteContext } from "@/components/layout/command-palette-context";
import { ToastProvider } from "@/components/ui/toast";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { UpdateBanner } from "@/components/pwa/update-banner";
import { tools } from "@/data/tools";
import { toggleSidebarCollapsed } from "@/lib/store";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Registry-defined two-key sequences like "g j" → route. */
const sequenceRoutes = new Map<string, string>();
for (const t of tools) if (t.shortcut) sequenceRoutes.set(t.shortcut.toLowerCase(), t.href);
sequenceRoutes.set("g h", "/");

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();

  // Global shortcuts: ⌘K / Ctrl+K palette, ⌘B / Ctrl+B sidebar, "/" search, "g <key>" sequences, Esc closes overlays
  useEffect(() => {
    let pendingPrefix: string | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (!mod && !e.altKey && !isEditable(e.target)) {
        if (pendingPrefix) {
          const seq = `${pendingPrefix} ${key}`;
          pendingPrefix = null;
          if (pendingTimer) clearTimeout(pendingTimer);
          const href = sequenceRoutes.get(seq);
          if (href) {
            e.preventDefault();
            router.push(href);
            return;
          }
        } else if (key === "g") {
          pendingPrefix = "g";
          pendingTimer = setTimeout(() => {
            pendingPrefix = null;
          }, 1200);
          return;
        }
      }
      if (mod && key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && key === "b") {
        e.preventDefault();
        toggleSidebarCollapsed();
      } else if (e.key === "/" && !mod && !isEditable(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (pendingTimer) clearTimeout(pendingTimer);
    };
  }, [router]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <ToastProvider>
      <CommandPaletteContext.Provider value={{ open: openPalette }}>
        <div className="flex flex-1">
          <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileHeader onMenu={() => setMobileNavOpen(true)} />
            <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 lg:px-10">{children}</main>
            <footer className="flex flex-col items-center gap-1.5 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-[11px] text-fg-subtle sm:px-8">
              <OfflineIndicator />
              <span>Your data stays in your browser. Nothing is uploaded or stored.</span>
              <AboutFooter />
            </footer>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <ServiceWorkerRegister />
        <UpdateBanner />
      </CommandPaletteContext.Provider>
    </ToastProvider>
  );
}
