"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

/** A link shown after the message. Toasts with an action stay longer so it can be clicked. */
export interface ToastAction {
  label: string;
  href: string;
}

interface Toast {
  id: number;
  message: string;
  tone: Tone;
  action?: ToastAction;
  leaving?: boolean;
}

interface ToastApi {
  toast: (message: string, tone?: Tone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<Tone, typeof Info> = { success: CheckCircle2, error: AlertCircle, info: Info };
const TONES: Record<Tone, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent-strong",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 160);
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = "success", action?: ToastAction) => {
      const id = ++counter.current;
      setToasts((t) => [...t.slice(-3), { id, message, tone, action }]);
      setTimeout(() => dismiss(id), action ? 8000 : 2200);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-[max(1rem,env(safe-area-inset-right))]"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex max-w-full items-center gap-2 rounded-lg border border-border-strong bg-surface/95 px-3 py-2 text-sm text-fg shadow-lg backdrop-blur sm:max-w-sm",
                t.leaving ? "animate-toast-out" : "animate-toast-in",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", TONES[t.tone])} />
              <span className="min-w-0 break-words">{t.message}</span>
              {t.action ? (
                <a
                  href={t.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 shrink-0 whitespace-nowrap font-medium text-accent-strong underline-offset-2 hover:underline"
                >
                  {t.action.label}
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
