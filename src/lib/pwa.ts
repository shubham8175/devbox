"use client";

import { useSyncExternalStore } from "react";

/**
 * Runtime (non-persisted) PWA state: connectivity, service worker updates and
 * install availability. Mirrors the useSyncExternalStore pattern in
 * lib/store.ts, but nothing here touches localStorage; it is all live
 * browser/OS state shared across whichever components read it.
 */

type Listener = () => void;

function makeEmitter() {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit() {
      listeners.forEach((l) => l());
    },
  };
}

// ---------- Online / offline ----------

const onlineEmitter = makeEmitter();
if (typeof window !== "undefined") {
  window.addEventListener("online", onlineEmitter.emit);
  window.addEventListener("offline", onlineEmitter.emit);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    onlineEmitter.subscribe,
    () => navigator.onLine,
    () => true,
  );
}

// ---------- Service worker updates ----------

let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;
const updateEmitter = makeEmitter();

/** Called by ServiceWorkerRegister once it sees an installed worker waiting to activate. */
export function setWaitingWorker(worker: ServiceWorker | null) {
  waitingWorker = worker;
  updateEmitter.emit();
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    updateEmitter.subscribe,
    () => waitingWorker !== null,
    () => false,
  );
}

/**
 * Tells the waiting worker to activate. ServiceWorkerRegister reloads the page
 * on the resulting `controllerchange`, but only because this flag is set: the
 * very first install also fires that event (the worker claims open pages) and
 * must not reload a page someone is typing into.
 */
export function applyUpdate() {
  if (!waitingWorker) return;
  updateRequested = true;
  waitingWorker.postMessage("SKIP_WAITING");
}

export function wasUpdateRequested(): boolean {
  return updateRequested;
}

// ---------- Install prompt ----------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the page runs as an installed app (home screen / dock) rather than in a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installed = isStandaloneDisplay();
const installEmitter = makeEmitter();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    installEmitter.emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredInstallPrompt = null;
    installEmitter.emit();
  });
}

export type InstallState = "installed" | "prompt" | "manual";

/** What to tap in browsers that have no install prompt API (state "manual"). */
export function manualInstallHint(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return "Tap Share, then \u201CAdd to Home Screen\u201D.";
  if (/Android/.test(ua)) return "Open the browser menu and choose \u201CAdd to Home screen\u201D or \u201CInstall app\u201D.";
  return "Look for \u201CInstall\u201D or \u201CAdd to Dock\u201D in your browser\u2019s address bar or menu.";
}

function installSnapshot(): InstallState {
  if (installed) return "installed";
  return deferredInstallPrompt ? "prompt" : "manual";
}

/**
 * - "prompt": Chromium fired `beforeinstallprompt`; `promptInstall()` opens the native dialog.
 * - "manual": no prompt API (Safari on iOS, Firefox); the UI shows how to add to the home screen.
 * - "installed": already running standalone, or installed during this session.
 * The server snapshot is "manual" so static HTML and the first client render match.
 */
export function usePwaInstall() {
  const state = useSyncExternalStore(installEmitter.subscribe, installSnapshot, () => "manual" as InstallState);

  const promptInstall = async () => {
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") installed = true;
    installEmitter.emit();
  };

  return { state, promptInstall };
}
