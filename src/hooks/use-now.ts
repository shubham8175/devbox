"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Current time, re-rendering every `intervalMs`. Returns null on the server
 * and during hydration so server and client markup match.
 */
export function useNow(intervalMs = 1000): Date | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  const getSnapshot = useCallback(() => Math.floor(Date.now() / intervalMs) * intervalMs, [intervalMs]);
  const ms = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  return useMemo(() => (ms === 0 ? null : new Date(ms)), [ms]);
}
