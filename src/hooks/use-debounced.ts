"use client";

import { useEffect, useState } from "react";

/** Returns `value` after it has been stable for `delayMs`. Useful for sliders driving expensive work. */
export function useDebounced<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
