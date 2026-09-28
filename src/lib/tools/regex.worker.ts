/// <reference lib="webworker" />
import { runRegex } from "./regex";

/**
 * Runs user regular expressions off the main thread. The tool terminates this
 * worker if a pattern takes too long (catastrophic backtracking), which keeps
 * the page responsive. Nothing here touches the network or storage.
 */
export interface RegexWorkerRequest {
  id: number;
  pattern: string;
  flags: string;
  text: string;
}

self.onmessage = (e: MessageEvent<RegexWorkerRequest>) => {
  const { id, pattern, flags, text } = e.data;
  self.postMessage({ id, result: runRegex(pattern, flags, text) });
};
