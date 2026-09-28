function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.064 2.064 0 1 1 0-4.128 2.064 2.064 0 0 1 0 4.128zM7.119 20.452H3.554V9h3.565v11.452z" />
    </svg>
  );
}

/** Small, muted personal attribution shown in the global footer. */
export function AboutFooter() {
  return (
    <div className="mt-1 flex flex-col items-center gap-0.5 border-t pt-2">
      <p>
        <span className="font-medium text-fg-muted">Built by Shubham</span>
      </p>
      <a
        href="https://www.linkedin.com/in/shubham8175/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-fg-subtle transition-colors hover:text-fg"
      >
        <LinkedinIcon className="h-3.5 w-3.5" />
        LinkedIn
      </a>
    </div>
  );
}
