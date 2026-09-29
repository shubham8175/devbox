import { Suspense } from "react";
import type { Metadata } from "next";
import { ShieldCheck, UserX, Wrench, Zap } from "lucide-react";
import { ToolSearch } from "@/components/home/tool-search";
import { HeroAppPill } from "@/components/desktop/hero-app-pill";
import { tools } from "@/data/tools";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Why each benefit is worded this way: the only network request any tool can
// make is the Open Graph preview's "Load remote image" button, which fetches a
// URL the user typed after an explicit click. Pasted text and dropped files are
// never sent anywhere (see DOCS.md §12), so "uploaded" is the accurate claim.
const highlights = [
  { icon: Zap, label: `${tools.length} tools, one search`, tone: "text-accent-strong" },
  { icon: ShieldCheck, label: "Nothing you paste is uploaded", tone: "text-success" },
  { icon: UserX, label: "No account required", tone: "text-fg-subtle" },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <section className="mb-7 sm:mb-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft ring-1 ring-accent/20">
            <Wrench className="h-4 w-4 text-accent-strong" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">DevBox</span>
        </div>

        <h1 className="mt-4 max-w-3xl text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-4xl">
          Developer tools that run in your browser.
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base">
          Format JSON, inspect an API response, test a regex, decode a JWT, or convert JSON to CSV.
          Search for the task below, or open a popular tool and paste your input.
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {highlights.map(({ icon: Icon, label, tone }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted shadow-card"
            >
              <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
              {label}
            </li>
          ))}
          <HeroAppPill />
        </ul>
      </section>

      <Suspense fallback={<div className="h-12 skeleton" />}>
        <ToolSearch />
      </Suspense>
    </div>
  );
}
