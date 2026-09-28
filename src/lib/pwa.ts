"use client";

import { useSyncExternalStore } from "react";

/**
 * Runtime (non-persisted) PWA state: connectivity, service worker updates,
 * and install availability. Mirrors the useSyncExternalStore pattern in
 * lib/store.ts, but nothing here touches localStorage — it's all live
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
const updateEmitter = makeEmitter();

/** Called by the register component once it sees an installed worker waiting to activate. */
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

/** Tells the waiting worker to activate. It reloads the page itself via the controllerchange listener. */
export function applyUpdate() {
  waitingWorker?.postMessage("SKIP_WAITING");
}

// ---------- Install prompt ----------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
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

export function usePwaInstall() {
  const available = useSyncExternalStore(
    installEmitter.subscribe,
    () => deferredInstallPrompt !== null && !installed,
    () => false,
  );

  const promptInstall = async () => {
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") installed = true;
    installEmitter.emit();
  };

  return { available, promptInstall };
}
