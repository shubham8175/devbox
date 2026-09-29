"use client";

import { useSyncExternalStore } from "react";
import { createStore } from "@/lib/store";
import { isNoteArray, type Note } from "@/lib/tools/scratchpad";

/**
 * Opt-in persistence for the Scratchpad tool. Nothing is written to
 * localStorage until the user turns on "Keep notes in this browser"; turning
 * it off deletes the stored notes again. This is the only place in DevBox
 * that persists user content.
 */
export const SCRATCHPAD_ENABLED_KEY = "devbox-scratchpad-enabled";
export const SCRATCHPAD_NOTES_KEY = "devbox-scratchpad-notes";

const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

const enabledStore = createStore<boolean>(SCRATCHPAD_ENABLED_KEY, false, isBoolean);
const notesStore = createStore<Note[]>(SCRATCHPAD_NOTES_KEY, [], isNoteArray);

export function useScratchpadEnabled(): boolean {
  return useSyncExternalStore(enabledStore.subscribe, enabledStore.get, enabledStore.getServer);
}

export function useScratchpadNotes(): Note[] {
  return useSyncExternalStore(notesStore.subscribe, notesStore.get, notesStore.getServer);
}

export function isScratchpadEnabled(): boolean {
  return enabledStore.get();
}

/** Notes currently in storage, or [] when persistence is off (or on the server). */
export function readStoredNotes(): Note[] {
  return enabledStore.get() ? notesStore.get() : [];
}

/** Remove every stored note. Persistence stays in whatever state it was. */
export function clearScratchpad(): void {
  notesStore.remove();
}

/** Turning persistence off also deletes the stored notes, so nothing lingers on the device. */
export function setScratchpadEnabled(enabled: boolean, notes?: Note[]): void {
  if (!enabled) {
    clearScratchpad();
    enabledStore.remove();
    return;
  }
  enabledStore.set(true);
  if (notes) notesStore.set(notes);
}

/** Mirror the in-memory notes to storage; a no-op unless the user opted in. */
export function saveNotes(notes: Note[]): void {
  if (!enabledStore.get()) return;
  notesStore.set(notes);
}
