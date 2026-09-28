"use client";

import { useEffect, useRef, useState } from "react";
import { runRegex, type RegexResult } from "@/lib/tools/regex";

/** Wall-clock budget for one evaluation before the worker is killed. */
export const REGEX_TIMEOUT_MS = 1500;
const DEBOUNCE_MS = 120;

function emptyResult(text: string): RegexResult {
  return { ok: true, matches: [], segments: [{ text, matchIndex: null }] };
}

/**
 * Evaluates a pattern in a Web Worker with a timeout, so catastrophic
 * backtracking cannot freeze the tab. Falls back to synchronous evaluation
 * when workers are unavailable (still capped by pattern/match limits).
 */
export function useRegexWorker(pattern: string, flags: string, text: string): { result: RegexResult; running: boolean } {
  const [result, setResult] = useState<RegexResult>(() => emptyResult(text));
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Empty pattern: nothing to evaluate; the derived return value below handles display.
    if (!pattern) return;
    const id = ++requestId.current;
    const debounce = setTimeout(() => {
      if (typeof Worker === "undefined") {
        setResult(runRegex(pattern, flags, text));
        return;
      }
      setRunning(true);
      let worker = workerRef.current;
      if (!worker) {
        worker = new Worker(new URL("../lib/tools/regex.worker.ts", import.meta.url));
        workerRef.current = worker;
      }
      const timeout = setTimeout(() => {
        // Kill the runaway evaluation and start fresh for the next request.
        worker?.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        if (id === requestId.current) {
          setRunning(false);
          setResult({
            ok: false,
            error: `Evaluation stopped after ${REGEX_TIMEOUT_MS / 1000}s. The pattern is probably backtracking catastrophically on this input.`,
            matches: [],
            segments: [{ text, matchIndex: null }],
          });
        }
      }, REGEX_TIMEOUT_MS);
      worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
        if (e.data.id !== id) return;
        clearTimeout(timeout);
        setRunning(false);
        setResult(e.data.result);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        if (id !== requestId.current) return;
        setRunning(false);
        setResult(runRegex(pattern, flags, text));
      };
      worker.postMessage({ id, pattern, flags, text });
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounce);
  }, [pattern, flags, text]);

  if (!pattern) return { result: emptyResult(text), running: false };
  return { result, running };
}
