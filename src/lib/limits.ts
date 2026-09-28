/**
 * Shared input limits. Every tool processes text synchronously in the user's
 * browser, so inputs are capped to keep the page responsive rather than to
 * protect any server (there is none).
 */

/** Maximum characters accepted by the shared Textarea / CodeTextarea (about 2 MB of ASCII). */
export const MAX_TEXT_INPUT = 2_000_000;

/** Maximum length of a user-supplied regular expression pattern. */
export const MAX_PATTERN_LENGTH = 2_000;

export function formatChars(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
