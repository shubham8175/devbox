"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed store for UI preferences (favorites, recent tools,
 * sidebar state). Only tool ids and booleans go through the stores in this
 * file. The one exception is the Scratchpad (see scratchpad-store.ts), which
 * reuses this helper and only writes after the user explicitly opts in.
 */
export function createStore<T>(key: string, fallback: T, validate: (v: unknown) => v is T) {
  let cached: T = fallback;
  let cachedRaw: string | null | undefined;
  const listeners = new Set<() => void>();

  const get = (): T => {
    if (typeof window === "undefined") return fallback;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (raw === null) {
      cached = fallback;
      return cached;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      cached = validate(parsed) ? parsed : fallback;
    } catch {
      cached = fallback;
    }
    return cached;
  };

  const set = (value: T) => {
    cached = value;
    try {
      const raw = JSON.stringify(value);
      cachedRaw = raw;
      localStorage.setItem(key, raw);
    } catch {
      // storage unavailable; keep the in-memory value
    }
    listeners.forEach((l) => l());
  };

  /** Delete the key entirely (used when a user withdraws opt-in persistence). */
  const remove = () => {
    cached = fallback;
    cachedRaw = null;
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable; nothing to delete
    }
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  const getServer = () => fallback;
  return { get, set, remove, subscribe, getServer };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

const favoritesStore = createStore<string[]>("devbox-favorites", [], isStringArray);
const recentsStore = createStore<string[]>("devbox-recents", [], isStringArray);
const sidebarStore = createStore<boolean>("devbox-sidebar-collapsed", false, isBoolean);
/** Categories the user has explicitly expanded/collapsed in the sidebar (UI preference only). */
const openCategoriesStore = createStore<string[]>("devbox-sidebar-open-categories", [], isStringArray);

export function useFavorites(): string[] {
  return useSyncExternalStore(favoritesStore.subscribe, favoritesStore.get, favoritesStore.getServer);
}
export function useRecents(): string[] {
  return useSyncExternalStore(recentsStore.subscribe, recentsStore.get, recentsStore.getServer);
}
export function useOpenCategories(): string[] {
  return useSyncExternalStore(openCategoriesStore.subscribe, openCategoriesStore.get, openCategoriesStore.getServer);
}
export function toggleCategoryOpen(category: string, open?: boolean) {
  const current = openCategoriesStore.get();
  const isOpen = current.includes(category);
  const next = open ?? !isOpen;
  if (next === isOpen) return;
  openCategoriesStore.set(next ? [...current, category] : current.filter((c) => c !== category));
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(sidebarStore.subscribe, sidebarStore.get, sidebarStore.getServer);
}

export function toggleFavorite(id: string) {
  const current = favoritesStore.get();
  favoritesStore.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
}

export function recordRecent(id: string, limit = 8) {
  const current = recentsStore.get();
  if (current[0] === id) return;
  recentsStore.set([id, ...current.filter((x) => x !== id)].slice(0, limit));
}

export function setSidebarCollapsed(collapsed: boolean) {
  sidebarStore.set(collapsed);
}
export function toggleSidebarCollapsed() {
  sidebarStore.set(!sidebarStore.get());
}
