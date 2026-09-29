import { REPO_URL } from "@/lib/site";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.064 2.064 0 1 1 0-4.128 2.064 2.064 0 0 1 0 4.128zM7.119 20.452H3.554V9h3.565v11.452z" />
    </svg>
  );
}

const linkClass = "inline-flex items-center gap-1 text-fg-subtle transition-colors hover:text-fg";

/**
 * Small, muted personal attribution shown in the global footer. The GitHub
 * link is also where the README explains how to install DevBox on a phone or
 * as a desktop app, so it is labelled for that.
 */
export function AboutFooter() {
  return (
    <div className="mt-1 flex flex-col items-center gap-0.5 border-t pt-2">
      <p>
        <span className="font-medium text-fg-muted">Built by Shubham</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
          <GithubIcon className="h-3.5 w-3.5" />
          Source &amp; install guide
        </a>
        <a href="https://www.linkedin.com/in/shubham8175/" target="_blank" rel="noopener noreferrer" className={linkClass}>
          <LinkedinIcon className="h-3.5 w-3.5" />
          LinkedIn
        </a>
      </div>
    </div>
  );
}
