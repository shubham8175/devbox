import { Fragment } from "react";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps every occurrence of the query terms in <mark>. */
export function Highlight({ text, query, className }: { text: string; query: string; className?: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map(escapeRegExp);
  if (!terms.length) return <span className={className}>{text}</span>;
  const splitter = new RegExp(`(${terms.join("|")})`, "ig");
  const isMatch = new RegExp(`^(?:${terms.join("|")})$`, "i");
  const parts = text.split(splitter);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        isMatch.test(part) ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-accent-strong">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
