"use client";

import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { useCommandPalette } from "@/components/layout/command-palette-context";

export function MobileHeader({ onMenu }: { onMenu: () => void }) {
  const { open } = useCommandPalette();
  return (
    <header className="glass sticky top-0 z-30 flex min-h-13 items-center justify-between gap-2 border-b px-3 pt-[env(safe-area-inset-top)] lg:hidden">
      <button
        type="button"
        onClick={onMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/" className="flex min-w-0 items-center gap-2">
        <Logo className="h-6 w-6" />
        <span className="text-sm font-semibold tracking-tight">DevBox</span>
      </Link>
      <button
        type="button"
        onClick={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
        aria-label="Search tools"
      >
        <Search className="h-4.5 w-4.5" />
      </button>
    </header>
  );
}
